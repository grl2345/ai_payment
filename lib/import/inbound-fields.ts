import type { InboundRecord } from "@/lib/types";

/** 采购入库单对外展示 / 校核用的核心字段（与工作流 C_* 命名一致） */
export interface PurchaseCoreFields {
  C_WB_No: string;
  C_Veh_No: string;
  C_Driver: string;
  C_Settle_Weight: number;
  C_Dry_Weight: number;
  C_Percentage: number;
  C_Base_Price: number;
  Total_Amount: number;
  C_Mat_Type: string;
}

const CORE_FIELD_LABELS: Record<keyof PurchaseCoreFields, string> = {
  C_WB_No: "磅单编号",
  C_Veh_No: "车牌",
  C_Driver: "司机",
  C_Settle_Weight: "结算重量(吨)",
  C_Dry_Weight: "绝干重量(吨)",
  C_Percentage: "水分百分比",
  C_Base_Price: "结算基础",
  Total_Amount: "采购总金额",
  C_Mat_Type: "物料类型",
};

export function getPurchaseCoreFieldLabel(key: keyof PurchaseCoreFields): string {
  return CORE_FIELD_LABELS[key];
}

export function getPurchaseCoreFields(record: InboundRecord): PurchaseCoreFields {
  return {
    C_WB_No: record.ticketNo?.trim() || "-",
    C_Veh_No: record.plateNo?.trim() || "-",
    C_Driver: record.driverName?.trim() || "-",
    C_Settle_Weight: record.settlementWeight ?? 0,
    C_Dry_Weight: record.dryWeight ?? 0,
    C_Percentage: record.moisturePercent ?? 0,
    C_Base_Price: record.basePrice ?? 0,
    Total_Amount: record.purchaseAmount ?? 0,
    C_Mat_Type: record.materialType?.trim() || "-",
  };
}

export function formatPurchaseCoreValue(
  key: keyof PurchaseCoreFields,
  fields: PurchaseCoreFields
): string {
  switch (key) {
    case "C_Settle_Weight":
    case "C_Dry_Weight":
      return fields[key] > 0 ? fields[key].toFixed(3) : "-";
    case "C_Percentage":
      return fields[key] > 0 ? `${fields[key]}%` : "-";
    case "C_Base_Price":
      return fields[key] > 0 ? fields[key].toFixed(2) : "-";
    case "Total_Amount":
      return fields[key] > 0 ? fields[key].toLocaleString() : "-";
    case "C_WB_No":
      return fields[key] || "-";
    default:
      return fields[key]?.toString() || "-";
  }
}
