"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount, getStatusColor } from "@/lib/format";
import type { AiBatchVerifyResult } from "@/lib/import/ai-batch-verify";
import type { PaymentDetail, TicketMatch } from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  Package,
  Banknote,
  XCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const categoryLabel: Record<string, string> = {
  import: "导入/识别",
  match: "关联匹配",
  verify: "六项校验",
  confirm: "确认/档案",
};

type ResultsPanelProps = {
  mode: "ai-detail" | "outcome";
  refreshKey?: number;
  batchResult?: AiBatchVerifyResult | null;
  onGoPayment?: () => void;
  onGoOutcome?: () => void;
  onGoUpload?: () => void;
  onRerun?: () => void;
  aiVerifying?: boolean;
};

export function ResultsPanel({
  mode,
  refreshKey,
  batchResult,
  onGoPayment,
  onGoOutcome,
  onGoUpload,
  onRerun,
  aiVerifying,
}: ResultsPanelProps) {
  const [loading, setLoading] = useState(!batchResult);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([]);
  const [ticketMatches, setTicketMatches] = useState<TicketMatch[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (res.ok) {
        setPaymentDetails(data.paymentDetails ?? []);
        setTicketMatches(data.ticketMatches ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (batchResult) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [loadData, refreshKey, batchResult]);

  const passed = batchResult?.passed ?? [];
  const issues = batchResult?.issues ?? [];

  const confirmedPayments = useMemo(() => {
    if (passed.length > 0) {
      return passed;
    }
    return paymentDetails
      .filter((p) =>
        ticketMatches.some(
          (m) => m.id === p.matchId && m.matchStatus === "已确认"
        )
      )
      .map((p) => ({
        ticketNo: p.ticketNo,
        plateNo: p.plateNo,
        driverName: p.driverName,
        supplierName: p.supplierName,
        matchId: p.matchId,
        paymentId: p.id,
        receivableAmount: p.receivableAmount,
        payableAmount: p.payableAmount,
        grossProfit: p.grossProfit,
        dryWeight: p.dryWeight,
      }));
  }, [passed, paymentDetails, ticketMatches]);

  const totals = useMemo(
    () =>
      confirmedPayments.reduce(
        (acc, p) => ({
          receivable: acc.receivable + p.receivableAmount,
          payable: acc.payable + p.payableAmount,
          profit: acc.profit + p.grossProfit,
          dry: acc.dry + p.dryWeight,
        }),
        { receivable: 0, payable: 0, profit: 0, dry: 0 }
      ),
    [confirmedPayments]
  );

  if (loading && !batchResult) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载结果…
      </p>
    );
  }

  if (!batchResult && confirmedPayments.length === 0 && issues.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground space-y-3">
          <p className="text-sm">请先在「① 上传单据」上传计量单和采购入库单</p>
          <p className="text-sm">
            再点{" "}
            <span className="font-medium text-primary">一键 AI 核对</span>
            {mode === "outcome" ? "，完成后查看本页结果" : ""}
          </p>
          {onGoUpload ? (
            <Button className="mt-2 gap-2" onClick={onGoUpload}>
              <Package className="h-4 w-4" />
              去上传单据
            </Button>
          ) : onRerun ? (
            <Button
              className="mt-2 gap-2"
              disabled={aiVerifying}
              onClick={onRerun}
            >
              {aiVerifying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              一键 AI 核对
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (mode === "outcome") {
    return (
      <div className="space-y-6">
        {confirmedPayments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-2">
              <p className="text-sm">暂无核对通过的单据</p>
              <p className="text-xs">
                请先在「② AI核对明细结果」完成核对，系统将自动生成付款明细
              </p>
              {onGoUpload ? (
                <Button className="mt-3 gap-2" onClick={onGoUpload}>
                  <Package className="h-4 w-4" />
                  去上传单据
                </Button>
              ) : onRerun ? (
                <Button
                  className="mt-3 gap-2"
                  disabled={aiVerifying}
                  onClick={onRerun}
                >
                  {aiVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  一键 AI 核对
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Package className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-xs text-muted-foreground">绝干吨合计</p>
                    <p className="text-lg font-bold tabular-nums">
                      {totals.dry.toFixed(3)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Banknote className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-xs text-muted-foreground">永丰应支付</p>
                    <p className="text-lg font-bold text-success tabular-nums">
                      ¥{formatAmount(totals.receivable)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Banknote className="h-5 w-5 text-chart-2" />
                  <div>
                    <p className="text-xs text-muted-foreground">精竹支付</p>
                    <p className="text-lg font-bold tabular-nums">
                      ¥{formatAmount(totals.payable)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-chart-3" />
                  <div>
                    <p className="text-xs text-muted-foreground">毛利</p>
                    <p
                      className={cn(
                        "text-lg font-bold tabular-nums",
                        totals.profit < 0 ? "text-destructive" : "text-chart-3"
                      )}
                    >
                      ¥{formatAmount(totals.profit)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  核对结果汇总（{confirmedPayments.length} 单）
                </CardTitle>
                <div className="flex flex-wrap justify-end gap-2">
                  {onGoPayment && (
                    <Button variant="outline" size="sm" onClick={onGoPayment}>
                      ③ 生成付款明细
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadData()}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    刷新
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>磅单号</TableHead>
                      <TableHead>车牌</TableHead>
                      <TableHead>供应商</TableHead>
                      <TableHead className="text-right">绝干吨</TableHead>
                      <TableHead className="text-right">永丰应支付</TableHead>
                      <TableHead className="text-right">精竹支付</TableHead>
                      <TableHead className="text-right">毛利</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedPayments.map((p) => (
                      <TableRow key={p.matchId}>
                        <TableCell className="font-mono text-sm">
                          {p.ticketNo}
                        </TableCell>
                        <TableCell className="font-mono">{p.plateNo}</TableCell>
                        <TableCell className="max-w-[100px] truncate">
                          {p.supplierName}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.dryWeight.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-success">
                          ¥{formatAmount(p.receivableAmount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          ¥{formatAmount(p.payableAmount)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums font-medium",
                            p.grossProfit < 0
                              ? "text-destructive"
                              : "text-chart-3"
                          )}
                        >
                          ¥{formatAmount(p.grossProfit)}
                          {p.grossProfit < 0 ? (
                            <Badge
                              variant="outline"
                              className="ml-2 border-destructive/40 text-[10px] text-destructive"
                            >
                              负毛利
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {batchResult && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              AI 核对完成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-4">
              <span>
                计量自动通过 <strong>{batchResult.measureApproved}</strong> 张
              </span>
              <span>
                入库自动通过 <strong>{batchResult.inboundApproved}</strong> 条
              </span>
              <span>
                自动确认 <strong>{batchResult.autoConfirmed}</strong> 单
              </span>
              <span>
                生成付款 <strong>{batchResult.paymentsCreated}</strong> 条
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-success/10 border border-success/20 p-3 text-center">
                <p className="text-2xl font-bold text-success">
                  {batchResult.stats.passedCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">通过并已确认</p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-center">
                <p className="text-2xl font-bold text-destructive">
                  {batchResult.stats.issueCount}
                </p>
                <p className="text-xs text-muted-foreground mt-1">有问题需处理</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-2xl font-bold">
                  {batchResult.measurePending + batchResult.inboundPending}
                </p>
                <p className="text-xs text-muted-foreground mt-1">待处理异常</p>
              </div>
            </div>
            {(onGoPayment || onGoOutcome) && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-primary/15">
                <span className="text-xs text-muted-foreground mr-1">
                  下一步：
                </span>
                {onGoPayment && (
                  <Button variant="outline" size="sm" onClick={onGoPayment}>
                    ③ 生成付款明细
                  </Button>
                )}
                {onGoOutcome && (
                  <Button variant="default" size="sm" onClick={onGoOutcome}>
                    ④ 结果
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="flex flex-col justify-between gap-2 pb-2 sm:flex-row sm:items-center">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              有问题单据（{issues.length}）
            </CardTitle>
            <div className="flex flex-wrap gap-2 shrink-0">
              {onRerun && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={aiVerifying}
                  onClick={onRerun}
                >
                  {aiVerifying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  重新核对
                </Button>
              )}
              {onGoPayment && (
                <Button variant="outline" size="sm" onClick={onGoPayment}>
                  ③ 生成付款明细
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>磅单号</TableHead>
                  <TableHead>车牌</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>原因</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((row) => (
                  <TableRow key={`${row.ticketNo}-${row.measureId}`}>
                    <TableCell className="font-mono text-sm">
                      {row.ticketNo}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{row.plateNo}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.driverName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel[row.category] ?? row.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ul className="text-sm space-y-1 list-disc list-inside text-destructive/90">
                        {row.reasons.map((reason, i) => (
                          <li key={i} className="leading-snug">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                    <TableCell>
                      {row.matchStatus ? (
                        <Badge
                          variant="outline"
                          className={getStatusColor(row.matchStatus)}
                        >
                          {row.matchStatus}
                        </Badge>
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {issues.length === 0 && batchResult && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="py-6 flex items-center gap-3 text-success">
            <CheckCircle className="h-8 w-8 shrink-0" />
            <p className="font-medium">全部单据核对通过，无异常项</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
