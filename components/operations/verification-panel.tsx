"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Link2,
  Eye,
  Search,
  Filter,
  FileCheck,
  XCircle,
} from "lucide-react";
import { getStatusColor } from "@/lib/format";
import { MeasureCoreFieldsCard } from "@/components/measure-core-fields-card";
import { PurchaseCoreFieldsCard } from "@/components/purchase-core-fields-card";
import {
  formatMeasureCoreValue,
  getMeasureCoreFieldLabel,
  getMeasureCoreFields,
} from "@/lib/import/measure-fields";
import {
  formatPurchaseCoreValue,
  getPurchaseCoreFieldLabel,
  getPurchaseCoreFields,
} from "@/lib/import/inbound-fields";
import {
  formatMatchVerificationTime,
  getMatchVerificationBadgeKind,
  getMatchVerificationLabel,
  getVerificationBadgeClassName,
  isMatchVerificationSatisfied,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import {
  getMatchPaymentStatus,
  getPaymentStatusBadgeClassName,
} from "@/lib/import/match-payment-status";
import { VerificationReport } from "@/components/verification-report";
import type {
  InboundRecord,
  MatchStatus,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
  VehicleSettlementRule,
} from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type VerificationPanelProps = {
  embedded?: boolean;
  initialStatusFilter?: string;
  onSuggestTab?: (tab: "payment" | "outcome") => void;
};

function VerificationPanelContent({
  embedded = false,
  initialStatusFilter,
  onSuggestTab,
}: VerificationPanelProps) {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    if (initialStatusFilter) return initialStatusFilter;
    const status = searchParams.get("status");
    return status === "exception" ? "exception" : "all";
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [ticketMatches, setTicketMatches] = useState<TicketMatch[]>([]);
  const [measureTickets, setMeasureTickets] = useState<MeasureTicket[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([]);
  const [settlementRules, setSettlementRules] = useState<
    VehicleSettlementRule[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<TicketMatch | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    const response = await fetch("/api/import");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error || "加载核对数据失败");
      return;
    }
    setTicketMatches(data.ticketMatches ?? []);
    setMeasureTickets(data.measureTickets ?? []);
    setInboundRecords(data.inboundRecords ?? []);
    setPaymentDetails(data.paymentDetails ?? []);
    setSettlementRules(data.vehicleSettlementRules ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadData();
      setLoading(false);
    })();
  }, [loadData]);

  const measureById = useMemo(
    () => new Map(measureTickets.map((t) => [t.id, t])),
    [measureTickets]
  );

  const inboundById = useMemo(
    () => new Map(inboundRecords.map((r) => [r.id, r])),
    [inboundRecords]
  );

  const paymentByMatchId = useMemo(
    () => new Map(paymentDetails.map((p) => [p.matchId, p])),
    [paymentDetails]
  );

  const getMeasureTicket = (id: string) => measureById.get(id);
  const getInboundRecord = (id: string) => inboundById.get(id);

  const sortedMatches = useMemo(() => {
    return [...ticketMatches].sort((a, b) => {
      const aLinked = a.inboundRecordId ? 1 : 0;
      const bLinked = b.inboundRecordId ? 1 : 0;
      if (aLinked !== bLinked) return bLinked - aLinked;
      return a.ticketNo.localeCompare(b.ticketNo, "zh-CN");
    });
  }, [ticketMatches]);

  const filteredMatches = sortedMatches.filter((match) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "exception" &&
        (match.matchStatus === "核对异常" ||
          match.matchStatus === "待匹配" ||
          match.matchStatus === "疑似匹配")) ||
      match.matchStatus === statusFilter;

    const matchesSearch =
      !searchTerm ||
      match.ticketNo.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const stats = useMemo(
    () => ({
      total: ticketMatches.length,
      linked: ticketMatches.filter((t) => t.inboundRecordId).length,
      matched: ticketMatches.filter((t) => t.matchStatus === "匹配成功").length,
      confirmed: ticketMatches.filter((t) => t.matchStatus === "已确认").length,
      exception: ticketMatches.filter(
        (t) =>
          t.matchStatus === "核对异常" ||
          t.matchStatus === "待匹配" ||
          t.matchStatus === "疑似匹配"
      ).length,
    }),
    [ticketMatches]
  );

  const patchMatch = async (id: string, action: "confirm" | "void") => {
    const response = await fetch("/api/import", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "操作失败");
    }
    setTicketMatches((prev) =>
      prev.map((m) => (m.id === id ? data.match : m))
    );
    if (selectedMatch?.id === id) {
      setSelectedMatch(data.match);
    }
    return data.match as TicketMatch;
  };

  const handleConfirm = async (match: TicketMatch) => {
    try {
      await patchMatch(match.id, "confirm");
      await loadData();
      toast.success(
        `已确认磅单 ${match.ticketNo}（人工通过），将按结算档案生成付款明细`
      );
      setDetailOpen(false);
      onSuggestTab?.("payment");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "确认失败");
    }
  };

  const handleVoid = async (match: TicketMatch) => {
    try {
      await patchMatch(match.id, "void");
      toast.success(`已作废磅单 ${match.ticketNo}`);
      setDetailOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "作废失败");
    }
  };

  const openDetail = (match: TicketMatch) => {
    setSelectedMatch(match);
    setDetailOpen(true);
  };

  const getStatusIcon = (status: MatchStatus) => {
    switch (status) {
      case "已确认":
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case "匹配成功":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "核对异常":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "待匹配":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "疑似匹配":
        return <Link2 className="h-4 w-4 text-warning" />;
      case "已作废":
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const isExceptionMatch = (match: TicketMatch) =>
    match.matchStatus === "核对异常" ||
    match.matchStatus === "待匹配" ||
    match.matchStatus === "疑似匹配";

  const buildIssueLabels = (
    match: TicketMatch,
    measureTicket?: MeasureTicket,
    inboundRecord?: InboundRecord
  ) => {
    const labels = new Set<string>();
    match.exceptionTypes.forEach((item) => labels.add(item));
    if (!match.inboundRecordId) labels.add("缺少采购入库单");
    if (measureTicket?.ocrStatus === "待审核") labels.add("计量单待审核");
    if (inboundRecord?.reviewStatus === "待审核") labels.add("入库单待审核");
    if (measureTicket && inboundRecord) {
      if (measureTicket.plateNo !== inboundRecord.plateNo) labels.add("车牌疑似 OCR 错");
      if (measureTicket.supplierName !== inboundRecord.supplierName) {
        labels.add("供应商名称不一致");
      }
    }
    return [...labels];
  };

  const renderComparePill = (
    label: string,
    left?: string | number,
    right?: string | number
  ) => {
    const leftValue = left == null || left === "" ? "—" : String(left);
    const rightValue = right == null || right === "" ? "—" : String(right);
    const same = leftValue === rightValue;

    return (
      <div
        className={cn(
          "rounded-md border px-3 py-2 text-xs",
          same ? "border-success/25 bg-success/5" : "border-destructive/25 bg-destructive/5"
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-medium text-muted-foreground">{label}</span>
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-1.5 text-[10px]",
              same
                ? "border-success/30 text-success"
                : "border-destructive/30 text-destructive"
            )}
          >
            {same ? "一致" : "不一致"}
          </Badge>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px] leading-snug">
          <span className="min-w-0 truncate">{leftValue}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{rightValue}</span>
        </div>
      </div>
    );
  };

  const priorityMatches = filteredMatches.filter(isExceptionMatch);

  return (
    <div className={cn("flex flex-col", embedded ? "min-h-0" : "h-full")}>
      {!embedded && (
        <Header
          title="单据核对"
          description="先按磅单号关联计量单与入库单，再核对供应商、车牌、重量等字段"
        />
      )}

      <div
        className={cn(
          "flex-1",
          embedded ? "space-y-3 p-3 min-h-0 overflow-auto" : "space-y-6 p-6"
        )}
      >
        {stats.exception > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">
                    还有 {stats.exception} 单需要处理
                  </p>
                  <p className="text-xs text-muted-foreground">
                    优先核对红色字段、确认 OCR 错字或补齐缺失档案；确认通过后才会进入付款明细。
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setStatusFilter("exception")}
              >
                只看待处理
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setStatusFilter("all")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">全部计量单</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <FileCheck className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setStatusFilter("all")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">已关联入库单</p>
                  <p className="text-2xl font-bold text-primary">{stats.linked}</p>
                </div>
                <Link2 className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setStatusFilter("匹配成功")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">匹配成功</p>
                  <p className="text-2xl font-bold text-success">{stats.matched}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setStatusFilter("exception")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">待处理</p>
                  <p className="text-2xl font-bold text-destructive">
                    {stats.exception}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">
                待处理优先
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                先处理影响付款生成的异常，再查看完整明细表。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索磅单号..."
                  className="w-full pl-9 sm:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="核对状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="匹配成功">匹配成功</SelectItem>
                  <SelectItem value="疑似匹配">疑似匹配</SelectItem>
                  <SelectItem value="已确认">已确认</SelectItem>
                  <SelectItem value="exception">待处理</SelectItem>
                  <SelectItem value="已作废">已作废</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                加载中…
              </p>
            ) : filteredMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                {ticketMatches.length === 0
                  ? "暂无计量单记录，请先在「① 上传单据」上传计量单与采购单"
                  : "没有符合筛选条件的记录"}
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {(priorityMatches.length > 0 ? priorityMatches : filteredMatches).map(
                    (match) => {
                      const measureTicket = getMeasureTicket(match.measureTicketId);
                      const inboundRecord = match.inboundRecordId
                        ? getInboundRecord(match.inboundRecordId)
                        : undefined;
                      const verification =
                        measureTicket &&
                        verifyMeasureAndInbound(measureTicket, inboundRecord);
                      const paymentStatus = getMatchPaymentStatus(
                        match,
                        measureTicket,
                        inboundRecord,
                        verification ?? null,
                        paymentByMatchId.get(match.id),
                        settlementRules
                      );
                      const issueLabels = buildIssueLabels(
                        match,
                        measureTicket,
                        inboundRecord
                      );
                      const canConfirm =
                        Boolean(match.inboundRecordId) &&
                        match.matchStatus !== "已确认" &&
                        match.matchStatus !== "已作废";

                      return (
                        <div
                          key={match.id}
                          className={cn(
                            "rounded-lg border bg-card p-4 shadow-sm",
                            isExceptionMatch(match)
                              ? "border-destructive/25"
                              : "border-success/25"
                          )}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-semibold">
                                  {match.ticketNo}
                                </span>
                                <Badge
                                  className={getStatusColor(match.matchStatus)}
                                  variant="outline"
                                >
                                  {match.matchStatus}
                                </Badge>
                                {match.matchScore > 0 ? (
                                  <Badge variant="outline" className="text-xs">
                                    匹配 {match.matchScore}%
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {paymentStatus.issued
                                  ? "已生成付款明细"
                                  : paymentStatus.reason || match.exceptionDetail}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openDetail(match)}
                              >
                                <Eye className="h-4 w-4" />
                                查看
                              </Button>
                              {canConfirm ? (
                                <Button size="sm" onClick={() => void handleConfirm(match)}>
                                  <CheckCircle className="h-4 w-4" />
                                  确认
                                </Button>
                              ) : null}
                            </div>
                          </div>

                          {issueLabels.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {issueLabels.slice(0, 5).map((item) => (
                                <Badge
                                  key={item}
                                  variant="outline"
                                  className="border-destructive/25 bg-destructive/5 text-[11px] text-destructive"
                                >
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          ) : null}

                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {renderComparePill(
                              "车牌",
                              measureTicket?.plateNo,
                              inboundRecord?.plateNo
                            )}
                            {renderComparePill(
                              "司机",
                              measureTicket?.driverName,
                              inboundRecord?.driverName
                            )}
                            {renderComparePill(
                              "供应商",
                              measureTicket?.supplierName,
                              inboundRecord?.supplierName
                            )}
                            {renderComparePill(
                              "实重/结算",
                              measureTicket
                                ? `${(measureTicket.actualWeight / 1000).toFixed(3)}吨`
                                : undefined,
                              inboundRecord
                                ? `${inboundRecord.settlementWeight.toFixed(3)}吨`
                                : undefined
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                <details className="rounded-lg border bg-muted/20">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                    查看完整明细表（{filteredMatches.length} 条）
                  </summary>
                  <div className="overflow-x-auto border-t bg-card">
                    <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>核对状态</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("DATE")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_WB_No")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_Veh_No")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_Driver")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_N_Weight")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_A_Weight")}</TableHead>
                      <TableHead>{getMeasureCoreFieldLabel("J_Mat_Type")}</TableHead>
                      <TableHead className="border-l bg-muted/30">
                        {getPurchaseCoreFieldLabel("C_WB_No")}
                      </TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Veh_No")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Driver")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Settle_Weight")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Dry_Weight")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Percentage")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Base_Price")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("Total_Amount")}</TableHead>
                      <TableHead>{getPurchaseCoreFieldLabel("C_Mat_Type")}</TableHead>
                      <TableHead>匹配度</TableHead>
                      <TableHead>校验</TableHead>
                      <TableHead>校验时间</TableHead>
                      <TableHead>是否开具付款单</TableHead>
                      <TableHead className="min-w-[160px]">备注</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMatches.map((match) => {
                      const measureTicket = getMeasureTicket(
                        match.measureTicketId
                      );
                      const inboundRecord = match.inboundRecordId
                        ? getInboundRecord(match.inboundRecordId)
                        : undefined;
                      const core = measureTicket
                        ? getMeasureCoreFields(measureTicket)
                        : null;
                      const purchaseCore = inboundRecord
                        ? getPurchaseCoreFields(inboundRecord)
                        : null;
                      const verification =
                        measureTicket &&
                        verifyMeasureAndInbound(measureTicket, inboundRecord);
                      const verifyBadgeKind = getMatchVerificationBadgeKind(
                        match.matchStatus,
                        verification ?? null,
                        match.confirmedBy
                      );
                      const paymentStatus = getMatchPaymentStatus(
                        match,
                        measureTicket,
                        inboundRecord,
                        verification ?? null,
                        paymentByMatchId.get(match.id),
                        settlementRules
                      );

                      return (
                        <TableRow
                          key={match.id}
                          className={
                            !match.inboundRecordId ||
                            match.matchStatus === "核对异常" ||
                            match.matchStatus === "待匹配"
                              ? "bg-destructive/5"
                              : match.matchStatus === "疑似匹配"
                                ? "bg-warning/5"
                                : ""
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {getStatusIcon(match.matchStatus)}
                              <Badge
                                className={getStatusColor(match.matchStatus)}
                                variant="outline"
                              >
                                {match.matchStatus}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm tabular-nums">
                            {core?.DATE ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap">
                            {core?.J_WB_No ?? match.ticketNo}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {core?.J_Veh_No ?? "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {core?.J_Driver ?? "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap">
                            {core
                              ? formatMeasureCoreValue("J_N_Weight", core)
                              : "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap">
                            {core
                              ? formatMeasureCoreValue("J_A_Weight", core)
                              : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-[120px] truncate text-sm"
                            title={core?.J_Mat_Type}
                          >
                            {core?.J_Mat_Type ?? "-"}
                          </TableCell>
                          <TableCell className="font-mono text-sm whitespace-nowrap border-l bg-muted/10">
                            {purchaseCore?.C_WB_No ?? "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm bg-muted/10">
                            {purchaseCore?.C_Veh_No ?? "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm bg-muted/10">
                            {purchaseCore?.C_Driver ?? "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap bg-muted/10">
                            {purchaseCore
                              ? formatPurchaseCoreValue(
                                  "C_Settle_Weight",
                                  purchaseCore
                                )
                              : "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap bg-muted/10">
                            {purchaseCore
                              ? formatPurchaseCoreValue("C_Dry_Weight", purchaseCore)
                              : "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap bg-muted/10">
                            {purchaseCore
                              ? formatPurchaseCoreValue("C_Percentage", purchaseCore)
                              : "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap bg-muted/10">
                            {purchaseCore
                              ? formatPurchaseCoreValue("C_Base_Price", purchaseCore)
                              : "-"}
                          </TableCell>
                          <TableCell className="tabular-nums text-sm whitespace-nowrap bg-muted/10 font-medium">
                            {purchaseCore && purchaseCore.Total_Amount > 0
                              ? `¥${formatPurchaseCoreValue("Total_Amount", purchaseCore)}`
                              : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-[120px] truncate text-sm bg-muted/10"
                            title={purchaseCore?.C_Mat_Type}
                          >
                            {purchaseCore?.C_Mat_Type ?? "-"}
                          </TableCell>
                          <TableCell>
                            {match.matchScore > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      match.matchScore >= 95
                                        ? "bg-success"
                                        : match.matchScore >= 80
                                          ? "bg-warning"
                                          : "bg-destructive"
                                    }`}
                                    style={{ width: `${match.matchScore}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums">
                                  {match.matchScore}%
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {verification || match.matchStatus === "已确认" ? (
                              <Badge
                                variant="outline"
                                className={getVerificationBadgeClassName(
                                  verifyBadgeKind
                                )}
                              >
                                {getMatchVerificationLabel(
                                  match.matchStatus,
                                  verification ?? null,
                                  match.confirmedBy
                                )}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                            {formatMatchVerificationTime(
                              match,
                              verification ?? null
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={cn(
                                "min-w-[2rem] justify-center font-semibold",
                                getPaymentStatusBadgeClassName(
                                  paymentStatus.issued
                                )
                              )}
                            >
                              {paymentStatus.issued ? "是" : "否"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[240px]">
                            {paymentStatus.issued ? (
                              <span className="text-muted-foreground/70">—</span>
                            ) : (
                              <span
                                className="leading-snug line-clamp-2"
                                title={paymentStatus.reason}
                              >
                                {paymentStatus.reason || "—"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDetail(match)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {match.inboundRecordId &&
                                match.matchStatus !== "已确认" &&
                                match.matchStatus !== "已作废" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => void handleConfirm(match)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="w-[95vw] sm:max-w-7xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                单据核对详情 - {selectedMatch?.ticketNo}
                {selectedMatch && (
                  <Badge
                    className={getStatusColor(selectedMatch.matchStatus)}
                    variant="outline"
                  >
                    {selectedMatch.matchStatus}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedMatch && (
              <div className="space-y-6">
                {selectedMatch.exceptionDetail && (
                  <div
                    className={`p-4 rounded-lg border ${
                      selectedMatch.matchStatus === "匹配成功" ||
                      selectedMatch.matchStatus === "已确认"
                        ? "bg-muted/50 border-border"
                        : "bg-destructive/10 border-destructive/20"
                    }`}
                  >
                    <p className="text-sm">{selectedMatch.exceptionDetail}</p>
                  </div>
                )}

                {(() => {
                  const ticket = getMeasureTicket(selectedMatch.measureTicketId);
                  const inbound = selectedMatch.inboundRecordId
                    ? getInboundRecord(selectedMatch.inboundRecordId)
                    : undefined;
                  const verification = ticket
                    ? verifyMeasureAndInbound(ticket, inbound)
                    : null;

                  return (
                    <>
                      {verification ? (
                        <VerificationReport
                          verification={verification}
                          matchStatus={selectedMatch.matchStatus}
                          confirmedBy={selectedMatch.confirmedBy}
                        />
                      ) : null}

                      <details className="rounded-lg border group">
                        <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground list-none flex items-center gap-2">
                          展开查看原始字段明细（计量单 / 采购单）
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pt-0 border-t">
                          {ticket && <MeasureCoreFieldsCard ticket={ticket} />}
                          {inbound ? (
                            <PurchaseCoreFieldsCard record={inbound} />
                          ) : (
                            <Card>
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm">采购单核心信息</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <p className="text-sm text-muted-foreground">
                                  未关联到相同磅单号的入库单
                                </p>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </details>
                    </>
                  );
                })()}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailOpen(false)}>
                关闭
              </Button>
              {selectedMatch?.matchStatus !== "已作废" &&
                selectedMatch?.matchStatus !== "已确认" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => void handleVoid(selectedMatch!)}
                    >
                      标记作废
                    </Button>
                    <Button onClick={() => void handleConfirm(selectedMatch!)}>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      确认通过
                    </Button>
                  </>
                )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function VerificationPanel(props: VerificationPanelProps) {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-sm text-muted-foreground">
          加载核对数据…
        </div>
      }
    >
      <VerificationPanelContent {...props} />
    </Suspense>
  );
}
