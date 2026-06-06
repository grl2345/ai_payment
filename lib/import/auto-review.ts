import type { InboundRecord, MeasureTicket } from "@/lib/types";
import { validateTicketNoDateConsistency } from "@/lib/import/ticket-validation";
import {
  getInboundDuplicateMessage,
  getMeasureDuplicateMessage,
  normalizeTicketNo,
} from "@/lib/import/ticket-uniqueness";

export type ReviewSource = "ai" | "manual";

export interface AutoReviewResult {
  approved: boolean;
  issues: string[];
  hint: string;
}

export function isAutoReviewEnabled() {
  const flag = process.env.AUTO_REVIEW_ENABLED?.trim().toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** 计量单自动通过置信度阈值（默认 95%，可通过环境变量 MEASURE_CONFIDENCE_THRESHOLD 调整） */
export function getConfidenceThreshold() {
  const n = Number(process.env.MEASURE_CONFIDENCE_THRESHOLD ?? "95");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 95;
}

export function isExcelInboundAutoReviewEnabled() {
  const flag = process.env.AUTO_REVIEW_EXCEL_INBOUND?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return isAutoReviewEnabled();
}

export function isInboundImageAutoReviewEnabled() {
  const flag = process.env.AUTO_REVIEW_INBOUND_IMAGE?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return isAutoReviewEnabled();
}

export function getInboundImageMinScore() {
  const n = Number(process.env.AUTO_REVIEW_INBOUND_IMAGE_MIN_SCORE ?? "80");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 80;
}

export function getInboundImageMinConfidence() {
  const n = Number(process.env.AUTO_REVIEW_INBOUND_IMAGE_CONFIDENCE ?? "88");
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 88;
}

function hasText(value: string) {
  return value.trim().length > 0;
}

export type InboundAutoReviewContext = {
  allInboundRecords: Pick<InboundRecord, "id" | "ticketNo">[];
  recordId?: string;
};

export type MeasureAutoReviewContext = {
  allMeasureTickets: Pick<MeasureTicket, "id" | "ticketNo">[];
  ticketId?: string;
};

/** 计量单：识别质量 + 关键字段完整性 */
export function evaluateMeasureAutoReview(
  ticket: Pick<
    MeasureTicket,
    | "ticketNo"
    | "supplierName"
    | "plateNo"
    | "netWeight"
    | "actualWeight"
    | "grossWeight"
    | "tareWeight"
    | "confidence"
    | "ocrStatus"
  >,
  context?: MeasureAutoReviewContext
): AutoReviewResult {
  if (!isAutoReviewEnabled()) {
    return { approved: false, issues: ["自动核对已关闭"], hint: "" };
  }
  if (ticket.ocrStatus === "识别失败") {
    return { approved: false, issues: ["识别失败"], hint: "" };
  }

  const issues: string[] = [];

  if (context?.allMeasureTickets) {
    const duplicateMsg = getMeasureDuplicateMessage(
      { measureTickets: context.allMeasureTickets as MeasureTicket[] },
      ticket.ticketNo,
      context.ticketId
    );
    if (duplicateMsg) issues.push(duplicateMsg);
  }

  if (!hasText(ticket.ticketNo)) issues.push("缺少磅单号");
  const threshold = getConfidenceThreshold();
  if (ticket.confidence < threshold) {
    issues.push(`置信度 ${ticket.confidence}%（需 ≥${threshold}%）`);
  }

  const weight = ticket.actualWeight || ticket.netWeight;
  if (weight <= 0) issues.push("缺少有效重量");

  if (
    ticket.grossWeight > 0 &&
    ticket.tareWeight > 0 &&
    ticket.netWeight > 0 &&
    ticket.grossWeight < ticket.netWeight
  ) {
    issues.push("毛重小于净重，数据异常");
  }

  if (issues.length === 0) {
    return {
      approved: true,
      issues: [],
      hint: "AI 自动通过（置信度 100%）",
    };
  }

  return {
    approved: false,
    issues,
    hint: issues.join("；"),
  };
}

type InboundReviewFields = Pick<
  InboundRecord,
  | "ticketNo"
  | "outboundDate"
  | "supplierName"
  | "plateNo"
  | "driverName"
  | "materialType"
  | "netWeight"
  | "moisturePercent"
  | "dryWeight"
  | "purchaseAmount"
  | "inboundDate"
  | "ocrConfidence"
>;

function getInboundTicketDateIssue(record: InboundReviewFields): string {
  const { consistent, issue } = validateTicketNoDateConsistency(
    record.ticketNo,
    record.outboundDate,
    record.inboundDate
  );
  return consistent ? "" : issue;
}

/** 截图入库单字段完整度评分 0-100 */
export function scoreInboundImageRecord(record: InboundReviewFields): {
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0;

  if (!hasText(record.ticketNo)) {
    issues.push("缺少磅单编号");
  } else {
    score += 18;
  }

  if (record.netWeight <= 0) {
    issues.push("缺少过磅净重");
  } else {
    score += 18;
  }

  if (hasText(record.supplierName)) score += 12;
  else issues.push("缺少供应商");

  if (hasText(record.plateNo)) score += 12;
  else issues.push("缺少车牌");

  if (hasText(record.driverName)) score += 6;
  if (hasText(record.materialType)) score += 6;
  if (hasText(record.inboundDate)) score += 6;

  if (record.moisturePercent > 0 && record.moisturePercent < 100) {
    score += 8;
  }

  if (record.dryWeight > 0) score += 8;

  if (record.purchaseAmount > 0) score += 8;

  if (
    record.netWeight > 0 &&
    record.moisturePercent > 0 &&
    record.moisturePercent < 100 &&
    record.dryWeight > 0
  ) {
    const expectedDry = (record.netWeight * (1 - record.moisturePercent / 100)) / 1000;
    const deviation =
      expectedDry > 0 ? Math.abs(expectedDry - record.dryWeight) / expectedDry : 1;
    if (deviation <= 0.12) {
      score += 8;
    } else {
      issues.push("绝干重量与净重/水分偏差较大");
    }
  }

  return { score: Math.min(score, 100), issues };
}

/** 入库单：Excel 结构化默认可信；截图按完整度 + 置信度 */
export function evaluateInboundAutoReview(
  record: InboundReviewFields,
  source: "excel" | "image",
  context?: InboundAutoReviewContext
): AutoReviewResult {
  if (!isAutoReviewEnabled()) {
    return { approved: false, issues: ["自动核对已关闭"], hint: "" };
  }

  const criticalIssues: string[] = [];
  if (!hasText(record.ticketNo)) criticalIssues.push("缺少磅单编号");
  if (record.netWeight <= 0) criticalIssues.push("缺少过磅净重");

  const ticketDateIssue = getInboundTicketDateIssue(record);
  if (ticketDateIssue) criticalIssues.push(ticketDateIssue);

  if (context?.allInboundRecords) {
    const duplicateMsg = getInboundDuplicateMessage(
      { inboundRecords: context.allInboundRecords as InboundRecord[] },
      record.ticketNo,
      context.recordId
    );
    if (duplicateMsg) criticalIssues.push(duplicateMsg);
  }

  if (source === "excel" && isExcelInboundAutoReviewEnabled()) {
    if (criticalIssues.length === 0) {
      return { approved: true, issues: [], hint: "AI 自动通过（Excel 结构化导入）" };
    }
    return { approved: false, issues: criticalIssues, hint: criticalIssues.join("；") };
  }

  if (source === "image") {
    if (!isInboundImageAutoReviewEnabled()) {
      return {
        approved: false,
        issues: criticalIssues.length > 0 ? criticalIssues : ["截图需人工复核"],
        hint:
          criticalIssues.length > 0
            ? criticalIssues.join("；")
            : "截图入库单自动核对已关闭",
      };
    }

    const { score, issues } = scoreInboundImageRecord(record);
    const allIssues = [...criticalIssues, ...issues.filter((i) => !criticalIssues.includes(i))];
    const minScore = getInboundImageMinScore();
    const minConfidence = getInboundImageMinConfidence();
    const confidence = record.ocrConfidence ?? 0;

    if (criticalIssues.length > 0) {
      return {
        approved: false,
        issues: allIssues,
        hint: criticalIssues.join("；"),
      };
    }

    const hasOcrConfidence = confidence > 0;
    const confidenceOk = hasOcrConfidence
      ? confidence >= minConfidence
      : score >= Math.max(minScore, 95) && !ticketDateIssue;

    if (score >= minScore && confidenceOk) {
      const confText = hasOcrConfidence
        ? `，识别置信度 ${confidence}%`
        : `，字段完整度 ${score}%（无 OCR 置信度，已通过编号/日期校验）`;
      return {
        approved: true,
        issues: [],
        hint: `AI 自动通过（截图${confText}）`,
      };
    }

    const hints: string[] = [];
    if (score < minScore) hints.push(`字段完整度 ${score}%（需 ≥${minScore}%）`);
    if (hasOcrConfidence && confidence < minConfidence) {
      hints.push(`识别置信度 ${confidence}%（需 ≥${minConfidence}%）`);
    }
    if (!hasOcrConfidence && score < Math.max(minScore, 95)) {
      hints.push("缺少 OCR 置信度且字段完整度不足，需人工复核");
    }
    if (hints.length === 0 && allIssues.length === 0) {
      hints.push("需人工复核");
    }

    return {
      approved: false,
      issues: allIssues.length > 0 ? allIssues : hints,
      hint: hints.join("；") || allIssues.join("；"),
    };
  }

  return {
    approved: false,
    issues: criticalIssues,
    hint: criticalIssues.join("；"),
  };
}

export function applyMeasureAutoReview<T extends MeasureTicket>(
  ticket: T,
  context?: MeasureAutoReviewContext
): T {
  const result = evaluateMeasureAutoReview(ticket, context);
  if (!result.approved) {
    return {
      ...ticket,
      ocrStatus: ticket.ocrStatus === "识别失败" ? "识别失败" : "待审核",
      reviewSource: undefined,
      reviewHint: result.hint || result.issues.join("；"),
    };
  }
  return {
    ...ticket,
    ocrStatus: "已审核",
    reviewSource: "ai",
    reviewHint: result.hint,
  };
}

export function applyInboundAutoReview<T extends InboundRecord>(
  record: T,
  source: "excel" | "image",
  context?: InboundAutoReviewContext
): T {
  const result = evaluateInboundAutoReview(record, source, context);
  if (!result.approved) {
    return {
      ...record,
      reviewStatus: "待审核",
      reviewSource: undefined,
      reviewHint: result.hint || result.issues.join("；"),
    };
  }
  return {
    ...record,
    reviewStatus: "已审核",
    reviewSource: "ai",
    reviewHint: result.hint,
  };
}

/** 计量单与入库单交叉核对：关键字段一致则自动通过入库单（并可联动计量单） */
export function tryCrossAutoApprove(
  measure: MeasureTicket,
  inbound: InboundRecord
): { measure: MeasureTicket; inbound: InboundRecord; matched: boolean } {
  if (!isAutoReviewEnabled()) {
    return { measure, inbound, matched: false };
  }

  const measureWeight = measure.actualWeight || measure.netWeight;
  const weightOk =
    measureWeight > 0 &&
    inbound.netWeight > 0 &&
    Math.abs(measureWeight - inbound.netWeight) <= 50;

  const supplierOk =
    !hasText(measure.supplierName) ||
    !hasText(inbound.supplierName) ||
    measure.supplierName.trim() === inbound.supplierName.trim();

  const plateOk =
    !hasText(measure.plateNo) ||
    !hasText(inbound.plateNo) ||
    measure.plateNo.trim() === inbound.plateNo.trim();

  const ticketOk =
    hasText(measure.ticketNo) &&
    hasText(inbound.ticketNo) &&
    normalizeTicketNo(measure.ticketNo) === normalizeTicketNo(inbound.ticketNo);

  if (!ticketOk || !weightOk) {
    return { measure, inbound, matched: false };
  }

  if (!supplierOk || !plateOk) {
    return { measure, inbound, matched: false };
  }

  const ticketDateIssue = getInboundTicketDateIssue(inbound);
  if (ticketDateIssue) {
    return { measure, inbound, matched: false };
  }

  const hint = "AI 交叉核对通过（与计量单磅单号/重量/车牌一致）";
  let nextMeasure = measure;
  let nextInbound = inbound;
  let changed = false;

  if (measure.ocrStatus === "待审核" && measure.confidence >= getConfidenceThreshold()) {
    nextMeasure = {
      ...measure,
      ocrStatus: "已审核",
      reviewSource: "ai",
      reviewHint: hint,
    };
    changed = true;
  }

  if (inbound.reviewStatus === "待审核") {
    nextInbound = {
      ...inbound,
      reviewStatus: "已审核",
      reviewSource: "ai",
      reviewHint: hint,
    };
    changed = true;
  }

  return {
    measure: nextMeasure,
    inbound: nextInbound,
    matched: changed,
  };
}

export function countNeedsReview(
  measures: MeasureTicket[],
  inbounds: InboundRecord[]
) {
  return {
    measurePending: measures.filter((m) => m.ocrStatus === "待审核").length,
    measureAi: measures.filter((m) => m.reviewSource === "ai").length,
    inboundPending: inbounds.filter((r) => r.reviewStatus === "待审核").length,
    inboundAi: inbounds.filter((r) => r.reviewSource === "ai").length,
  };
}
