import { writeSplitStoreKey } from "@/lib/db/data-files";
import { generateId, getStore, nowString } from "@/lib/db/store";
import { listVehicleSettlementRules } from "@/lib/db/vehicle-settlement-store";
import {
  isMatchVerificationSatisfied,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import { formatMeasureDate } from "@/lib/import/measure-fields";
import {
  calcSettlementPrice,
  findVehicleSettlementRule,
} from "@/lib/import/vehicle-settlement";
import type {
  DataStore,
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
} from "@/lib/types";

export type PaymentSyncResult = {
  created: number;
  updated: number;
  removed: number;
  skipped: number;
  errors: string[];
};

/** 精竹支付金额 =（结算基础 − 单价截留）× 绝干重量(吨) */
export function calcJingzhuPayableAmount(
  settlementPrice: number,
  dryWeightTon: number
): number {
  const price = Number(settlementPrice) || 0;
  const dry = Number(dryWeightTon) || 0;
  return Math.round(price * dry * 100) / 100;
}

export function buildPaymentDetail(
  match: TicketMatch,
  measure: MeasureTicket,
  inbound: InboundRecord,
  vehicleRule: NonNullable<ReturnType<typeof findVehicleSettlementRule>>,
  existing?: PaymentDetail | null
): PaymentDetail {
  const now = nowString();
  const basePrice = vehicleRule.basePrice;
  const priceDeduction = vehicleRule.priceDeduction;
  const settlementPrice =
    vehicleRule.settlementPrice > 0
      ? vehicleRule.settlementPrice
      : calcSettlementPrice(basePrice, priceDeduction);
  const dryWeight = inbound.dryWeight ?? 0;
  const yongfengPayable = inbound.purchaseAmount ?? 0;
  const jingzhuPayable = calcJingzhuPayableAmount(settlementPrice, dryWeight);
  const actualKg = measure.actualWeight || measure.netWeight || 0;

  return {
    id: existing?.id ?? generateId("PD"),
    matchId: match.id,
    businessDate:
      formatMeasureDate(measure) !== "-"
        ? formatMeasureDate(measure)
        : inbound.inboundDate || inbound.outboundDate,
    ticketNo: match.ticketNo || measure.ticketNo,
    supplierName: inbound.supplierName || measure.supplierName,
    payeeName: vehicleRule.payeeName,
    plateNo: measure.plateNo || inbound.plateNo,
    driverName: measure.driverName || inbound.driverName,
    basePrice,
    priceDeduction,
    settlementPrice,
    netWeight: actualKg,
    moisturePercent: inbound.moisturePercent ?? 0,
    settlementWeight: inbound.settlementWeight ?? 0,
    dryWeight,
    receivableAmount: yongfengPayable,
    payableAmount: jingzhuPayable,
    grossProfit: Math.round((yongfengPayable - jingzhuPayable) * 100) / 100,
    paymentStatus: existing?.paymentStatus ?? "未支付",
    paidAmount: existing?.paidAmount ?? 0,
    paidDate: existing?.paidDate ?? "",
    invoiceStatus: existing?.invoiceStatus ?? "未开票",
    invoiceAmount: existing?.invoiceAmount ?? 0,
    invoiceDate: existing?.invoiceDate ?? "",
    remark: existing?.remark ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function savePayments(payments: PaymentDetail[]) {
  const store = getStore();
  store.paymentDetails = payments;
  writeSplitStoreKey("paymentDetails", payments);
}

/** 仅「已确认」的核对记录可进入付款明细 */
export function isMatchConfirmedForPayment(match: TicketMatch): boolean {
  return match.matchStatus === "已确认";
}

export function removePaymentByMatchId(matchId: string, store?: DataStore): boolean {
  const s = store ?? getStore();
  const before = s.paymentDetails.length;
  s.paymentDetails = s.paymentDetails.filter((p) => p.matchId !== matchId);
  if (s.paymentDetails.length === before) return false;
  savePayments(s.paymentDetails);
  return true;
}

export function syncPaymentForMatch(
  matchId: string,
  store?: DataStore
): PaymentDetail | null | { error: string } {
  const s = store ?? getStore();
  const match = s.ticketMatches.find((m) => m.id === matchId);
  if (!match?.inboundRecordId || !match.measureTicketId) {
    return { error: "未关联计量单与入库单" };
  }

  const existing = s.paymentDetails.find((p) => p.matchId === matchId);

  if (!isMatchConfirmedForPayment(match)) {
    if (existing) removePaymentByMatchId(matchId, s);
    return { error: "单据核对未确认，不生成付款明细" };
  }

  const measure = s.measureTickets.find((t) => t.id === match.measureTicketId);
  const inbound = s.inboundRecords.find((r) => r.id === match.inboundRecordId);
  if (!measure || !inbound) {
    return { error: "关联单据不存在" };
  }

  const verification = verifyMeasureAndInbound(measure, inbound);

  if (!isMatchVerificationSatisfied(match.matchStatus, verification)) {
    if (existing) {
      s.paymentDetails = s.paymentDetails.filter((p) => p.matchId !== matchId);
      savePayments(s.paymentDetails);
    }
    return { error: "单据校验未通过，请先人工确认或修正数据后再生成付款明细" };
  }

  const rules = s.vehicleSettlementRules?.length
    ? s.vehicleSettlementRules
    : listVehicleSettlementRules();
  const vehicleRule = findVehicleSettlementRule(
    rules,
    measure.plateNo || inbound.plateNo,
    measure.driverName || inbound.driverName
  );

  if (!vehicleRule) {
    return {
      error: `未找到车辆结算档案：${measure.plateNo} / ${measure.driverName}`,
    };
  }

  const payment = buildPaymentDetail(
    match,
    measure,
    inbound,
    vehicleRule,
    existing ?? null
  );

  if (existing) {
    const idx = s.paymentDetails.findIndex((p) => p.id === existing.id);
    s.paymentDetails[idx] = payment;
  } else {
    s.paymentDetails.unshift(payment);
  }
  savePayments(s.paymentDetails);
  return payment;
}

/** 为「已确认」且校验通过的匹配记录生成/更新付款明细 */
export function syncAllVerifiedPayments(store?: DataStore): PaymentSyncResult {
  const s = store ?? getStore();
  const rules =
    s.vehicleSettlementRules?.length > 0
      ? s.vehicleSettlementRules
      : listVehicleSettlementRules();

  const result: PaymentSyncResult = {
    created: 0,
    updated: 0,
    removed: 0,
    skipped: 0,
    errors: [],
  };

  const eligibleMatchIds = new Set<string>();
  const nextPayments: PaymentDetail[] = [...s.paymentDetails];

  for (const match of s.ticketMatches) {
    if (!match.inboundRecordId || !match.measureTicketId) continue;
    if (!isMatchConfirmedForPayment(match)) continue;

    const measure = s.measureTickets.find((t) => t.id === match.measureTicketId);
    const inbound = s.inboundRecords.find((r) => r.id === match.inboundRecordId);
    if (!measure || !inbound) continue;

    const verification = verifyMeasureAndInbound(measure, inbound);
    if (!isMatchVerificationSatisfied(match.matchStatus, verification)) {
      result.skipped++;
      result.errors.push(`${match.ticketNo}：校验未通过，请先人工确认`);
      continue;
    }

    eligibleMatchIds.add(match.id);

    const vehicleRule = findVehicleSettlementRule(
      rules,
      measure.plateNo || inbound.plateNo,
      measure.driverName || inbound.driverName
    );

    if (!vehicleRule) {
      result.skipped++;
      result.errors.push(
        `${match.ticketNo}：未找到车辆结算档案（${measure.plateNo}/${measure.driverName}）`
      );
      continue;
    }

    const existingIdx = nextPayments.findIndex((p) => p.matchId === match.id);
    const existing =
      existingIdx >= 0 ? nextPayments[existingIdx] : null;
    const payment = buildPaymentDetail(
      match,
      measure,
      inbound,
      vehicleRule,
      existing
    );

    if (existing) {
      nextPayments[existingIdx] = payment;
      result.updated++;
    } else {
      nextPayments.unshift(payment);
      result.created++;
    }
  }

  const confirmedIds = new Set(
    s.ticketMatches.filter(isMatchConfirmedForPayment).map((m) => m.id)
  );

  const before = nextPayments.length;
  const filtered = nextPayments.filter(
    (p) =>
      !p.matchId ||
      (confirmedIds.has(p.matchId) && eligibleMatchIds.has(p.matchId))
  );
  result.removed = before - filtered.length;

  s.paymentDetails = filtered;
  savePayments(filtered);
  return result;
}
