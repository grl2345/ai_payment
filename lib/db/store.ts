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
import {
  deleteUploadFile,
  normalizeStoragePath,
} from "@/lib/db/file-storage";
import {
  assertRemoteStorageConfigured,
  isServerlessEnv,
  isSupabaseEnabled,
} from "@/lib/db/supabase";
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

function ensureLocalDirs() {
  if (isSupabaseEnabled()) return;
  if (isServerlessEnv()) {
    assertRemoteStorageConfigured("读写数据");
    return;
  }
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

async function readStore(): Promise<DataStore> {
  ensureLocalDirs();
  await migrateLegacyStoreIfNeeded();
  return normalizeStore(await readSplitStore());
}

async function writeStore(store: DataStore) {
  ensureLocalDirs();
  await writeSplitStore(normalizeStore({ ...store }));
}

export async function getStore(): Promise<DataStore> {
  return readStore();
}

export async function saveStore(store: DataStore) {
  await writeStore(store);
}

export { DATA_DIR, readSplitStore, writeSplitStore, writeSplitStoreKey };

export function generateId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

export function nowString() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

export function buildMeasureStoragePath(storedName: string) {
  return normalizeStoragePath(`uploads/measure/${storedName}`);
}

export function buildInboundStoragePath(storedName: string) {
  return normalizeStoragePath(`uploads/inbound/${storedName}`);
}

export function getUploadFilePath(relativePath: string) {
  return path.join(DATA_DIR, normalizeStoragePath(relativePath));
}

export async function addUpload(record: UploadedFileRecord) {
  const store = await readStore();
  store.uploads.unshift(record);
  await writeStore(store);
  return record;
}

export async function updateUpload(
  id: string,
  patch: Partial<UploadedFileRecord>
) {
  const store = await readStore();
  const index = store.uploads.findIndex((item) => item.id === id);
  if (index === -1) return null;
  store.uploads[index] = { ...store.uploads[index], ...patch };
  await writeStore(store);
  return store.uploads[index];
}

export async function deleteUpload(id: string) {
  const store = await readStore();
  const upload = store.uploads.find((item) => item.id === id);
  if (!upload) return false;

  if (upload.storedPath) {
    await deleteUploadFile(upload.storedPath);
  }

  store.uploads = store.uploads.filter((item) => item.id !== id);
  store.measureTickets = store.measureTickets.filter((item) => item.uploadId !== id);
  store.inboundRecords = store.inboundRecords.filter((item) => item.uploadId !== id);
  syncMatches(store);
  await writeStore(store);
  return true;
}

export async function clearCompletedUploads() {
  const store = await readStore();
  const completedIds = store.uploads
    .filter((item) => item.status === "已完成")
    .map((item) => item.id);

  store.uploads = store.uploads.filter((item) => item.status !== "已完成");
  await writeStore(store);
  return completedIds.length;
}

/**
 * 清空业务数据（不影响车辆结算档案）。
 */
export async function clearBusinessData() {
  const store = await readStore();

  for (const upload of store.uploads) {
    if (upload.storedPath) {
      try {
        await deleteUploadFile(upload.storedPath);
      } catch {
        /* 清理失败不阻断 */
      }
    }
  }

  store.uploads = [];
  store.measureTickets = [];
  store.inboundRecords = [];
  store.ticketMatches = [];
  store.paymentDetails = [];
  await writeStore(store);

  if (!isSupabaseEnabled()) {
    try {
      ensureLocalDirs();
      if (fs.existsSync(UPLOAD_DIR)) {
        fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
      }
      ensureLocalDirs();
    } catch {
      /* ignore */
    }
  }
}

export async function addMeasureTicket(ticket: MeasureTicket) {
  const { inserted } = await addMeasureTickets([ticket]);
  return inserted[0] ?? null;
}

export async function addMeasureTickets(tickets: MeasureTicket[]) {
  const store = await readStore();
  const { toInsert, skipped } = dedupeMeasureTicketsForInsert(
    tickets,
    store.measureTickets
  );
  if (toInsert.length > 0) {
    store.measureTickets.unshift(...toInsert);
    syncMatches(store);
    await writeStore(store);
  }
  return { inserted: toInsert, skipped };
}

export async function updateMeasureTicket(
  id: string,
  patch: Partial<MeasureTicket>
) {
  const store = await readStore();
  const index = store.measureTickets.findIndex((item) => item.id === id);
  if (index === -1) return null;

  store.measureTickets[index] = {
    ...store.measureTickets[index],
    ...patch,
    updatedAt: nowString(),
  };
  syncMatches(store);
  await writeStore(store);
  return store.measureTickets[index];
}

export async function confirmMeasureTicket(
  id: string,
  patch: Partial<MeasureTicket> = {}
) {
  return updateMeasureTicket(id, {
    ...patch,
    ocrStatus: "已审核",
    reviewSource: "manual",
    reviewHint: "人工确认",
  });
}

export async function deleteMeasureTicket(id: string) {
  const store = await readStore();
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
    if (upload?.storedPath) {
      await deleteUploadFile(upload.storedPath);
    }
    store.uploads = store.uploads.filter((item) => item.id !== uploadId);
  }

  syncMatches(store);
  await writeStore(store);
  return true;
}

export async function deleteInboundRecord(id: string) {
  const store = await readStore();
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
    if (upload?.storedPath) {
      await deleteUploadFile(upload.storedPath);
    }
    store.uploads = store.uploads.filter((item) => item.id !== uploadId);
  }

  syncMatches(store);
  await writeStore(store);
  return true;
}

export async function addInboundRecords(records: InboundRecord[]) {
  const store = await readStore();
  const { toInsert, skipped } = dedupeInboundRecordsForInsert(
    records,
    store.inboundRecords
  );
  if (toInsert.length > 0) {
    store.inboundRecords.unshift(...toInsert);
    syncMatches(store);
    await writeStore(store);
  }
  return { inserted: toInsert, skipped };
}

export async function updateInboundRecord(id: string, patch: Partial<InboundRecord>) {
  const store = await readStore();
  const index = store.inboundRecords.findIndex((item) => item.id === id);
  if (index === -1) return null;

  store.inboundRecords[index] = {
    ...store.inboundRecords[index],
    ...patch,
    updatedAt: nowString(),
  };
  syncMatches(store);
  await writeStore(store);
  return store.inboundRecords[index];
}

export async function confirmInboundRecord(
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

export async function confirmTicketMatch(id: string, confirmedBy = "用户") {
  const store = await readStore();
  const index = store.ticketMatches.findIndex((m) => m.id === id);
  if (index === -1) return null;

  store.ticketMatches[index] = {
    ...store.ticketMatches[index],
    matchStatus: "已确认",
    confirmedBy,
    confirmedAt: nowString(),
    updatedAt: nowString(),
  };
  await writeStore(store);
  try {
    await syncPaymentForMatch(id, store);
  } catch {
    /* 付款明细生成失败不阻断确认 */
  }
  return store.ticketMatches[index];
}

export async function voidTicketMatch(id: string) {
  const store = await readStore();
  const index = store.ticketMatches.findIndex((m) => m.id === id);
  if (index === -1) return null;

  store.ticketMatches[index] = {
    ...store.ticketMatches[index],
    matchStatus: "已作废",
    updatedAt: nowString(),
  };
  await writeStore(store);
  try {
    await removePaymentByMatchId(id, store);
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

export async function applyAiSuggestion(
  payload: ApplyAiSuggestionPayload
): Promise<{ ok: boolean; error?: string }> {
  const action = payload.action;
  const matchId = payload.matchId;
  if (!matchId) return { ok: false, error: "缺少核对记录 ID" };

  const store = await readStore();
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
  await writeStore(store);

  const shouldConfirm =
    action.type === "confirm" ||
    (action.type === "adoptField" && action.thenConfirm);
  if (shouldConfirm) {
    await confirmTicketMatch(matchId, payload.confirmedBy ?? "用户");
  }

  return { ok: true };
}

/** 重新计算匹配关系（含 AI 交叉核对） */
export async function rebuildMatches() {
  const store = await readStore();
  syncMatches(store);
  await writeStore(store);
  try {
    await syncAllVerifiedPayments(await getStore());
  } catch {
    /* 仅同步已确认且校验通过的付款明细 */
  }
}
