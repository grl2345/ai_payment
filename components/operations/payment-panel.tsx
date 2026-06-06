"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Download,
  Filter,
  Search,
  RefreshCw,
  CheckCircle,
  Receipt,
  Calendar,
  DollarSign,
  FileText,
  Eye,
} from "lucide-react";
import { getStatusColor, formatAmount } from "@/lib/format";
import { downloadPaymentDetailsExcel } from "@/lib/export/payment-excel";
import { cn } from "@/lib/utils";
import type { PaymentDetail } from "@/lib/types";

export type PaymentPanelProps = {
  embedded?: boolean;
  onSuggestTab?: (tab: "outcome") => void;
};

function PaymentDetailRow({
  label,
  children,
  valueClassName,
}: {
  label: string;
  children: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(4.5rem,20%)_1fr] items-baseline gap-x-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right", valueClassName)}>{children}</span>
    </div>
  );
}

function PaymentMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "info" | "profit";
}) {
  const valueClass =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-chart-2"
        : tone === "profit"
          ? "text-chart-3"
          : "text-foreground";

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-base font-semibold tabular-nums", valueClass)}>
        {value}
      </p>
    </div>
  );
}

export function PaymentPanel({ embedded = false, onSuggestTab }: PaymentPanelProps) {
  const searchParams = useSearchParams();
  const ticketFromUrl = searchParams.get("ticketNo")?.trim() ?? "";
  const [payments, setPayments] = useState<PaymentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [searchTerm, setSearchTerm] = useState(ticketFromUrl);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);

  useEffect(() => {
    if (ticketFromUrl) setSearchTerm(ticketFromUrl);
  }, [ticketFromUrl]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "加载失败");
      setPayments(data.paymentDetails ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载付款明细失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const supplierOptions = Array.from(
    new Set(payments.map((p) => p.supplierName).filter(Boolean))
  );

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      !searchTerm ||
      payment.ticketNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.supplierName.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSupplier =
      supplierFilter === "all" || payment.supplierName === supplierFilter;

    const matchesPaymentStatus =
      paymentStatusFilter === "all" || payment.paymentStatus === paymentStatusFilter;

    const matchesInvoiceStatus =
      invoiceStatusFilter === "all" || payment.invoiceStatus === invoiceStatusFilter;

    return matchesSearch && matchesSupplier && matchesPaymentStatus && matchesInvoiceStatus;
  });

  // 统计数据
  const stats = {
    totalReceivable: filteredPayments.reduce((sum, p) => sum + p.receivableAmount, 0),
    totalPayable: filteredPayments.reduce((sum, p) => sum + p.payableAmount, 0),
    totalPaid: filteredPayments.reduce((sum, p) => sum + p.paidAmount, 0),
    totalProfit: filteredPayments.reduce((sum, p) => sum + p.grossProfit, 0),
    pendingPayment: filteredPayments
      .filter((p) => p.paymentStatus !== "已支付")
      .reduce((sum, p) => sum + (p.payableAmount - p.paidAmount), 0),
  };

  const handleExport = () => {
    if (filteredPayments.length === 0) {
      toast.warning("当前筛选结果为空，无法导出");
      return;
    }
    try {
      downloadPaymentDetailsExcel(filteredPayments);
      toast.success(`已导出 ${filteredPayments.length} 条付款明细`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出 Excel 失败");
    }
  };

  const handleGeneratePayment = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/import?generatePayments=true", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setPayments(data.paymentDetails ?? []);
      const s = data.paymentSync;
      toast.success(
        `已同步付款明细：新增 ${s?.created ?? 0}，更新 ${s?.updated ?? 0}${
          s?.skipped ? `，跳过 ${s.skipped}` : ""
        }`
      );
      onSuggestTab?.("outcome");
      if (s?.errors?.length) {
        toast.warning(s.errors.slice(0, 3).join("；"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成付款明细失败");
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = (payment: PaymentDetail) => {
    setSelectedPayment(payment);
    setDetailOpen(true);
  };

  const openPaymentDialog = (payment: PaymentDetail) => {
    setSelectedPayment(payment);
    setPaymentDialogOpen(true);
  };

  const openInvoiceDialog = (payment: PaymentDetail) => {
    setSelectedPayment(payment);
    setInvoiceDialogOpen(true);
  };

  return (
    <div className={cn("flex flex-col", embedded ? "min-h-0" : "h-full")}>
      {!embedded && (
        <Header title="付款明细" description="生成、查看、管理付款结算明细" />
      )}

      <div className={cn("flex-1 space-y-3", embedded ? "p-0" : "p-6")}>
        <Card className="border-border/80 shadow-sm">
          <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(220px,0.9fr)_repeat(4,minmax(0,1fr))] lg:items-center">
            <div>
              <p className="text-xs font-medium text-muted-foreground">当前筛选结果</p>
              <p className="mt-1 text-2xl font-semibold tracking-normal text-destructive">
                ¥{formatAmount(stats.pendingPayment)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">待支付金额</p>
            </div>
            <PaymentMetric label="永丰应支付" value={`¥${formatAmount(stats.totalReceivable)}`} tone="success" />
            <PaymentMetric label="精竹支付" value={`¥${formatAmount(stats.totalPayable)}`} />
            <PaymentMetric label="已支付" value={`¥${formatAmount(stats.totalPaid)}`} tone="info" />
            <PaymentMetric label="毛利润" value={`¥${formatAmount(stats.totalProfit)}`} tone="profit" />
          </CardContent>
        </Card>

        {/* 筛选和操作 */}
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="flex flex-col gap-3 pb-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">付款明细</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {filteredPayments.length} 条记录，点击支付状态可登记打款
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索磅单号/供应商..."
                  className="h-9 w-60 pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="供应商" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部供应商</SelectItem>
                  {supplierOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                <SelectTrigger className="h-9 w-28">
                  <SelectValue placeholder="支付状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="未支付">未支付</SelectItem>
                  <SelectItem value="部分支付">部分支付</SelectItem>
                  <SelectItem value="已支付">已支付</SelectItem>
                </SelectContent>
              </Select>
              <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
                <SelectTrigger className="h-9 w-28">
                  <SelectValue placeholder="发票状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="未开票">未开票</SelectItem>
                  <SelectItem value="已开票">已开票</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => void handleGeneratePayment()}
                disabled={generating}
              >
                <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                同步已确认单据
              </Button>
              <Button size="sm" className="h-9 gap-1.5" onClick={handleExport}>
                <Download className="h-4 w-4" />
                导出Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-12 text-center">加载中…</p>
            ) : filteredPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                暂无付款明细。请先在「单据核对」中校验通过并点击「确认通过」，再点「同步已确认单据」。
              </p>
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>磅单号</TableHead>
                    <TableHead>车牌</TableHead>
                    <TableHead>司机</TableHead>
                    <TableHead>收款人</TableHead>
                    <TableHead className="text-right">结算基础</TableHead>
                    <TableHead className="text-right">单价截留</TableHead>
                    <TableHead className="text-right">结算价</TableHead>
                    <TableHead className="text-right">绝干重量</TableHead>
                    <TableHead className="text-right">永丰应支付</TableHead>
                    <TableHead className="text-right">精竹支付</TableHead>
                    <TableHead>是否支付</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {payment.businessDate}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {payment.ticketNo}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {payment.plateNo}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{payment.driverName}</TableCell>
                      <TableCell className="whitespace-nowrap">{payment.payeeName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {payment.basePrice}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">
                        {payment.priceDeduction}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {payment.settlementPrice}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {payment.dryWeight.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        ¥{formatAmount(payment.receivableAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">
                        ¥{formatAmount(payment.payableAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${getStatusColor(payment.paymentStatus)} cursor-pointer`}
                          variant="outline"
                          onClick={() => openPaymentDialog(payment)}
                        >
                          {payment.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetail(payment)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>

        {/* 详情弹窗 */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>付款明细详情</DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="space-y-6">
                {/* 基本信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">基本信息</h4>
                    <div className="space-y-2">
                      <PaymentDetailRow label="业务日期">
                        {selectedPayment.businessDate}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="磅单号" valueClassName="font-mono">
                        {selectedPayment.ticketNo}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="供应商">
                        {selectedPayment.supplierName}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="收款人">{selectedPayment.payeeName}</PaymentDetailRow>
                      <PaymentDetailRow label="车牌">{selectedPayment.plateNo}</PaymentDetailRow>
                      <PaymentDetailRow label="司机">{selectedPayment.driverName}</PaymentDetailRow>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium text-sm text-muted-foreground">结算信息</h4>
                    <div className="space-y-2">
                      <PaymentDetailRow label="结算基础价">
                        ¥{selectedPayment.basePrice}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="单价截留" valueClassName="text-destructive">
                        ¥{selectedPayment.priceDeduction}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="结算价">
                        ¥{selectedPayment.settlementPrice}
                      </PaymentDetailRow>
                      <PaymentDetailRow label="过磅净重">
                        {selectedPayment.netWeight.toLocaleString()} KG
                      </PaymentDetailRow>
                      <PaymentDetailRow label="水分">{selectedPayment.moisturePercent}%</PaymentDetailRow>
                      <PaymentDetailRow label="绝干重量">
                        {selectedPayment.dryWeight.toFixed(3)} 吨
                      </PaymentDetailRow>
                    </div>
                  </div>
                </div>

                {/* 金额信息 */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <h4 className="font-medium text-sm">金额明细</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-success/10 p-3 text-center">
                      <p className="text-xs text-muted-foreground">永丰应支付金额</p>
                      <p className="text-base font-bold text-success sm:text-lg">
                        ¥{formatAmount(selectedPayment.receivableAmount)}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">= 采购入库单总金额</p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3 text-center">
                      <p className="text-xs text-muted-foreground">精竹支付金额</p>
                      <p className="text-base font-bold sm:text-lg">
                        ¥{formatAmount(selectedPayment.payableAmount)}
                      </p>
                      <p className="mt-1 font-mono text-[10px] leading-tight text-muted-foreground">
                        =（{selectedPayment.basePrice}−{selectedPayment.priceDeduction}）×
                        {selectedPayment.dryWeight.toFixed(3)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-chart-3/10 p-3 text-center">
                      <p className="text-xs text-muted-foreground">毛利</p>
                      <p className="text-base font-bold text-chart-3 sm:text-lg">
                        ¥{formatAmount(selectedPayment.grossProfit)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 状态信息 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">支付状态</span>
                      <Badge className={getStatusColor(selectedPayment.paymentStatus)} variant="outline">
                        {selectedPayment.paymentStatus}
                      </Badge>
                    </div>
                    {selectedPayment.paidAmount > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">已支付</span>
                          <span>¥{formatAmount(selectedPayment.paidAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">支付日期</span>
                          <span>{selectedPayment.paidDate}</span>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="p-4 rounded-lg border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">发票状态</span>
                      <Badge className={getStatusColor(selectedPayment.invoiceStatus)} variant="outline">
                        {selectedPayment.invoiceStatus}
                      </Badge>
                    </div>
                    {selectedPayment.invoiceAmount > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">发票金额</span>
                          <span>¥{formatAmount(selectedPayment.invoiceAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">开票日期</span>
                          <span>{selectedPayment.invoiceDate}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {selectedPayment.remark && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <span className="text-sm text-muted-foreground">备注: </span>
                    <span className="text-sm">{selectedPayment.remark}</span>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailOpen(false)}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 支付状态弹窗 */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>更新支付状态</DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm">
                    <span className="text-muted-foreground">磅单号: </span>
                    <span className="font-mono">{selectedPayment.ticketNo}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">应付金额: </span>
                    <span className="font-medium">¥{formatAmount(selectedPayment.payableAmount)}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>支付状态</Label>
                  <Select defaultValue={selectedPayment.paymentStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未支付">未支付</SelectItem>
                      <SelectItem value="部分支付">部分支付</SelectItem>
                      <SelectItem value="已支付">已支付</SelectItem>
                      <SelectItem value="暂缓支付">暂缓支付</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>支付金额</Label>
                  <Input
                    type="number"
                    defaultValue={selectedPayment.paidAmount || selectedPayment.payableAmount}
                  />
                </div>

                <div className="space-y-2">
                  <Label>支付日期</Label>
                  <Input
                    type="date"
                    defaultValue={selectedPayment.paidDate || new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={() => setPaymentDialogOpen(false)}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 发票状态弹窗 */}
        <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>更新发票状态</DialogTitle>
            </DialogHeader>

            {selectedPayment && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm">
                    <span className="text-muted-foreground">磅单号: </span>
                    <span className="font-mono">{selectedPayment.ticketNo}</span>
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">应付金额: </span>
                    <span className="font-medium">¥{formatAmount(selectedPayment.payableAmount)}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>发票状态</Label>
                  <Select defaultValue={selectedPayment.invoiceStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="未开票">未开票</SelectItem>
                      <SelectItem value="已开票">已开票</SelectItem>
                      <SelectItem value="部分开票">部分开票</SelectItem>
                      <SelectItem value="无需发票">无需发票</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>发票金额</Label>
                  <Input
                    type="number"
                    defaultValue={selectedPayment.invoiceAmount || selectedPayment.payableAmount}
                  />
                </div>

                <div className="space-y-2">
                  <Label>开票日期</Label>
                  <Input
                    type="date"
                    defaultValue={selectedPayment.invoiceDate || new Date().toISOString().split("T")[0]}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setInvoiceDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={() => setInvoiceDialogOpen(false)}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
