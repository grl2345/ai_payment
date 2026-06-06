import type { DataStore, InboundRecord, MeasureTicket } from "@/lib/types";

/** 磅单编号规范化：去空格、统一大写 */
export function normalizeTicketNo(ticketNo: string): string {
  return ticketNo.trim().toUpperCase();
}

export function buildDuplicateTicketNoSet(
  ticketNos: string[]
): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of ticketNos) {
    const key = normalizeTicketNo(raw);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

export function isInboundTicketNoTaken(
  store: Pick<DataStore, "inboundRecords">,
  ticketNo: string,
  excludeId?: string
): boolean {
  const key = normalizeTicketNo(ticketNo);
  if (!key) return false;
  return store.inboundRecords.some(
    (r) =>
      r.id !== excludeId && normalizeTicketNo(r.ticketNo) === key
  );
}

export function isMeasureTicketNoTaken(
  store: Pick<DataStore, "measureTickets">,
  ticketNo: string,
  excludeId?: string
): boolean {
  const key = normalizeTicketNo(ticketNo);
  if (!key) return false;
  return store.measureTickets.some(
    (t) =>
      t.id !== excludeId && normalizeTicketNo(t.ticketNo) === key
  );
}

export function getInboundDuplicateMessage(
  store: Pick<DataStore, "inboundRecords">,
  ticketNo: string,
  excludeId?: string
): string {
  if (!normalizeTicketNo(ticketNo)) return "";
  if (!isInboundTicketNoTaken(store, ticketNo, excludeId)) return "";
  return `磅单编号「${ticketNo.trim()}」已存在，不可重复`;
}

export function getMeasureDuplicateMessage(
  store: Pick<DataStore, "measureTickets">,
  ticketNo: string,
  excludeId?: string
): string {
  if (!normalizeTicketNo(ticketNo)) return "";
  if (!isMeasureTicketNoTaken(store, ticketNo, excludeId)) return "";
  return `磅单号「${ticketNo.trim()}」已存在，不可重复`;
}

export type InboundInsertDedupeResult = {
  toInsert: InboundRecord[];
  skipped: Array<{ ticketNo: string; reason: string }>;
};

/** 导入入库单：跳过与库内重复、本批重复的编号（保留首次出现） */
export function dedupeInboundRecordsForInsert(
  records: InboundRecord[],
  existing: InboundRecord[]
): InboundInsertDedupeResult {
  const storeKeys = new Set(
    existing
      .map((r) => normalizeTicketNo(r.ticketNo))
      .filter(Boolean)
  );
  const batchKeys = new Set<string>();
  const toInsert: InboundRecord[] = [];
  const skipped: InboundInsertDedupeResult["skipped"] = [];

  for (const record of records) {
    const key = normalizeTicketNo(record.ticketNo);
    if (!key) {
      toInsert.push(record);
      continue;
    }
    if (storeKeys.has(key)) {
      skipped.push({
        ticketNo: record.ticketNo,
        reason: "系统中已存在相同磅单编号",
      });
      continue;
    }
    if (batchKeys.has(key)) {
      skipped.push({
        ticketNo: record.ticketNo,
        reason: "本批导入中磅单编号重复",
      });
      continue;
    }
    batchKeys.add(key);
    storeKeys.add(key);
    toInsert.push(record);
  }

  return { toInsert, skipped };
}

export type MeasureInsertDedupeResult = {
  toInsert: MeasureTicket[];
  skipped: Array<{ ticketNo: string; reason: string }>;
};

export function dedupeMeasureTicketsForInsert(
  tickets: MeasureTicket[],
  existing: MeasureTicket[]
): MeasureInsertDedupeResult {
  const storeKeys = new Set(
    existing
      .map((t) => normalizeTicketNo(t.ticketNo))
      .filter(Boolean)
  );
  const batchKeys = new Set<string>();
  const toInsert: MeasureTicket[] = [];
  const skipped: MeasureInsertDedupeResult["skipped"] = [];

  for (const ticket of tickets) {
    const key = normalizeTicketNo(ticket.ticketNo);
    if (!key) {
      toInsert.push(ticket);
      continue;
    }
    if (storeKeys.has(key)) {
      skipped.push({
        ticketNo: ticket.ticketNo,
        reason: "系统中已存在相同磅单号",
      });
      continue;
    }
    if (batchKeys.has(key)) {
      skipped.push({
        ticketNo: ticket.ticketNo,
        reason: "本批上传中磅单号重复",
      });
      continue;
    }
    batchKeys.add(key);
    storeKeys.add(key);
    toInsert.push(ticket);
  }

  return { toInsert, skipped };
}
