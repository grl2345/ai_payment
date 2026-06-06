import fs from "fs";
import path from "path";
import { tryCrossAutoApprove } from "@/lib/import/auto-review";
import {
  dedupeInboundRecordsForInsert,
  dedupeMeasureTicketsForInsert,
  normalizeTicketNo,
} from "@/lib/import/ticket-uniqueness";
import {
  buildInboundIndexByTicketNo,
  computeTicketMatches,
} from "@/lib/import/ticket-matching";
import {
  removePaymentByMatchId,
  syncAllVerifiedPayments,
  syncPaymentForMatch,
} from "@/lib/import/payment-generation";
import {
  DATA_DIR,
  migrateLegacyStoreIfNeeded,
  readSplitStore,
  writeSplitStore,
  writeSplitStoreKey,
} from "@/lib/db/data-files";
import type { AdoptableField } from "@/lib/import/ai-suggestions";
import type {
  DataStore,
  InboundRecord,
  MeasureTicket,
  TicketMatch,
  UploadedFileRecord,
} from "@/lib/types";

const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const MEASURE_DIR = path.join(UPLOAD_DIR, "measure");
const INBOUND_DIR = path.join(UPLOAD_DIR, "inbound");

const EMPTY_STORE: DataStore = {
  uploads: [],
  measureTickets: [],
  inboundRecords: [],
  ticketMatches: [],
  paymentDetails: [],
  vehicleSettlementRules: [],
};

function ensureDirs() {
  [DATA_DIR, UPLOAD_DIR, MEASURE_DIR, INBOUND_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

function normalizeStore(store: DataStore): DataStore {
  store.measureTickets = store.measureTickets.map((ticket) => {
    let ocrStatus = ticket.ocrStatus;
    if ((ocrStatus as string) === "识别成功") ocrStatus = "待审核";
    if ((ocrStatus as string) === "正式成功") ocrStatus = "已审核";
    return { ...ticket, ocrStatus };
  });
  store.inboundRecords = store.inboundRecords.map((record) => ({
    ...record,
    reviewStatus: record.reviewStatus ?? "待审核",
  }));
  store.vehicleSettlementRules = store.vehicleSettlementRules ?? [];
  return store;
}

function readStore(): DataStore {
  ensureDirs();
  migrateLegacyStoreIfNeeded();
  return normalizeStore(readSplitStore());
}

function writeStore(store: DataStore) {
  ensureDirs();
  writeSplitStore(normalizeStore({ ...store }));
}

export function getStore(): DataStore {
  return readStore();
}

export function saveStore(store: DataStore) {
  writeStore(store);
}

export { DATA_DIR, readSplitStore, writeSplitStore, writeSplitStoreKey };

export function generateId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function nowString() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

export function getMeasureDir() {
  ensureDirs();
  return MEASURE_DIR;
}

export function getInboundDir() {
  ensureDirs();
  return INBOUND_DIR;
}

export function getUploadFilePath(relativePath: string) {
  return path.join(DATA_DIR, relativePath);
}

export function addUpload(record: UploadedFileRecord) {
  const store = readStore();
  store.uploads.unshift(record);
  writeStore(store);
  return record;
}

export function updateUpload(
  id: string,
  patch: Partial<UploadedFileRecord>
) {
  const store = readStore();
  const index = store.uploads.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.uploads[index] = { ...store.uploads[index], ...patch };
  writeStore(store);
  return store.uploads[index];
}

export function deleteUpload(id: string) {
  const store = readStore();
  const upload = store.uploads.find((item) => item.id === id);
  if (!upload) return false;

  if (upload.storedPath && fs.existsSync(getUploadFilePath(upload.storedPath))) {
    fs.unlinkSync(getUploadFilePath(upload.storedPath));
  }

  store.uploads = store.uploads.filter((item) => item.id !== id);
  store.measureTickets = store.measureTickets.filter((item) => item.uploadId !== id);
  store.inboundRecords = store.inboundRecords.filter((item) => item.uploadId !== id);
  syncMatches(store);
  writeStore(store);
  return true;
}

export function clearCompletedUploads() {
  const store = readStore();
  const completedIds = store.uploads
    .filter((item) => item.status === "已完成")
    .map((item) => item.id);

  store.uploads = store.uploads.filter((item) => item.status !== "已完成");
  writeStore(store);
  return completedIds.length;
}

/**
 * 清空业务数据（不影响车辆结算档案）。
 * 用于把计量单/采购单/匹配/付款明细/上传记录整体归零。
 */
export function clearBusinessData() {
  const store = readStore();
  store.uploads = [];
  store.measureTickets = [];
  store.inboundRecords = [];
  store.ticketMatches = [];
  store.paymentDetails = [];
  writeStore(store);

  // 同时清空已落盘的上传文件目录
  try {
    ensureDirs();
    if (fs.existsSync(UPLOAD_DIR)) {
      fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    }
  } catch {
    /* 清理失败不阻断数据归零 */
  } finally {
    // 重新创建目录，避免后续写入失败
    try {
      ensureDirs();
    } catch {
      /* ignore */
    }
  }
}

export function addMeasureTicket(ticket: MeasureTicket) {
  const { inserted } = addMeasureTickets([ticket]);
  return inserted[0] ?? null;
}

export function addMeasureTickets(tickets: MeasureTicket[]) {
  const store = readStore();
  const { toInsert, skipped } = dedupeMeasureTicketsForInsert(
    tickets,
    store.measureTickets
  );
  if (toInsert.length > 0) {
    store.measureTickets.unshift(...toInsert);
    syncMatches(store);
    writeStore(store);
  }
  return { inserted: toInsert, skipped };
}

export function updateMeasureTicket(
  id: string,
  patch: Partial<MeasureTicket>
) {
  const store = readStore();
  const index = store.measureTickets.findIndex((item) => item.id === id);
  if (index === -1) return null;

  store.measureTickets[index] = {
    ...store.measureTickets[index],
    ...patch,
    updatedAt: nowString(),
  };
  syncMatches(store);
  writeStore(store);
  return store.measureTickets[index];
}

export function confirmMeasureTicket(id: string, patch: Partial<MeasureTicket> = {}) {
  return updateMeasureTicket(id, {
    ...patch,
    ocrStatus: "已审核",
    reviewSource: "manual",
    reviewHint: "人工确认",
  });
}

export function deleteMeasureTicket(id: string) {
  const store = readStore();
  const ticket = store.measureTickets.find((item) => item.id === id);
  if (!ticket) return false;

  const uploadId = ticket.uploadId;
  store.measureTickets = store.measureTickets.filter((item) => item.id !== id);
  store.ticketMatches = store.ticketMatches.filter(
    (match) => match.measureTicketId !== id
  );

  const hasOtherTickets = store.measureTickets.some(
    (item) => item.uploadId === uploadId
  );
  if (!hasOtherTickets && uploadId) {
    const upload = store.uploads.find((item) => item.id === uploadId);
    if (upload?.storedPath && fs.existsSync(getUploadFilePath(upload.storedPath))) {
      fs.unlinkSync(getUploadFilePath(upload.storedPath));
    }
    store.uploads = store.uploads.filter((item) => item.id !== uploadId);
  }

  syncMatches(store);
  writeStore(store);
  return true;
}

export function deleteInboundRecord(id: string) {
  const store = readStore();
  const record = store.inboundRecords.find((item) => item.id === id);
  if (!record) return false;

  const uploadId = record.uploadId;
  store.inboundRecords = store.inboundRecords.filter((item) => item.id !== id);
  store.ticketMatches = store.ticketMatches.filter(
    (match) => match.inboundRecordId !== id
  );

  const hasOtherRecords = store.inboundRecords.some(
    (item) => item.uploadId === uploadId
  );
  if (!hasOtherRecords && uploadId) {
    const upload = store.uploads.find((item) => item.id === uploadId);
    if (upload?.storedPath && fs.existsSync(getUploadFilePath(upload.storedPath))) {
      fs.unlinkSync(getUploadFilePath(upload.storedPath));
    }
    store.uploads = store.uploads.filter((item) => item.id !== uploadId);
  }

  syncMatches(store);
  writeStore(store);
  return true;
}

export function addInboundRecords(records: InboundRecord[]) {
  const store = readStore();
  const { toInsert, skipped } = dedupeInboundRecordsForInsert(
    records,
    store.inboundRecords
  );
  if (toInsert.length > 0) {
    store.inboundRecords.unshift(...toInsert);
    syncMatches(store);
    writeStore(store);
  }
  return { inserted: toInsert, skipped };
}

export function updateInboundRecord(id: string, patch: Partial<InboundRecord>) {
  const store = readStore();
  const index = store.inboundRecords.findIndex((item) => item.id === id);
  if (index === -1) return null;

  store.inboundRecords[index] = {
    ...store.inboundRecords[index],
    ...patch,
    updatedAt: nowString(),
  };
  syncMatches(store);
  writeStore(store);
  return store.inboundRecords[index];
}

export function confirmInboundRecord(
  id: string,
  patch: Partial<InboundRecord> = {}
) {
  return updateInboundRecord(id, {
    ...patch,
    reviewStatus: "已审核",
    reviewSource: "manual",
    reviewHint: "人工确认",
  });
}

function runCrossAutoReview(store: DataStore) {
  const inboundByTicket = buildInboundIndexByTicketNo(store.inboundRecords);
  for (let mi = 0; mi < store.measureTickets.length; mi++) {
    const measure = store.measureTickets[mi];
    const key = normalizeTicketNo(measure.ticketNo);
    if (!key) continue;
    const inbound = inboundByTicket.get(key);
    if (!inbound) continue;

    const { measure: nextMeasure, inbound: nextInbound } = tryCrossAutoApprove(
      measure,
      inbound
    );
    if (nextMeasure !== measure) {
      store.measureTickets[mi] = { ...nextMeasure, updatedAt: nowString() };
    }
    const ii = store.inboundRecords.findIndex((r) => r.id === inbound.id);
    if (ii !== -1 && nextInbound !== inbound) {
      store.inboundRecords[ii] = { ...nextInbound, updatedAt: nowString() };
    }
  }
}

function syncMatches(store: DataStore) {
  runCrossAutoReview(store);

  store.ticketMatches = computeTicketMatches(
    store.measureTickets,
    store.inboundRecords,
    store.ticketMatches
  );
}

export function confirmTicketMatch(id: string, confirmedBy = "用户") {
  const store = readStore();
  const index = store.ticketMatches.findIndex((m) => m.id === id);
  if (index === -1) return null;

  store.ticketMatches[index] = {
    ...store.ticketMatches[index],
    matchStatus: "已确认",
    confirmedBy,
    confirmedAt: nowString(),
    updatedAt: nowString(),
  };
  writeStore(store);
  try {
    syncPaymentForMatch(id, store);
  } catch {
    /* 付款明细生成失败不阻断确认 */
  }
  return store.ticketMatches[index];
}

export function voidTicketMatch(id: string) {
  const store = readStore();
  const index = store.ticketMatches.findIndex((m) => m.id === id);
  if (index === -1) return null;

  store.ticketMatches[index] = {
    ...store.ticketMatches[index],
    matchStatus: "已作废",
    updatedAt: nowString(),
  };
  writeStore(store);
  try {
    removePaymentByMatchId(id, store);
  } catch {
    /* 移除付款明细失败不阻断作废 */
  }
  return store.ticketMatches[index];
}

const ADOPT_FIELD_LABEL: Record<AdoptableField, string> = {
  plateNo: "车牌",
  driverName: "司机",
  supplierName: "供应商",
  materialType: "物料类型",
};

export type ApplyAiSuggestionPayload = {
  matchId?: string;
  action:
    | { type: "confirm" }
    | {
        type: "adoptField";
        target: "inbound" | "measure";
        field: AdoptableField;
        value: string;
        thenConfirm: boolean;
      };
  confirmedBy?: string;
};

/**
 * 应用 AI 建议：采用推荐字段值（写入对应单据）并/或确认匹配。
 * 接受建议视为人工动作，两侧单据标记为已审核。
 */
export function applyAiSuggestion(
  payload: ApplyAiSuggestionPayload
): { ok: boolean; error?: string } {
  const action = payload.action;
  const matchId = payload.matchId;
  if (!matchId) return { ok: false, error: "缺少核对记录 ID" };

  const store = readStore();
  const match = store.ticketMatches.find((m) => m.id === matchId);
  if (!match) return { ok: false, error: "核对记录不存在" };

  const measure = store.measureTickets.find(
    (m) => m.id === match.measureTicketId
  );
  const inbound = match.inboundRecordId
    ? store.inboundRecords.find((r) => r.id === match.inboundRecordId)
    : undefined;
  if (!measure || !inbound) {
    return { ok: false, error: "未关联计量单或采购入库单" };
  }

  if (action.type === "adoptField") {
    const label = ADOPT_FIELD_LABEL[action.field];
    const note = `已采用建议修正${label}为「${action.value}」`;
    if (action.target === "inbound") {
      (inbound as Record<AdoptableField, string>)[action.field] = action.value;
      inbound.reviewHint = note;
    } else {
      (measure as Record<AdoptableField, string>)[action.field] = action.value;
      measure.reviewHint = note;
    }
  }

  measure.ocrStatus = "已审核";
  measure.reviewSource = "manual";
  measure.updatedAt = nowString();
  inbound.reviewStatus = "已审核";
  inbound.reviewSource = "manual";
  inbound.updatedAt = nowString();

  syncMatches(store);
  writeStore(store);

  const shouldConfirm =
    action.type === "confirm" ||
    (action.type === "adoptField" && action.thenConfirm);
  if (shouldConfirm) {
    confirmTicketMatch(matchId, payload.confirmedBy ?? "用户");
  }

  return { ok: true };
}

/** 重新计算匹配关系（含 AI 交叉核对） */
export function rebuildMatches() {
  const store = readStore();
  syncMatches(store);
  writeStore(store);
  try {
    syncAllVerifiedPayments(getStore());
  } catch {
    /* 仅同步已确认且校验通过的付款明细 */
  }
}
