import type { MeasureTicket } from "@/lib/types";

/** 计量单对外展示 / 校核用的核心字段（与工作流 J_* 命名一致） */
export interface MeasureCoreFields {
  DATE: string;
  J_WB_No: string;
  J_Veh_No: string;
  J_Driver: string;
  J_N_Weight: number;
  J_A_Weight: number;
  J_Mat_Type: string;
}

const CORE_FIELD_LABELS: Record<keyof MeasureCoreFields, string> = {
  DATE: "检重时间",
  J_WB_No: "磅单号",
  J_Veh_No: "车号",
  J_Driver: "司机",
  J_N_Weight: "净重(KG)",
  J_A_Weight: "实际重量(KG)",
  J_Mat_Type: "物料类型",
};

export function getMeasureCoreFieldLabel(key: keyof MeasureCoreFields): string {
  return CORE_FIELD_LABELS[key];
}

/** 检重日期：优先 grossTime，否则 tareTime，格式 YYYY-MM-DD */
export function formatMeasureDate(ticket: Pick<MeasureTicket, "grossTime" | "tareTime">): string {
  const raw = ticket.grossTime?.trim() || ticket.tareTime?.trim() || "";
  if (!raw) return "-";

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const slash = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  return raw.split(/\s+/)[0] || "-";
}

export function getMeasureCoreFields(ticket: MeasureTicket): MeasureCoreFields {
  return {
    DATE: formatMeasureDate(ticket),
    J_WB_No: ticket.ticketNo?.trim() || "-",
    J_Veh_No: ticket.plateNo?.trim() || "-",
    J_Driver: ticket.driverName?.trim() || "-",
    J_N_Weight: ticket.netWeight ?? 0,
    J_A_Weight: ticket.actualWeight || ticket.netWeight || 0,
    J_Mat_Type: ticket.materialType?.trim() || "-",
  };
}

export function formatMeasureCoreValue(
  key: keyof MeasureCoreFields,
  fields: MeasureCoreFields
): string {
  if (key === "J_N_Weight" || key === "J_A_Weight") {
    const n = fields[key];
    return n > 0 ? n.toLocaleString() : "-";
  }
  return fields[key] || "-";
}
