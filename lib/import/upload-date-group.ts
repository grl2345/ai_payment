import type { InboundRecord, MeasureTicket, UploadedFileRecord } from "@/lib/types";

export type DateGroup<T> = {
  dateKey: string;
  label: string;
  count: number;
  items: T[];
};

export type UploadDateGroup = DateGroup<UploadedFileRecord> & {
  files: UploadedFileRecord[];
};

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

/** 解析时间字符串：2026/6/1 15:01:18 或 2025-04-01 10:18:26 */
export function parseUploadTime(uploadTime: string): Date | null {
  if (!uploadTime?.trim()) return null;

  const trimmed = uploadTime.trim();
  const [datePart, timePart] = trimmed.split(/\s+/);

  const slashMatch = datePart.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  const isoMatch = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dateMatch = slashMatch ?? isoMatch;
  if (!dateMatch) {
    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timePart) {
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
      seconds = timeMatch[3] ? Number(timeMatch[3]) : 0;
    }
  }

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

export function getUploadDateKey(uploadTime: string): string {
  const date = parseUploadTime(uploadTime);
  if (!date) return "unknown";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatUploadTimeOnly(uploadTime: string): string {
  const parts = uploadTime.trim().split(/\s+/);
  return parts[1] ?? uploadTime;
}

/** 表格日期列、分组标题：yyyy-MM-dd */
export function formatRecordDate(dateKey: string): string {
  if (dateKey === "unknown") return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 上传记录行内完整时间：2026/6/1 15:20:42 */
export function formatUploadRecordDateTime(uploadTime: string): string {
  const date = parseUploadTime(uploadTime);
  if (!date) return uploadTime;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}/${m}/${d} ${h}:${min}:${s}`;
}

/** 分组标题：yyyy-MM-dd */
export function formatDateGroupHeader(dateKey: string): string {
  if (dateKey === "unknown") return "未知日期";
  return formatRecordDate(dateKey);
}

export function formatUploadDateGroupLabel(dateKey: string): string {
  if (dateKey === "unknown") return "未知日期";

  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";

  return `${y}年${m}月${d}日 周${WEEKDAY_LABELS[date.getDay()]}`;
}

export function groupItemsByDate<T>(
  items: T[],
  getDateTime: (item: T) => string
): DateGroup<T>[] {
  const sorted = [...items].sort((a, b) => {
    const ta = parseUploadTime(getDateTime(a))?.getTime() ?? 0;
    const tb = parseUploadTime(getDateTime(b))?.getTime() ?? 0;
    return tb - ta;
  });

  const order: string[] = [];
  const map = new Map<string, T[]>();

  for (const item of sorted) {
    const key = getUploadDateKey(getDateTime(item));
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }

  return order.map((dateKey) => {
    const groupItems = map.get(dateKey)!;
    return {
      dateKey,
      label: formatDateGroupHeader(dateKey),
      count: groupItems.length,
      items: groupItems,
    };
  });
}

export function groupUploadsByDate(
  files: UploadedFileRecord[]
): UploadDateGroup[] {
  return groupItemsByDate(files, (file) => file.uploadTime).map((group) => ({
    ...group,
    files: group.items,
  }));
}

export function groupMeasureTicketsByDate(
  tickets: MeasureTicket[]
): DateGroup<MeasureTicket>[] {
  return groupItemsByDate(tickets, (ticket) => ticket.createdAt);
}

export function getInboundRecordDateTime(record: InboundRecord): string {
  const businessDate = record.inboundDate?.trim();
  if (businessDate) return businessDate;
  return record.createdAt;
}

export function getInboundRecordDateKey(record: InboundRecord): string {
  return getUploadDateKey(getInboundRecordDateTime(record));
}

export function formatInboundRecordDate(record: InboundRecord): string {
  const key = getInboundRecordDateKey(record);
  return formatRecordDate(key);
}

/** 将搜索词规范为 YYYY-MM-DD，支持 2026-06-01、2026/6/1、20260601 */
export function normalizeDateSearchQuery(query: string): string | null {
  const q = query.trim();
  if (!q) return null;

  const iso = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const slash = q.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }

  const compact = q.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }

  const parsed = parseUploadTime(q);
  if (parsed) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return null;
}

export function filterGroupsByDate<T>(
  groups: DateGroup<T>[],
  dateSearchKey: string | null
): DateGroup<T>[] {
  if (!dateSearchKey) return groups;
  return groups.filter((group) => group.dateKey === dateSearchKey);
}

export function countGroupedItems<T>(groups: DateGroup<T>[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}

export function groupInboundRecordsByDate(
  records: InboundRecord[]
): DateGroup<InboundRecord>[] {
  return groupItemsByDate(records, getInboundRecordDateTime);
}
