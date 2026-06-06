import type { InboundRecord, MeasureTicket, TicketMatch } from "@/lib/types";
import { normalizeTicketNo } from "@/lib/import/ticket-uniqueness";

export { normalizeTicketNo };

function generateId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function nowString() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function compareWeight(a: number, b: number) {
  return Math.abs(a - b) <= 50;
}

/** 按规范化磅单号建立入库单索引（优先已审核，其次更新时间较新） */
export function buildInboundIndexByTicketNo(
  records: InboundRecord[]
): Map<string, InboundRecord> {
  const map = new Map<string, InboundRecord>();

  for (const record of records) {
    const key = normalizeTicketNo(record.ticketNo);
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, record);
      continue;
    }

    const preferNew =
      (existing.reviewStatus !== "已审核" &&
        record.reviewStatus === "已审核") ||
      (existing.reviewStatus === record.reviewStatus &&
        record.updatedAt > existing.updatedAt);

    if (preferNew) {
      map.set(key, record);
    }
  }

  return map;
}

/**
 * 根据磅单号关联计量单与入库单，再校验供应商/车牌/重量
 */
export function buildTicketMatch(
  measure: MeasureTicket,
  inbound: InboundRecord | undefined
): TicketMatch {
  const now = nowString();
  const ticketKey = normalizeTicketNo(measure.ticketNo);

  const base: TicketMatch = {
    id: generateId("TM"),
    measureTicketId: measure.id,
    inboundRecordId: "",
    ticketNo: measure.ticketNo.trim() || measure.ticketNo,
    matchStatus: "待匹配",
    matchScore: 0,
    exceptionTypes: [],
    exceptionDetail: "",
    confirmedBy: "",
    confirmedAt: "",
    createdAt: now,
    updatedAt: now,
  };

  if (!ticketKey) {
    return {
      ...base,
      exceptionTypes: ["缺少磅单号"],
      exceptionDetail: "计量单无有效磅单号，无法关联入库单",
    };
  }

  if (!inbound) {
    return {
      ...base,
      matchStatus: "待匹配",
      exceptionTypes: ["缺少采购入库单"],
      exceptionDetail: `未找到磅单号为「${measure.ticketNo}」的入库单`,
    };
  }

  const inboundKey = normalizeTicketNo(inbound.ticketNo);
  if (inboundKey !== ticketKey) {
    return {
      ...base,
      matchStatus: "待匹配",
      exceptionTypes: ["磅单号不一致"],
      exceptionDetail: `计量单「${measure.ticketNo}」与入库单「${inbound.ticketNo}」无法关联`,
    };
  }

  const linked: TicketMatch = {
    ...base,
    inboundRecordId: inbound.id,
    ticketNo: measure.ticketNo.trim() || inbound.ticketNo.trim(),
  };

  const exceptions: string[] = [];
  const details: string[] = [];
  let score = 100;

  details.push("已按磅单号关联");

  if (measure.ticketNo.trim() !== inbound.ticketNo.trim()) {
    exceptions.push("磅单号书写差异");
    details.push(
      `计量单「${measure.ticketNo}」与入库单「${inbound.ticketNo}」编号一致但字符不同`
    );
    score -= 5;
  }

  if (inbound.reviewStatus !== "已审核") {
    exceptions.push("入库单待审核");
    details.push("入库单尚未审核，关联后请完成入库复核");
    score -= 15;
  }

  if (measure.ocrStatus !== "已审核") {
    exceptions.push("计量单待审核");
    details.push("计量单尚未审核，请先完成计量单复核");
    score -= 15;
  }

  if (
    measure.supplierName &&
    inbound.supplierName &&
    measure.supplierName.trim() !== inbound.supplierName.trim()
  ) {
    exceptions.push("供应商不一致");
    details.push(
      `计量单「${measure.supplierName}」，入库单「${inbound.supplierName}」`
    );
    score -= 20;
  }

  if (
    measure.plateNo &&
    inbound.plateNo &&
    measure.plateNo.trim() !== inbound.plateNo.trim()
  ) {
    exceptions.push("车牌不一致");
    details.push(`计量单「${measure.plateNo}」，入库单「${inbound.plateNo}」`);
    score -= 20;
  }

  const measureWeight = measure.actualWeight || measure.netWeight;
  if (measureWeight > 0 && inbound.netWeight > 0) {
    if (!compareWeight(measureWeight, inbound.netWeight)) {
      exceptions.push("重量不一致");
      details.push(
        `计量单 ${measureWeight.toLocaleString()} KG，入库单 ${inbound.netWeight.toLocaleString()} KG`
      );
      score -= 15;
    }
  }

  const blockingReview =
    inbound.reviewStatus !== "已审核" || measure.ocrStatus !== "已审核";

  if (exceptions.length === 0) {
    return {
      ...linked,
      matchStatus: "匹配成功",
      matchScore: score,
      exceptionDetail: details.join("；"),
    };
  }

  if (blockingReview) {
    return {
      ...linked,
      matchStatus: "待匹配",
      matchScore: Math.max(score, 0),
      exceptionTypes: exceptions,
      exceptionDetail: details.join("；"),
    };
  }

  return {
    ...linked,
    matchStatus: score >= 70 ? "疑似匹配" : "核对异常",
    matchScore: Math.max(score, 0),
    exceptionTypes: exceptions,
    exceptionDetail: details.join("；"),
  };
}

export function computeTicketMatches(
  measureTickets: MeasureTicket[],
  inboundRecords: InboundRecord[],
  preservedMatches: TicketMatch[] = []
): TicketMatch[] {
  const inboundByTicket = buildInboundIndexByTicketNo(inboundRecords);
  const preserved = new Map(
    preservedMatches
      .filter((m) => m.matchStatus === "已确认" || m.matchStatus === "已作废")
      .map((m) => [m.measureTicketId, m])
  );

  const nextMatches: TicketMatch[] = [];

  for (const measure of measureTickets) {
    if (!measure.ticketNo?.trim()) continue;
    if (measure.ocrStatus === "识别失败") continue;

    const preservedMatch = preserved.get(measure.id);
    if (preservedMatch) {
      nextMatches.push(preservedMatch);
      continue;
    }

    const key = normalizeTicketNo(measure.ticketNo);
    const inbound = key ? inboundByTicket.get(key) : undefined;
    nextMatches.push(buildTicketMatch(measure, inbound));
  }

  return nextMatches;
}
