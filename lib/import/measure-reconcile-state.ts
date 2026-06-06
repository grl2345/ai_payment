import {
  getVerificationFailureReasons,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
} from "@/lib/types";

export type MeasureReconcileState = {
  matchId?: string;
  matchStatus?: string;
  /** 计量单与采购单已确认核对 */
  verified: boolean;
  /** 已生成付款明细（出账） */
  billed: boolean;
  /** 未核对时的简要原因 */
  verifyHint?: string;
};

export function getMeasureReconcileState(
  ticket: MeasureTicket,
  matches: TicketMatch[],
  payments: PaymentDetail[],
  inboundById: Map<string, InboundRecord>
): MeasureReconcileState {
  const match = matches.find(
    (m) =>
      m.measureTicketId === ticket.id &&
      m.matchStatus !== "已作废"
  );
  if (!match) {
    return {
      verified: false,
      billed: false,
      verifyHint: "未匹配采购入库单",
    };
  }

  const verified = match.matchStatus === "已确认";
  const billed = payments.some((p) => p.matchId === match.id);
  const inbound = match.inboundRecordId
    ? inboundById.get(match.inboundRecordId)
    : undefined;

  if (verified) {
    return {
      matchId: match.id,
      matchStatus: match.matchStatus,
      verified: true,
      billed,
      verifyHint: billed ? undefined : "已核对，待生成付款",
    };
  }

  if (!inbound) {
    return {
      matchId: match.id,
      matchStatus: match.matchStatus,
      verified: false,
      billed: false,
      verifyHint: match.exceptionDetail || "未关联采购入库单",
    };
  }

  const verification = verifyMeasureAndInbound(ticket, inbound);
  if (!verification.overallPass) {
    const reasons = getVerificationFailureReasons(verification);
    return {
      matchId: match.id,
      matchStatus: match.matchStatus,
      verified: false,
      billed: false,
      verifyHint: reasons[0] || "六项校验未通过",
    };
  }

  return {
    matchId: match.id,
    matchStatus: match.matchStatus,
    verified: false,
    billed: false,
    verifyHint:
      match.matchStatus === "匹配成功"
        ? "六项已通过，待自动确认"
        : match.exceptionDetail || "待核对",
  };
}
