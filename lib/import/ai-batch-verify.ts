import { getStore } from "@/lib/db/store";
import { listVehicleSettlementRules } from "@/lib/db/vehicle-settlement-store";
import { runAutoReviewOnStore } from "@/lib/import/run-auto-review";
import {
  getVerificationFailureReasons,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import { syncAllVerifiedPayments } from "@/lib/import/payment-generation";
import { findVehicleSettlementRule } from "@/lib/import/vehicle-settlement";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
} from "@/lib/types";

export type AiVerifyIssueCategory =
  | "import"
  | "match"
  | "verify"
  | "confirm";

export type AiVerifyIssue = {
  ticketNo: string;
  plateNo: string;
  driverName: string;
  supplierName: string;
  category: AiVerifyIssueCategory;
  reasons: string[];
  measureId?: string;
  matchId?: string;
  matchStatus?: string;
};

export type AiVerifySuccess = {
  ticketNo: string;
  plateNo: string;
  driverName: string;
  supplierName: string;
  matchId: string;
  paymentId?: string;
  receivableAmount: number;
  payableAmount: number;
  grossProfit: number;
  dryWeight: number;
};

export type AiBatchVerifyResult = {
  ok: boolean;
  error?: string;
  measureApproved: number;
  inboundApproved: number;
  autoConfirmed: number;
  paymentsCreated: number;
  measurePending: number;
  inboundPending: number;
  passed: AiVerifySuccess[];
  issues: AiVerifyIssue[];
  stats: {
    totalMeasures: number;
    passedCount: number;
    issueCount: number;
  };
};

function mergeIssue(
  map: Map<string, AiVerifyIssue>,
  issue: AiVerifyIssue
) {
  const key = issue.ticketNo.trim() || issue.measureId || issue.matchId || "";
  if (!key) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...issue, reasons: [...new Set(issue.reasons)] });
    return;
  }
  existing.reasons = [
    ...new Set([...existing.reasons, ...issue.reasons]),
  ];
  if (
    issue.category === "verify" ||
    (issue.category === "match" && existing.category === "import")
  ) {
    existing.category = issue.category;
  }
  existing.matchStatus = issue.matchStatus ?? existing.matchStatus;
}

function skipReasonForMatch(
  match: TicketMatch,
  measure: MeasureTicket,
  inbound: InboundRecord | undefined,
  rules: ReturnType<typeof listVehicleSettlementRules>
): string | null {
  if (match.matchStatus === "已确认" || match.matchStatus === "已作废") {
    return null;
  }
  if (!match.inboundRecordId) {
    return match.exceptionDetail || "未找到对应采购入库单";
  }
  if (match.matchStatus !== "匹配成功") {
    return match.exceptionDetail || `核对状态：${match.matchStatus}`;
  }
  if (measure.ocrStatus !== "已审核") {
    return "计量单待复核";
  }
  if (!inbound || inbound.reviewStatus !== "已审核") {
    return "采购入库单待复核";
  }
  const verification = verifyMeasureAndInbound(measure, inbound);
  if (!verification.overallPass) {
    return getVerificationFailureReasons(verification).join("；");
  }
  const rule = findVehicleSettlementRule(
    rules,
    measure.plateNo || inbound.plateNo,
    measure.driverName || inbound.driverName
  );
  if (!rule) {
    return `缺少车辆结算档案（${measure.plateNo} / ${measure.driverName}）`;
  }
  return "匹配成功但未自动确认，请检查环境配置或手动确认";
}

type BatchCountMeta = {
  measureApproved: number;
  inboundApproved: number;
  autoConfirmed: number;
  paymentsCreated: number;
  measurePending: number;
  inboundPending: number;
};

function countBatchMetaFromStore(
  store: ReturnType<typeof getStore>
): BatchCountMeta {
  return {
    measureApproved: store.measureTickets.filter(
      (m) => m.ocrStatus === "已审核"
    ).length,
    inboundApproved: store.inboundRecords.filter(
      (r) => r.reviewStatus === "已审核"
    ).length,
    autoConfirmed: store.ticketMatches.filter(
      (m) => m.matchStatus === "已确认"
    ).length,
    paymentsCreated: store.paymentDetails.length,
    measurePending: store.measureTickets.filter(
      (m) => m.ocrStatus === "待审核" || m.ocrStatus === "待识别"
    ).length,
    inboundPending: store.inboundRecords.filter(
      (r) => r.reviewStatus === "待审核"
    ).length,
  };
}

function computeAiBatchFromStore(
  store: ReturnType<typeof getStore>,
  meta: BatchCountMeta
): AiBatchVerifyResult {
  const rules = listVehicleSettlementRules();

  const measureById = new Map(store.measureTickets.map((m) => [m.id, m]));
  const inboundById = new Map(store.inboundRecords.map((r) => [r.id, r]));
  const paymentByMatchId = new Map(
    store.paymentDetails.map((p) => [p.matchId, p])
  );
  const matchedMeasureIds = new Set(
    store.ticketMatches.map((m) => m.measureTicketId)
  );

  const issueMap = new Map<string, AiVerifyIssue>();
  const passed: AiVerifySuccess[] = [];

  for (const match of store.ticketMatches) {
    const measure = measureById.get(match.measureTicketId);
    if (!measure) continue;

    const inbound = match.inboundRecordId
      ? inboundById.get(match.inboundRecordId)
      : undefined;

    if (match.matchStatus === "已确认") {
      const payment = paymentByMatchId.get(match.id);
      passed.push({
        ticketNo: match.ticketNo,
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        matchId: match.id,
        paymentId: payment?.id,
        receivableAmount: payment?.receivableAmount ?? 0,
        payableAmount: payment?.payableAmount ?? 0,
        grossProfit: payment?.grossProfit ?? 0,
        dryWeight: payment?.dryWeight ?? inbound?.dryWeight ?? 0,
      });
      continue;
    }

    if (match.matchStatus === "已作废") continue;

    const reasons: string[] = [];

    if (measure.ocrStatus === "识别失败") {
      reasons.push("计量单识别失败，需重新上传或人工录入");
    } else if (measure.ocrStatus === "待审核") {
      reasons.push(measure.reviewHint || "计量单待人工复核");
    }

    if (inbound && inbound.reviewStatus === "待审核") {
      reasons.push(inbound.reviewHint || "采购入库单待人工复核");
    }

    if (match.exceptionTypes.length > 0) {
      reasons.push(
        match.exceptionDetail
          ? `${match.exceptionTypes.join("、")}：${match.exceptionDetail}`
          : match.exceptionTypes.join("、")
      );
    } else if (match.exceptionDetail) {
      reasons.push(match.exceptionDetail);
    }

    if (
      inbound &&
      measure.ocrStatus === "已审核" &&
      inbound.reviewStatus === "已审核" &&
      match.inboundRecordId
    ) {
      const verification = verifyMeasureAndInbound(measure, inbound);
      if (!verification.overallPass) {
        reasons.push(...getVerificationFailureReasons(verification));
      }
    }

    const skipReason = skipReasonForMatch(match, measure, inbound, rules);
    if (skipReason && match.matchStatus === "匹配成功") {
      const verificationReasons = reasons.filter((r) =>
        r.includes("不一致") || r.includes("校验")
      );
      if (verificationReasons.length === 0) {
        reasons.push(skipReason);
      }
    }

    if (reasons.length === 0) continue;

    let category: AiVerifyIssueCategory = "match";
    if (reasons.some((r) => r.includes("复核") || r.includes("识别"))) {
      category = "import";
    } else if (
      reasons.some((r) => r.includes("不一致") || r.includes("校验"))
    ) {
      category = "verify";
    } else if (reasons.some((r) => r.includes("车辆结算") || r.includes("未自动确认"))) {
      category = "confirm";
    }

    mergeIssue(issueMap, {
      ticketNo: match.ticketNo || measure.ticketNo,
      plateNo: measure.plateNo,
      driverName: measure.driverName,
      supplierName: measure.supplierName,
      category,
      reasons: [...new Set(reasons)],
      measureId: measure.id,
      matchId: match.id,
      matchStatus: match.matchStatus,
    });
  }

  for (const measure of store.measureTickets) {
    if (matchedMeasureIds.has(measure.id)) continue;
    if (measure.ocrStatus === "识别失败") {
      mergeIssue(issueMap, {
        ticketNo: measure.ticketNo || "(无磅单号)",
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        category: "import",
        reasons: ["计量单识别失败"],
        measureId: measure.id,
      });
      continue;
    }
    if (!measure.ticketNo?.trim()) {
      mergeIssue(issueMap, {
        ticketNo: "(无磅单号)",
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        category: "import",
        reasons: ["缺少磅单号，无法与采购单关联"],
        measureId: measure.id,
      });
      continue;
    }
    if (measure.ocrStatus === "待审核") {
      mergeIssue(issueMap, {
        ticketNo: measure.ticketNo,
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        category: "import",
        reasons: [measure.reviewHint || "计量单待复核，且未生成核对记录"],
        measureId: measure.id,
      });
    }
  }

  const issues = [...issueMap.values()].sort((a, b) =>
    a.ticketNo.localeCompare(b.ticketNo, "zh-CN")
  );

  return {
    ok: true,
    measureApproved: meta.measureApproved,
    inboundApproved: meta.inboundApproved,
    autoConfirmed: meta.autoConfirmed,
    paymentsCreated: meta.paymentsCreated,
    measurePending: meta.measurePending,
    inboundPending: meta.inboundPending,
    passed: passed.sort((a, b) => a.ticketNo.localeCompare(b.ticketNo, "zh-CN")),
    issues,
    stats: {
      totalMeasures: store.measureTickets.filter(
        (m) => m.ocrStatus !== "识别失败"
      ).length,
      passedCount: passed.length,
      issueCount: issues.length,
    },
  };
}

/** 只读：根据当前库内数据生成 AI 核对明细（不重算匹配、不写盘） */
export function buildAiBatchVerifySnapshot(): AiBatchVerifyResult {
  const store = getStore();
  return computeAiBatchFromStore(store, countBatchMetaFromStore(store));
}

export function runAiBatchVerify(): AiBatchVerifyResult {
  const review = runAutoReviewOnStore(getStore());
  if (!review.ok) {
    return {
      ok: false,
      error: review.error,
      measureApproved: 0,
      inboundApproved: 0,
      autoConfirmed: 0,
      paymentsCreated: 0,
      measurePending: 0,
      inboundPending: 0,
      passed: [],
      issues: [],
      stats: { totalMeasures: 0, passedCount: 0, issueCount: 0 },
    };
  }

  syncAllVerifiedPayments();
  const store = getStore();
  return computeAiBatchFromStore(store, {
    measureApproved: review.measureApproved,
    inboundApproved: review.inboundApproved,
    autoConfirmed: review.autoConfirmed,
    paymentsCreated: review.paymentsFromConfirm,
    measurePending: review.measurePending,
    inboundPending: review.inboundPending,
  });
}

