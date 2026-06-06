/** 采购入库单：字段展示名与数值格式 */

export const INBOUND_DEDUCT_WEIGHT_DECIMALS = 4;
export const INBOUND_BASE_PRICE_DECIMALS = 2;
export const INBOUND_DRY_WEIGHT_DECIMALS = 2;
export const INBOUND_SETTLEMENT_WEIGHT_DECIMALS = 2;

/** 与采购 Excel 表头一致的展示名称 */
export const INBOUND_FIELD_LABELS = {
  ticketNo: "磅单编号",
  outboundDate: "出厂过磅日期",
  inboundTime: "进厂过磅时间",
  supplierName: "供应商名称",
  plateNo: "车牌",
  driverName: "司机",
  materialType: "物料类别",
  regionName: "区域名称",
  originalAttached: "付原件",
  inboundDate: "进厂过磅日期",
  deductWeight: "扣重(KG)",
  deductReason: "扣重原因",
  netWeight: "过磅净重(KG)",
  moisturePercent: "水分百分比",
  settlementWeight: "结算重量(吨)",
  dryWeight: "绝干重量(吨)",
  basePrice: "结算基础",
  purchaseAmount: "采购总金额",
  factoryName: "工厂名称",
  areaName: "大区名称",
} as const;

function roundDecimal(value: number, fractionDigits: number): number {
  if (value == null || Number.isNaN(value)) return 0;
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

export function roundInboundDeductWeight(value: number): number {
  return roundDecimal(value, INBOUND_DEDUCT_WEIGHT_DECIMALS);
}

export function roundInboundBasePrice(value: number): number {
  return roundDecimal(value, INBOUND_BASE_PRICE_DECIMALS);
}

export function formatInboundDeductWeight(value: number): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value < 0) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_DEDUCT_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_DEDUCT_WEIGHT_DECIMALS,
  });
}

export function roundInboundDryWeight(value: number): number {
  return roundDecimal(value, INBOUND_DRY_WEIGHT_DECIMALS);
}

export function roundInboundSettlementWeight(value: number): number {
  return roundDecimal(value, INBOUND_SETTLEMENT_WEIGHT_DECIMALS);
}

export function formatInboundDryWeight(value: number): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value < 0) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_DRY_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_DRY_WEIGHT_DECIMALS,
  });
}

export function formatInboundSettlementWeight(value: number): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value < 0) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_SETTLEMENT_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_SETTLEMENT_WEIGHT_DECIMALS,
  });
}

export function formatInboundBasePrice(value: number): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value < 0) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_BASE_PRICE_DECIMALS,
    maximumFractionDigits: INBOUND_BASE_PRICE_DECIMALS,
  });
}

export function formatInboundDeductInput(value: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_DEDUCT_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_DEDUCT_WEIGHT_DECIMALS,
  });
}

export function formatInboundBasePriceInput(value: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_BASE_PRICE_DECIMALS,
    maximumFractionDigits: INBOUND_BASE_PRICE_DECIMALS,
  });
}

export function parseInboundDeductInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return roundInboundDeductWeight(n);
}

export function parseInboundBasePriceInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return roundInboundBasePrice(n);
}

export function formatInboundDryWeightInput(value: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_DRY_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_DRY_WEIGHT_DECIMALS,
  });
}

export function formatInboundSettlementWeightInput(value: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: INBOUND_SETTLEMENT_WEIGHT_DECIMALS,
    maximumFractionDigits: INBOUND_SETTLEMENT_WEIGHT_DECIMALS,
  });
}

export function parseInboundDryWeightInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return roundInboundDryWeight(n);
}

export function parseInboundSettlementWeightInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return roundInboundSettlementWeight(n);
}

export function normalizeInboundNumericFields<
  T extends {
    deductWeight?: number;
    basePrice?: number;
    dryWeight?: number;
    settlementWeight?: number;
  },
>(patch: T): T {
  const next = { ...patch };
  if (typeof next.deductWeight === "number") {
    next.deductWeight = roundInboundDeductWeight(next.deductWeight);
  }
  if (typeof next.basePrice === "number") {
    next.basePrice = roundInboundBasePrice(next.basePrice);
  }
  if (typeof next.dryWeight === "number") {
    next.dryWeight = roundInboundDryWeight(next.dryWeight);
  }
  if (typeof next.settlementWeight === "number") {
    next.settlementWeight = roundInboundSettlementWeight(next.settlementWeight);
  }
  return next;
}
