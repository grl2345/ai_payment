/** 磅单号常见格式：字母前缀 + 8 位日期(YYYYMMDD) + 流水号 */
const TICKET_EMBEDDED_DATE_RE = /^[A-Za-z]+(\d{8})\d+$/;

export function parseTicketEmbeddedDate(ticketNo: string): string | null {
  const trimmed = ticketNo.trim();
  const match = trimmed.match(TICKET_EMBEDDED_DATE_RE);
  return match ? match[1] : null;
}

/** 将 2025-03-31、2025/3/31 等转为 YYYYMMDD */
export function normalizeDateYmd(value: string): string | null {
  const v = value.trim();
  if (!v) return null;

  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}${iso[2].padStart(2, "0")}${iso[3].padStart(2, "0")}`;
  }

  const slash = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    return `${slash[1]}${slash[2].padStart(2, "0")}${slash[3].padStart(2, "0")}`;
  }

  const compact = v.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    return `${compact[1]}${compact[2]}${compact[3]}`;
  }

  return null;
}

/** 判断 YYYYMMDD 字符串是否是合法日历日期（年 1000-2099，月 01-12，日 01-31） */
function isValidYmd(ymd: string): boolean {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1000 || year > 2099) return false;
  return true;
}

export function validateTicketNoDateConsistency(
  ticketNo: string,
  outboundDate: string,
  inboundDate?: string
): { consistent: boolean; issue: string } {
  const embedded = parseTicketEmbeddedDate(ticketNo);
  // 提取失败，或提取到的不是合法日历日期（如 日=00），跳过校验
  if (!embedded || !isValidYmd(embedded)) {
    return { consistent: true, issue: "" };
  }

  const ref =
    normalizeDateYmd(outboundDate) ||
    normalizeDateYmd(inboundDate ?? "");

  if (!ref) {
    return { consistent: true, issue: "" };
  }

  // 只比较年-月部分；若日不同但月相同则视为一致（票号可能只含年月）
  if (embedded.slice(0, 6) !== ref.slice(0, 6)) {
    const embeddedFmt = `${embedded.slice(0, 4)}-${embedded.slice(4, 6)}-${embedded.slice(6, 8)}`;
    const refFmt = `${ref.slice(0, 4)}-${ref.slice(4, 6)}-${ref.slice(6, 8)}`;
    return {
      consistent: false,
      issue: `磅单编号内日期（${embeddedFmt}）与出厂过磅日期（${refFmt}）不一致，需人工复核`,
    };
  }

  return { consistent: true, issue: "" };
}
