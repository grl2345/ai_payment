import type { VehicleSettlementRule } from "@/lib/types";

export function calcSettlementPrice(basePrice: number, priceDeduction: number): number {
  const base = Number(basePrice) || 0;
  const deduct = Number(priceDeduction) || 0;
  return Math.max(0, Math.round((base - deduct) * 100) / 100);
}

export function withSettlementPrice(
  rule: Omit<VehicleSettlementRule, "settlementPrice"> & { settlementPrice?: number }
): VehicleSettlementRule {
  return {
    ...rule,
    settlementPrice: calcSettlementPrice(rule.basePrice, rule.priceDeduction),
  };
}

export function normPlateNo(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export function normPersonName(value: string) {
  return value.trim().replace(/\s+/g, "");
}

/** 按车牌+司机查找结算档案（车牌可空时仅按司机） */
export function findVehicleSettlementRule(
  rules: VehicleSettlementRule[],
  plateNo: string,
  driverName: string
): VehicleSettlementRule | undefined {
  const plate = normPlateNo(plateNo);
  const driver = normPersonName(driverName);
  if (!driver) return undefined;

  if (plate) {
    const exact = rules.find(
      (r) => normPlateNo(r.plateNo) === plate && normPersonName(r.driverName) === driver
    );
    if (exact) return exact;
  }

  return rules.find((r) => !normPlateNo(r.plateNo) && normPersonName(r.driverName) === driver);
}
