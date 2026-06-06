"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  TrendingUp,
  Package,
  DollarSign,
  BarChart3,
  Loader2,
  CalendarRange,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  buildStatisticsFromPayments,
  currentMonthKey,
  latestMonthFromPayments,
  monthStartEnd,
  profitRatePercent,
  resolveDisplayMonth,
} from "@/lib/import/statistics-data";
import type { PaymentDetail } from "@/lib/types";

const PIE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444"];
const CHART_PRIMARY = "#16a34a";
const CHART_PROFIT = "#d97706";

const chartMargin = { top: 12, right: 16, left: 4, bottom: 4 };

function ChartTooltipContent({
  active,
  payload,
  label,
  valuePrefix = "",
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  valuePrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/80 bg-background px-3 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-medium text-foreground">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} className="tabular-nums text-muted-foreground">
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name}：
          <span className="font-medium text-foreground">
            {typeof entry.value === "number"
              ? valuePrefix === "¥"
                ? `¥${formatAmount(entry.value)}`
                : entry.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
              : entry.value}
          </span>
        </p>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  hint,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-muted/20 p-4",
        className
      )}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
        {hint ? (
          <p className="mt-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function DataTableShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background overflow-hidden">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function StatisticsPageContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey());
  const [dateRange, setDateRange] = useState(() => {
    const { start, end } = monthStartEnd(currentMonthKey());
    return { start, end };
  });

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (res.ok) {
        setPayments(data.paymentDetails ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (loading || initialized) return;
    const param = searchParams.get("month")?.trim();
    const month =
      param && /^\d{4}-\d{2}$/.test(param)
        ? param
        : resolveDisplayMonth(payments);
    setSelectedMonth(month);
    setInitialized(true);
  }, [loading, payments, searchParams, initialized]);

  useEffect(() => {
    const { start, end } = monthStartEnd(selectedMonth);
    setDateRange({ start, end });
  }, [selectedMonth]);

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const p of payments) {
      const m = p.businessDate?.match(/^(\d{4}-\d{2})/);
      if (m) keys.add(m[1]);
    }
    keys.add(currentMonthKey());
    const latest = latestMonthFromPayments(payments);
    if (latest) keys.add(latest);
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [payments]);

  const rangeStats = useMemo(
    () =>
      buildStatisticsFromPayments(payments, {
        start: dateRange.start,
        end: dateRange.end,
      }),
    [payments, dateRange]
  );

  const allMonthlyStats = useMemo(
    () => buildStatisticsFromPayments(payments, {}).monthly,
    [payments]
  );

  const profitRate = profitRatePercent(
    rangeStats.totals.receivable,
    rangeStats.totals.profit
  );

  const rangeLabel = `${dateRange.start} ~ ${dateRange.end}`;
  const maxDailyTons = useMemo(
    () => Math.max(...rangeStats.daily.map((d) => d.tons), 0),
    [rangeStats.daily]
  );
  const maxDailyProfit = useMemo(
    () => Math.max(...rangeStats.daily.map((d) => Math.abs(d.profit)), 0),
    [rangeStats.daily]
  );

  const dailyChartHint = useMemo(() => {
    if (rangeStats.daily.length === 0) return undefined;
    if (rangeStats.daily.length === 1) {
      const d = rangeStats.daily[0];
      return `本区间 ${rangeStats.totals.count} 笔付款均发生在 ${d.label}，日趋势图仅 1 天数据。`;
    }
    return `共 ${rangeStats.daily.length} 个交易日、${rangeStats.totals.count} 笔付款`;
  }, [rangeStats.daily, rangeStats.totals.count]);

  const useProfitBars = rangeStats.daily.length <= 5;

  return (
    <div className="flex h-full flex-col bg-[#eef0f3] dark:bg-muted/15">
      <Header
        title="统计查询"
        description="看永丰应收、精竹应付和毛利；数据来自已核对并生成的付款明细"
        eyebrow="财务统计"
      />

      <div className="flex-1 space-y-4 overflow-auto p-4 sm:p-5">
        <Card className="border-0 bg-background shadow-sm ring-1 ring-border/50">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <CalendarRange className="h-5 w-5 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold">选择统计区间</p>
                  <p className="text-xs text-muted-foreground">
                    先选月份，也可微调起止日期
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">快捷月份</Label>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="h-9 w-[9.5rem] bg-muted/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">开始</Label>
                  <Input
                    type="date"
                    className="h-9 w-[10.5rem]"
                    value={dateRange.start}
                    onChange={(e) =>
                      setDateRange((d) => ({ ...d, start: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">结束</Label>
                  <Input
                    type="date"
                    className="h-9 w-[10.5rem]"
                    value={dateRange.end}
                    onChange={(e) =>
                      setDateRange((d) => ({ ...d, end: e.target.value }))
                    }
                  />
                </div>
                <Button variant="outline" size="sm" className="h-9" disabled>
                  <Download className="mr-1.5 h-4 w-4" />
                  导出
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground border-t border-border/50 pt-3">
              当前区间 <span className="font-medium text-foreground">{rangeLabel}</span>
              ，共{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {rangeStats.totals.count}
              </span>{" "}
              笔付款明细
            </p>
          </CardContent>
        </Card>

        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载付款明细…
          </p>
        )}

        {!loading && payments.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-14 text-center text-sm text-muted-foreground">
              暂无付款明细。请先在「AI 核对」中确认通过的单据。
            </CardContent>
          </Card>
        )}

        {payments.length > 0 && (
          <>
            <Card className="border-0 bg-background shadow-sm ring-1 ring-border/50 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/50 bg-muted/25 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">本区间毛利怎么算：</span>
                  <span className="tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                    永丰 ¥{formatAmount(rangeStats.totals.receivable)}
                  </span>
                  <span className="text-muted-foreground">−</span>
                  <span className="tabular-nums font-medium">
                    精竹 ¥{formatAmount(rangeStats.totals.payable)}
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="tabular-nums font-semibold text-amber-800 dark:text-amber-200">
                    毛利 ¥{formatAmount(rangeStats.totals.profit)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    （利润率 {profitRate}%）
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                  <StatCard
                    quickBi
                    title="结算吨数"
                    value={`${rangeStats.totals.tons.toFixed(2)} 吨`}
                    subtitle="按付款单结算重量合计"
                    icon={<Package className="h-5 w-5" />}
                    variant="primary"
                  />
                  <StatCard
                    quickBi
                    title="永丰应支付"
                    value={`¥${formatAmount(rangeStats.totals.receivable)}`}
                    subtitle="卖给永丰的应收金额"
                    icon={<DollarSign className="h-5 w-5" />}
                    variant="success"
                  />
                  <StatCard
                    quickBi
                    title="精竹支付"
                    value={`¥${formatAmount(rangeStats.totals.payable)}`}
                    subtitle="付给精竹供应商的成本"
                    icon={<DollarSign className="h-5 w-5" />}
                  />
                  <StatCard
                    quickBi
                    title="毛利"
                    value={`¥${formatAmount(rangeStats.totals.profit)}`}
                    subtitle="上面两项相减"
                    icon={<TrendingUp className="h-5 w-5" />}
                    variant={rangeStats.totals.profit < 0 ? "destructive" : "warning"}
                  />
                  <StatCard
                    quickBi
                    title="利润率"
                    value={`${profitRate}%`}
                    subtitle="毛利占永丰应收比例"
                    icon={<BarChart3 className="h-5 w-5" />}
                    variant={Number(profitRate) < 0 ? "destructive" : "default"}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-background shadow-sm ring-1 ring-border/50">
            <Tabs defaultValue="daily" className="w-full">
              <TabsList className="h-11 w-full justify-start gap-6 rounded-none border-b border-border/60 bg-transparent px-4 pb-0">
                <TabsTrigger
                  value="daily"
                  className="rounded-none border-b-2 border-transparent px-0 pb-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                >
                  按日
                </TabsTrigger>
                <TabsTrigger
                  value="monthly"
                  className="rounded-none border-b-2 border-transparent px-0 pb-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                >
                  按月
                </TabsTrigger>
                <TabsTrigger
                  value="supplier"
                  className="rounded-none border-b-2 border-transparent px-0 pb-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                >
                  供应商
                </TabsTrigger>
                <TabsTrigger
                  value="vehicle"
                  className="rounded-none border-b-2 border-transparent px-0 pb-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground"
                >
                  车辆
                </TabsTrigger>
              </TabsList>
              <div className="p-4 sm:p-5">

              <TabsContent value="daily" className="mt-0 space-y-4 focus-visible:outline-none">
                {rangeStats.daily.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      所选日期范围内无数据
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      <ChartCard
                        title="每日结算吨数"
                        subtitle="柱子越高，当天结算的木材越多"
                        hint={dailyChartHint}
                      >
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={rangeStats.daily} margin={chartMargin}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="hsl(var(--border))"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              axisLine={false}
                              tickLine={false}
                              width={44}
                              domain={[0, Math.ceil(Math.max(maxDailyTons * 1.15, 1))]}
                            />
                            <Tooltip content={<ChartTooltipContent valuePrefix="" />} />
                            <Bar
                              dataKey="tons"
                              name="吨数"
                              fill={CHART_PRIMARY}
                              maxBarSize={rangeStats.daily.length <= 2 ? 72 : 48}
                              radius={[6, 6, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                      <ChartCard
                        title="每日毛利"
                        subtitle="永丰应收 − 精竹应付，看每天赚多少"
                        hint={dailyChartHint}
                      >
                        <ResponsiveContainer width="100%" height={280}>
                          {useProfitBars ? (
                            <BarChart data={rangeStats.daily} margin={chartMargin}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                                width={52}
                                domain={[
                                  0,
                                  Math.ceil(Math.max(maxDailyProfit * 1.15, 1000)),
                                ]}
                                tickFormatter={(v) =>
                                  v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)
                                }
                              />
                              <Tooltip content={<ChartTooltipContent valuePrefix="¥" />} />
                              <Bar
                                dataKey="profit"
                                name="毛利"
                                fill={CHART_PROFIT}
                                maxBarSize={rangeStats.daily.length <= 2 ? 72 : 48}
                                radius={[6, 6, 0, 0]}
                              />
                            </BarChart>
                          ) : (
                            <LineChart data={rangeStats.daily} margin={chartMargin}>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="hsl(var(--border))"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                                width={52}
                                domain={[
                                  0,
                                  Math.ceil(Math.max(maxDailyProfit * 1.15, 1000)),
                                ]}
                                tickFormatter={(v) =>
                                  v >= 10000 ? `${(v / 10000).toFixed(0)}万` : String(v)
                                }
                              />
                              <Tooltip content={<ChartTooltipContent valuePrefix="¥" />} />
                              <Line
                                type="monotone"
                                dataKey="profit"
                                name="毛利"
                                stroke={CHART_PROFIT}
                                strokeWidth={2}
                                dot={{ r: 4, fill: CHART_PROFIT, strokeWidth: 0 }}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </ChartCard>
                    </div>
                    <DataTableShell title="按日明细表">
                        <div className="overflow-x-auto rounded-lg border border-border/60">
                          <Table className="min-w-[620px]">
                            <TableHeader>
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead className="h-9 text-xs">日期</TableHead>
                                <TableHead className="h-9 text-right text-xs">吨数</TableHead>
                                <TableHead className="h-9 text-right text-xs">
                                  永丰应支付
                                </TableHead>
                                <TableHead className="h-9 text-right text-xs">精竹支付</TableHead>
                                <TableHead className="h-9 text-right text-xs">毛利</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rangeStats.daily.map((row) => (
                                <TableRow key={row.date}>
                                  <TableCell className="text-xs">
                                    <span className="font-medium">{row.label}</span>
                                    <span className="ml-1.5 font-mono text-muted-foreground">
                                      {row.date}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">
                                    {row.tons.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs text-success">
                                    ¥{formatAmount(row.receivable)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">
                                    ¥{formatAmount(row.payable)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs text-chart-3">
                                    ¥{formatAmount(row.profit)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                    </DataTableShell>
                  </>
                )}
              </TabsContent>

              <TabsContent value="monthly" className="mt-0 focus-visible:outline-none">
                    {allMonthlyStats.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        暂无数据
                      </p>
                    ) : (
                      <DataTableShell title="各月汇总（全部历史付款）">
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <Table className="min-w-[620px]">
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="h-9 text-xs">月份</TableHead>
                              <TableHead className="h-9 text-right text-xs">吨数</TableHead>
                              <TableHead className="h-9 text-right text-xs">
                                永丰应支付
                              </TableHead>
                              <TableHead className="h-9 text-right text-xs">精竹支付</TableHead>
                              <TableHead className="h-9 text-right text-xs">毛利</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {allMonthlyStats.map((row) => (
                              <TableRow key={row.month}>
                                <TableCell className="font-mono text-xs">{row.month}</TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  {row.tons.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs text-success">
                                  ¥{formatAmount(row.receivable)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  ¥{formatAmount(row.payable)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs text-chart-3">
                                  ¥{formatAmount(row.profit)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      </DataTableShell>
                    )}
              </TabsContent>

              <TabsContent value="supplier" className="mt-0 space-y-4 focus-visible:outline-none">
                {rangeStats.suppliers.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-10 text-center text-sm text-muted-foreground">
                      无供应商数据
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ChartCard title="供应商付款占比" subtitle="按付给精竹的金额占比，看谁供货最多">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={rangeStats.suppliers}
                            dataKey="percent"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={52}
                            outerRadius={88}
                            paddingAngle={2}
                            label={({ name, percent }) =>
                              `${name.length > 6 ? `${name.slice(0, 6)}…` : name} ${percent}%`
                            }
                            labelLine={false}
                          >
                            {rangeStats.suppliers.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <DataTableShell title="供应商明细">
                          <div className="overflow-x-auto rounded-lg border border-border/60">
                          <Table className="min-w-[560px]">
                            <TableHeader>
                              <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead className="h-9 text-xs">供应商</TableHead>
                                <TableHead className="h-9 text-right text-xs">吨数</TableHead>
                                <TableHead className="h-9 text-right text-xs">精竹支付</TableHead>
                                <TableHead className="h-9 text-right text-xs">占比</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rangeStats.suppliers.map((row) => (
                                <TableRow key={row.name}>
                                  <TableCell className="text-xs">{row.name}</TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">
                                    {row.tons.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">
                                    ¥{formatAmount(row.amount)}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">
                                    {row.percent}%
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                    </DataTableShell>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="vehicle" className="mt-0 focus-visible:outline-none">
                    {rangeStats.vehicles.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        无车辆数据
                      </p>
                    ) : (
                      <DataTableShell title="按车辆汇总（精竹支付 + 趟次）">
                      <div className="overflow-x-auto rounded-lg border border-border/60">
                        <Table className="min-w-[620px]">
                          <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableHead className="h-9 text-xs">车牌</TableHead>
                              <TableHead className="h-9 text-xs">司机</TableHead>
                              <TableHead className="h-9 text-right text-xs">趟次</TableHead>
                              <TableHead className="h-9 text-right text-xs">吨数</TableHead>
                              <TableHead className="h-9 text-right text-xs">精竹支付</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rangeStats.vehicles.map((row) => (
                              <TableRow key={`${row.plateNo}-${row.driver}`}>
                                <TableCell className="font-mono text-xs">{row.plateNo}</TableCell>
                                <TableCell className="text-xs">{row.driver}</TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  {row.trips}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  {row.tons.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-xs">
                                  ¥{formatAmount(row.amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      </DataTableShell>
                    )}
              </TabsContent>
              </div>
            </Tabs>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

export default function StatisticsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载统计…
        </div>
      }
    >
      <StatisticsPageContent />
    </Suspense>
  );
}
