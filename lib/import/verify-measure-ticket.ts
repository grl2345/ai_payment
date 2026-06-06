import { confirmTicketMatch, getStore, rebuildMatches } from "@/lib/db/store";
import { listVehicleSettlementRules } from "@/lib/db/vehicle-settlement-store";
import { runAutoReviewOnStore } from "@/lib/import/run-auto-review";
import {
  getVerificationFailureReasons,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import { prepareForAiTodos } from "@/lib/import/prepare-ai-todos";
import { syncAllVerifiedPayments } from "@/lib/import/payment-generation";
import { findVehicleSettlementRule } from "@/lib/import/vehicle-settlement";
import { isAutoReviewEnabled } from "@/lib/import/auto-review";
import type { TicketMatch } from "@/lib/types";

export type VerifyMeasureTicketResult = {
  ok: boolean;
  error?: string;
  match?: TicketMatch;
  paymentCreated?: boolean;
};

/** 单条计量单：重建匹配 → 审核/自动确认 → 付款对齐 */
export function verifyMeasureTicketOneClick(
  measureId: string
): VerifyMeasureTicketResult {
  rebuildMatches();
  const store = getStore();
  const measure = store.measureTickets.find((t) => t.id === measureId);
  if (!measure) {
    return { ok: false, error: "计量单不存在" };
  }

  let match = store.ticketMatches.find(
    (m) => m.measureTicketId === measureId && m.matchStatus !== "已作废"
  );
  if (!match?.inboundRecordId) {
    return {
      ok: false,
      error: match?.exceptionDetail || "未找到相同磅单号的采购入库单",
    };
  }

  const inbound = store.inboundRecords.find((r) => r.id === match!.inboundRecordId);
  if (!inbound) {
    return { ok: false, error: "关联的采购入库单不存在" };
  }

  if (isAutoReviewEnabled()) {
    runAutoReviewOnStore(getStore());
  } else {
    if (measure.ocrStatus !== "已审核" || inbound.reviewStatus !== "已审核") {
      return {
        ok: false,
        error: "请先完成计量单与采购单的审核（或使用 AI 自动审核）",
      };
    }
  }

  prepareForAiTodos();

  const after = getStore();
  match = after.ticketMatches.find(
    (m) => m.measureTicketId === measureId && m.matchStatus !== "已作废"
  );
  if (!match) {
    return { ok: false, error: "核对记录丢失" };
  }

  if (match.matchStatus === "已确认") {
    const paymentCreated = (after.paymentDetails ?? []).some(
      (p) => p.matchId === match!.id
    );
    return { ok: true, match, paymentCreated };
  }

  const measureFresh = after.measureTickets.find((t) => t.id === measureId)!;
  const inboundFresh = after.inboundRecords.find((r) => r.id === match.inboundRecordId)!;
  const verification = verifyMeasureAndInbound(measureFresh, inboundFresh);
  if (!verification.overallPass) {
    const reasons = getVerificationFailureReasons(verification);
    return { ok: false, error: reasons.join("；") || "六项校验未通过" };
  }

  const rules =
    after.vehicleSettlementRules?.length > 0
      ? after.vehicleSettlementRules
      : listVehicleSettlementRules();
  const rule = findVehicleSettlementRule(
    rules,
    measureFresh.plateNo || inboundFresh.plateNo,
    measureFresh.driverName || inboundFresh.driverName
  );
  if (!rule) {
    return {
      ok: false,
      error: `缺少车辆结算档案（${measureFresh.plateNo} / ${measureFresh.driverName}）`,
    };
  }

  const confirmed = confirmTicketMatch(match.id, "AI");
  if (!confirmed) {
    return { ok: false, error: "确认失败" };
  }
  syncAllVerifiedPayments();
  const paymentCreated = (getStore().paymentDetails ?? []).some(
    (p) => p.matchId === match!.id
  );
  return { ok: true, match: confirmed, paymentCreated };
}
