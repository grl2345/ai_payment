import {
  isMatchVerificationSatisfied,
  verifyMeasureAndInbound,
  type DocumentVerificationResult,
} from "@/lib/import/document-verification";
import { findVehicleSettlementRule } from "@/lib/import/vehicle-settlement";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
  VehicleSettlementRule,
} from "@/lib/types";

export type MatchPaymentStatus = {
  issued: boolean;
  label: string;
  reason: string;
  paymentId?: string;
};

/** 说明该匹配记录是否已生成付款明细及未生成原因 */
export function getMatchPaymentStatus(
  match: TicketMatch,
  measure: MeasureTicket | undefined,
  inbound: InboundRecord | undefined,
  verification: DocumentVerificationResult | null,
  payment: PaymentDetail | undefined,
  rules: VehicleSettlementRule[]
): MatchPaymentStatus {
  if (payment) {
    return {
      issued: true,
      label: "已开付款单",
      reason: "",
      paymentId: payment.id,
    };
  }

  if (!match.inboundRecordId || !match.measureTicketId) {
    return {
      issued: false,
      label: "未开付款单",
      reason: "未关联计量单与采购入库单",
    };
  }

  if (match.matchStatus === "已作废") {
    return {
      issued: false,
      label: "未开付款单",
      reason: "核对记录已作废",
    };
  }

  if (match.matchStatus !== "已确认") {
    return {
      issued: false,
      label: "未开付款单",
      reason: "核对未确认，请先点击「确认通过」",
    };
  }

  if (!measure || !inbound) {
    return {
      issued: false,
      label: "未开付款单",
      reason: "关联的计量单或采购单不存在",
    };
  }

  if (measure.ocrStatus !== "已审核") {
    return {
      issued: false,
      label: "未开付款单",
      reason:
        measure.ocrStatus === "识别失败"
          ? "计量单识别失败，需重新上传或复核"
          : "计量单待复核，请先完成计量单审核",
    };
  }

  if (inbound.reviewStatus !== "已审核") {
    return {
      issued: false,
      label: "未开付款单",
      reason: "采购入库单待复核，请先完成采购单审核",
    };
  }

  const v =
    verification ?? verifyMeasureAndInbound(measure, inbound);

  if (!isMatchVerificationSatisfied(match.matchStatus, v)) {
    return {
      issued: false,
      label: "未开付款单",
      reason: "六项校验未通过，需修正数据或人工确认后再生成",
    };
  }

  const vehicleRule = findVehicleSettlementRule(
    rules,
    measure.plateNo || inbound.plateNo,
    measure.driverName || inbound.driverName
  );

  if (!vehicleRule) {
    return {
      issued: false,
      label: "未开付款单",
      reason: `缺少车辆结算档案（${measure.plateNo || "-"} / ${measure.driverName || "-"}）`,
    };
  }

  return {
    issued: false,
    label: "未开付款单",
    reason: "条件已满足，请在「生成付款明细」中点击「同步已确认单据」",
  };
}

/** 是否开具付款单：是=绿，否=橙（高对比，避免与校验列混淆） */
export function getPaymentStatusBadgeClassName(issued: boolean): string {
  if (issued) {
    return "border-emerald-600 bg-emerald-100 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-500";
  }
  return "border-amber-600 bg-amber-100 text-amber-950 hover:bg-amber-100 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-500";
}
