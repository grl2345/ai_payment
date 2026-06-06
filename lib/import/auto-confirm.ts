import { confirmTicketMatch, getStore } from "@/lib/db/store";
import { listVehicleSettlementRules } from "@/lib/db/vehicle-settlement-store";
import { verifyMeasureAndInbound } from "@/lib/import/document-verification";
import {
  syncAllVerifiedPayments,
  type PaymentSyncResult,
} from "@/lib/import/payment-generation";
import { findVehicleSettlementRule } from "@/lib/import/vehicle-settlement";
import type { DataStore, TicketMatch, VehicleSettlementRule } from "@/lib/types";

export function isAutoConfirmEnabled() {
  const flag = process.env.AUTO_CONFIRM_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  return true;
}

export type AutoConfirmResult = {
  confirmed: number;
  paymentsCreated: number;
  skipped: number;
  errors: string[];
};

function canAutoConfirmMatch(
  match: TicketMatch,
  store: DataStore,
  rules: VehicleSettlementRule[]
): { ok: true } | { ok: false; reason: string } {
  if (match.matchStatus === "已确认" || match.matchStatus === "已作废") {
    return { ok: false, reason: "已处理" };
  }
  if (!match.inboundRecordId || !match.measureTicketId) {
    return { ok: false, reason: "未关联入库单" };
  }
  if (match.matchStatus !== "匹配成功") {
    return { ok: false, reason: `状态为「${match.matchStatus}」` };
  }

  const measure = store.measureTickets.find((t) => t.id === match.measureTicketId);
  const inbound = store.inboundRecords.find((r) => r.id === match.inboundRecordId);
  if (!measure || !inbound) {
    return { ok: false, reason: "关联单据缺失" };
  }

  if (measure.ocrStatus !== "已审核" || inbound.reviewStatus !== "已审核") {
    return { ok: false, reason: "单据未全部审核通过" };
  }

  const verification = verifyMeasureAndInbound(measure, inbound);
  if (!verification.overallPass) {
    return { ok: false, reason: "六项校验未全部通过" };
  }

  const rule = findVehicleSettlementRule(
    rules,
    measure.plateNo || inbound.plateNo,
    measure.driverName || inbound.driverName
  );
  if (!rule) {
    return {
      ok: false,
      reason: `无车辆结算档案（${measure.plateNo}/${measure.driverName}）`,
    };
  }

  return { ok: true };
}

/** 对「匹配成功 + 已审核 + 校验通过 + 有结算档案」的记录自动确认并生成付款明细 */
export async function autoConfirmEligibleMatches(
  store?: DataStore,
  confirmedBy = "AI"
): Promise<AutoConfirmResult> {
  if (!isAutoConfirmEnabled()) {
    return { confirmed: 0, paymentsCreated: 0, skipped: 0, errors: ["自动确认已关闭"] };
  }

  const s = store ?? (await getStore());
  const rules =
    s.vehicleSettlementRules?.length > 0
      ? s.vehicleSettlementRules
      : await listVehicleSettlementRules();

  const result: AutoConfirmResult = {
    confirmed: 0,
    paymentsCreated: 0,
    skipped: 0,
    errors: [],
  };

  for (const match of s.ticketMatches) {
    const check = canAutoConfirmMatch(match, s, rules);
    if (!check.ok) {
      if (check.reason !== "已处理") {
        result.skipped++;
      }
      continue;
    }

    const updated = await confirmTicketMatch(match.id, confirmedBy);
    if (!updated) {
      result.errors.push(`${match.ticketNo}：确认失败`);
      continue;
    }

    result.confirmed++;
    result.paymentsCreated++;
  }

  return result;
}

/** AI 流水线收尾：自动确认 + 付款明细对齐 */
export async function runAiPipelineTail(): Promise<{
  autoConfirm: AutoConfirmResult;
  paymentSync: PaymentSyncResult;
}> {
  const autoConfirm = await autoConfirmEligibleMatches(undefined, "AI");
  const paymentSync = await syncAllVerifiedPayments();
  return { autoConfirm, paymentSync };
}
