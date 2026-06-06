import type { PaymentDetail } from "@/lib/types";

export type DailyStatRow = {
  /** 业务日期 YYYY-MM-DD */
  date: string;
  /** 图表横轴短标签，如 4月1日 */
  label: string;
  tons: number;
  receivable: number;
  payable: number;
  profit: number;
};

export type MonthlyStatRow = {
  month: string;
  tons: number;
  receivable: number;
  payable: number;
  profit: number;
};

export type SupplierStatRow = {
  name: string;
  tons: number;
  amount: number;
  percent: number;
};

export type VehicleStatRow = {
  plateNo: string;
  driver: string;
  trips: number;
  tons: number;
  amount: number;
};

export function monthFromDate(dateStr: string): string | null {
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStartEnd(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, "0")}`,
  };
}

/** 付款明细中最近一个有数据的业务月份 */
export function latestMonthFromPayments(payments: PaymentDetail[]): string | null {
  let latest: string | null = null;
  for (const p of payments) {
    const m = monthFromDate(p.businessDate);
    if (!m) continue;
    if (!latest || m > latest) latest = m;
  }
  return latest;
}

/** 展示用月份：当月有数据用当月，否则用最近业务月 */
export function resolveDisplayMonth(payments: PaymentDetail[]): string {
  const current = currentMonthKey();
  const currentStats = buildStatisticsFromPayments(payments, { month: current });
  if (currentStats.totals.count > 0) return current;
  return latestMonthFromPayments(payments) ?? current;
}

export function profitRatePercent(receivable: number, profit: number): string {
  if (receivable <= 0) return "0.00";
  return ((profit / receivable) * 100).toFixed(2);
}

function chartDayLabel(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${Number(m[2])}月${Number(m[3])}日`;
}

export function buildStatisticsFromPayments(
  payments: PaymentDetail[],
  options: { month?: string; start?: string; end?: string }
): {
  daily: DailyStatRow[];
  monthly: MonthlyStatRow[];
  suppliers: SupplierStatRow[];
  vehicles: VehicleStatRow[];
  totals: {
    tons: number;
    receivable: number;
    payable: number;
    profit: number;
    count: number;
  };
} {
  let filtered = payments.filter((p) => p.businessDate);

  if (options.month) {
    filtered = filtered.filter(
      (p) => monthFromDate(p.businessDate) === options.month
    );
  }
  if (options.start) {
    filtered = filtered.filter((p) => p.businessDate >= options.start!);
  }
  if (options.end) {
    filtered = filtered.filter((p) => p.businessDate <= options.end!);
  }

  const dailyMap = new Map<string, DailyStatRow>();
  for (const p of filtered) {
    const key = p.businessDate;
    const row = dailyMap.get(key) ?? {
      date: key,
      label: chartDayLabel(key),
      tons: 0,
      receivable: 0,
      payable: 0,
      profit: 0,
    };
    row.tons += p.settlementWeight;
    row.receivable += p.receivableAmount;
    row.payable += p.payableAmount;
    row.profit += p.grossProfit;
    dailyMap.set(key, row);
  }

  const monthlyMap = new Map<string, MonthlyStatRow>();
  for (const p of filtered) {
    const key = monthFromDate(p.businessDate) ?? "unknown";
    const row = monthlyMap.get(key) ?? {
      month: key,
      tons: 0,
      receivable: 0,
      payable: 0,
      profit: 0,
    };
    row.tons += p.settlementWeight;
    row.receivable += p.receivableAmount;
    row.payable += p.payableAmount;
    row.profit += p.grossProfit;
    monthlyMap.set(key, row);
  }

  const supplierMap = new Map<string, { tons: number; receivable: number; payable: number }>();
  for (const p of filtered) {
    const name = p.supplierName || "未知";
    const row = supplierMap.get(name) ?? { tons: 0, receivable: 0, payable: 0 };
    row.tons += p.settlementWeight;
    row.receivable += p.receivableAmount;
    row.payable += p.payableAmount;
    supplierMap.set(name, row);
  }
  const totalPayable = [...supplierMap.values()].reduce((s, r) => s + r.payable, 0);

  const vehicleMap = new Map<string, VehicleStatRow>();
  for (const p of filtered) {
    const key = `${p.plateNo}|${p.driverName}`;
    const row = vehicleMap.get(key) ?? {
      plateNo: p.plateNo,
      driver: p.driverName,
      trips: 0,
      tons: 0,
      amount: 0,
    };
    row.trips += 1;
    row.tons += p.settlementWeight;
    row.amount += p.payableAmount;
    vehicleMap.set(key, row);
  }

  const totals = filtered.reduce(
    (acc, p) => ({
      tons: acc.tons + p.settlementWeight,
      receivable: acc.receivable + p.receivableAmount,
      payable: acc.payable + p.payableAmount,
      profit: acc.profit + p.grossProfit,
      count: acc.count + 1,
    }),
    { tons: 0, receivable: 0, payable: 0, profit: 0, count: 0 }
  );

  return {
    daily: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    monthly: [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    suppliers: [...supplierMap.entries()]
      .map(([name, row]) => ({
        name,
        tons: row.tons,
        amount: row.payable,
        receivable: row.receivable,
        percent:
          totalPayable > 0 ? Math.round((row.payable / totalPayable) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
    vehicles: [...vehicleMap.values()].sort((a, b) => b.amount - a.amount),
    totals,
  };
}
