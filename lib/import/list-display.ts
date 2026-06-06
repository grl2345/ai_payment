/** 列表与表单展示：检重/检轻时间、重量等格式化 */

const pad2 = (n: string | number) => String(n).padStart(2, "0");

/** 重量保留 2 位小数（列表展示） */
export function formatWeightKg(value: number): string {
  if (value == null || Number.isNaN(value)) return "-";
  if (value < 0) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 表单输入框展示用 */
export function formatWeightInput(value: number): string {
  if (value == null || Number.isNaN(value)) return "";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function parseWeightInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function roundWeightKg(value: number): number {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** 规范为 YYYY-MM-DD HH:mm:ss */
export function normalizeWeighTime(value: string): string {
  const v = value.trim().replace(/\//g, "-");
  if (!v) return "";

  const full = v.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/
  );
  if (full) {
    return `${full[1]}-${pad2(full[2])}-${pad2(full[3])} ${pad2(full[4])}:${pad2(full[5])}:${pad2(full[6] ?? "0")}`;
  }

  const dateOnly = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    return `${dateOnly[1]}-${pad2(dateOnly[2])}-${pad2(dateOnly[3])} 00:00:00`;
  }

  return v;
}

/** 检重/检轻时间展示（含完整日期） */
export function formatWeighTime(value: string): string {
  const v = value.trim();
  if (!v) return "-";
  const normalized = normalizeWeighTime(v);
  return normalized || v;
}

/** @deprecated 请使用 formatWeighTime */
export const formatWeighTimeShort = formatWeighTime;

export interface MeasureWeightLine {
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  deductWeight: number;
  actualWeight: number;
}

/** 计量单列表：毛/皮/净/实重一行展示 */
export function formatMeasureWeightSummary(ticket: MeasureWeightLine): string {
  if (
    ticket.grossWeight <= 0 &&
    ticket.tareWeight <= 0 &&
    ticket.netWeight <= 0 &&
    ticket.actualWeight <= 0
  ) {
    return "-";
  }

  const gross = formatWeightKg(ticket.grossWeight);
  const tare = formatWeightKg(ticket.tareWeight);
  const net = formatWeightKg(ticket.netWeight);
  const actual = ticket.actualWeight || ticket.netWeight;
  const showActual =
    ticket.deductWeight > 0 ||
    (actual > 0 && ticket.netWeight > 0 && actual !== ticket.netWeight);

  if (showActual) {
    return `毛${gross} / 皮${tare} / 净${net} / 实${formatWeightKg(actual)}`;
  }
  return `毛${gross} / 皮${tare} / 净${net}`;
}
