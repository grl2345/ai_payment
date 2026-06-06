import { buildStatisticsFromPayments, currentMonthKey } from "@/lib/import/statistics-data";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
  UploadedFileRecord,
} from "@/lib/types";

function parseDateKey(value: string): string | null {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }
  return null;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DashboardStats {
  today: {
    uploadCount: number;
    recognizeSuccess: number;
    matchSuccess: number;
    exceptionCount: number;
    confirmedCount: number;
    measurePending: number;
    inboundPending: number;
  };
  month: {
    salesTons: number;
    receivableAmount: number;
    payableAmount: number;
    grossProfit: number;
    pendingPayment: number;
    pendingInvoice: number;
    paymentCount: number;
  };
}

export function computeDashboardStats(input: {
  uploads: UploadedFileRecord[];
  measureTickets: MeasureTicket[];
  inboundRecords: InboundRecord[];
  ticketMatches: TicketMatch[];
  paymentDetails: PaymentDetail[];
}): DashboardStats {
  const today = todayKey();
  const month = currentMonthKey();

  const todayUploads = input.uploads.filter((u) => {
    const key = parseDateKey(u.uploadTime.replace(/\//g, "-"));
    return key === today;
  });

  const todayMeasures = input.measureTickets.filter((t) => {
    const key =
      parseDateKey(t.createdAt.replace(/\//g, "-")) ||
      parseDateKey(t.grossTime) ||
      parseDateKey(t.tareTime);
    return key === today;
  });

  const recognizeSuccess = todayMeasures.filter(
    (t) => t.ocrStatus === "已审核" || (t.confidence >= 80 && t.ocrStatus !== "识别失败")
  ).length;

  const exceptionTickets = input.ticketMatches.filter(
    (m) =>
      m.matchStatus === "核对异常" ||
      m.matchStatus === "待匹配" ||
      m.matchStatus === "疑似匹配"
  );

  const todayMatches = input.ticketMatches.filter((m) => {
    const key = parseDateKey(m.updatedAt.replace(/\//g, "-"));
    return key === today && m.matchStatus === "匹配成功";
  });

  const monthStats = buildStatisticsFromPayments(input.paymentDetails, { month });

  const measurePending = input.measureTickets.filter((t) => t.ocrStatus === "待审核").length;
  const inboundPending = input.inboundRecords.filter(
    (r) => r.reviewStatus === "待审核"
  ).length;

  const pendingPayment = input.paymentDetails
    .filter((p) => p.paymentStatus !== "已支付")
    .reduce((sum, p) => sum + Math.max(0, p.payableAmount - p.paidAmount), 0);

  const pendingInvoice = input.paymentDetails
    .filter((p) => p.invoiceStatus === "未开票")
    .reduce((sum, p) => sum + p.receivableAmount, 0);

  return {
    today: {
      uploadCount: todayUploads.length,
      recognizeSuccess,
      matchSuccess: todayMatches.length,
      exceptionCount: exceptionTickets.length,
      confirmedCount: input.ticketMatches.filter((m) => m.matchStatus === "已确认").length,
      measurePending,
      inboundPending,
    },
    month: {
      salesTons: monthStats.totals.tons,
      receivableAmount: monthStats.totals.receivable,
      payableAmount: monthStats.totals.payable,
      grossProfit: monthStats.totals.profit,
      pendingPayment,
      pendingInvoice,
      paymentCount: monthStats.totals.count,
    },
  };
}

export function getExceptionMatches(matches: TicketMatch[]): TicketMatch[] {
  return matches.filter(
    (m) =>
      m.matchStatus === "核对异常" ||
      m.matchStatus === "待匹配" ||
      m.matchStatus === "疑似匹配"
  );
}
