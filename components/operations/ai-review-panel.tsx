"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Wand2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Banknote,
  Truck,
  Upload,
  ClipboardCheck,
  ExternalLink,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  buildMeasureCentricReviewItems,
  getAiTodoReason,
  getAiTodoSuggestion,
  type AiTodoItem,
  type AiTodoResult,
  type AiTodoStatus,
} from "@/lib/import/ai-suggestions";
import type { InboundRecord, MeasureTicket, TicketMatch } from "@/lib/types";
import {
  formatMatchVerificationTime,
  getMatchConfirmChannel,
  verifyMeasureAndInbound,
} from "@/lib/import/document-verification";
import { MatchConfirmChannelBadge } from "@/components/match-confirm-channel-badge";
import { DocumentCoreFieldsComparison } from "@/components/document-core-fields-comparison";
import { ImageMagnifyOverlay } from "@/components/image-magnify-overlay";
import { ImagePreviewDialog, type ImagePreviewItem } from "@/components/image-preview-dialog";
import { VerificationReport } from "@/components/verification-report";
import {
  VerificationResultBadge,
  VerificationSummaryBanner,
} from "@/components/verification-status-visual";
import { normalizeFileUrl } from "@/lib/utils";
import { normalizeTicketNo } from "@/lib/import/ticket-uniqueness";

type ArchiveTarget = {
  item: AiTodoItem;
  plateNo: string;
  driverName: string;
};

type ImagePreview = ImagePreviewItem;

// 极简模式：不再按三段展示（可一键/待确认/需人工），统一放到「待处理」

export function AiReviewPanel({
  embedded = false,
  highlightTicketNo,
  highlightMatchId,
  onNavigateTab,
  initialTodos,
  initialMeasures,
  initialInbounds,
  onRefreshParent,
}: {
  embedded?: boolean;
  /** 从单据导入页跳转时定位到该磅单 */
  highlightTicketNo?: string;
  highlightMatchId?: string;
  /** 嵌入单据中心时切换到计量单/采购单 Tab */
  onNavigateTab?: (tab: "measure" | "inbound" | "payment", ticketNo?: string) => void;
  /** 父页面已加载的数据，切换 Tab 时直接展示，避免重复全屏 loading */
  initialTodos?: AiTodoResult | null;
  initialMeasures?: MeasureTicket[];
  initialInbounds?: InboundRecord[];
  onRefreshParent?: () => void;
}) {
  const router = useRouter();
  const hasInitialCache = Boolean(
    initialTodos ?? initialMeasures?.length ?? initialInbounds?.length
  );
  const [todos, setTodos] = useState<AiTodoResult | null>(initialTodos ?? null);
  const [loading, setLoading] = useState(!hasInitialCache);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<AiTodoItem | null>(null);
  const [detailData, setDetailData] = useState<{
    match?: TicketMatch;
    measure?: MeasureTicket;
    inbound?: InboundRecord;
  } | null>(null);
  const [documentData, setDocumentData] = useState<{
    measures: MeasureTicket[];
    inbounds: InboundRecord[];
  }>({
    measures: initialMeasures ?? [],
    inbounds: initialInbounds ?? [],
  });
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [archive, setArchive] = useState<ArchiveTarget | null>(null);
  const [archiveForm, setArchiveForm] = useState({
    payeeName: "",
    basePrice: "",
    priceDeduction: "",
  });
  const [archiveSaving, setArchiveSaving] = useState(false);

  const navigateTab = useCallback(
    (tab: "measure" | "inbound" | "payment", ticketNo?: string) => {
      if (tab === "payment") {
        const q = ticketNo?.trim()
          ? `?ticketNo=${encodeURIComponent(ticketNo.trim())}`
          : "";
        router.push(`/payment${q}`);
        return;
      }
      if (onNavigateTab) {
        onNavigateTab(tab, ticketNo);
        return;
      }
      router.push(`/import?tab=${tab}`);
    },
    [onNavigateTab, router]
  );

  const onRefreshParentRef = useRef(onRefreshParent);
  onRefreshParentRef.current = onRefreshParent;

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/import");
      const data = await res.json();
      if (res.ok) {
        setTodos(data.aiTodos ?? null);
        setDocumentData({
          measures: (data.measureTickets ?? []) as MeasureTicket[],
          inbounds: (data.inboundRecords ?? []) as InboundRecord[],
        });
        onRefreshParentRef.current?.();
      }
    } catch {
      /* 忽略，由空态展示 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialTodos !== undefined) {
      setTodos(initialTodos);
    }
    if (initialMeasures !== undefined || initialInbounds !== undefined) {
      setDocumentData({
        measures: initialMeasures ?? [],
        inbounds: initialInbounds ?? [],
      });
    }
    if (hasInitialCache) {
      setLoading(false);
    }
  }, [initialTodos, initialMeasures, initialInbounds, hasInitialCache]);

  const initialFetchDoneRef = useRef(false);
  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    void loadData({ silent: hasInitialCache });
  }, [hasInitialCache, loadData]);

  const highlightHandledRef = useRef(false);

  const items = todos?.items ?? [];
  const summary = todos?.summary;
  const [activeView, setActiveView] = useState<
    "ai-review" | "exception" | "payable"
  >("ai-review");

  // 以计量单为主：每张可核对计量单一行（含未匹配采购单、待审核等）
  const matchItems = useMemo(
    () => buildMeasureCentricReviewItems(documentData.measures, items),
    [documentData.measures, items]
  );

  const autoPassedItems = useMemo(
    () => matchItems.filter((i) => i.status === "auto-passed"),
    [matchItems]
  );

  // 极简：除「已通过」外，其余都归入「待处理」（包含可一键、待确认、需人工）
  const pendingItems = useMemo(
    () => matchItems.filter((i) => i.status !== "auto-passed"),
    [matchItems]
  );

  // 异常：所有待处理（核对不通过、缺档案、可一键修正等）
  const exceptionItems = useMemo(() => pendingItems, [pendingItems]);

  const canGeneratePaymentItems = useMemo(
    () => autoPassedItems.filter((i) => Boolean(i.meta?.canGeneratePayment)),
    [autoPassedItems]
  );
  const measureById = useMemo(
    () => new Map(documentData.measures.map((item) => [item.id, item])),
    [documentData.measures]
  );
  const inboundById = useMemo(
    () => new Map(documentData.inbounds.map((item) => [item.id, item])),
    [documentData.inbounds]
  );

  const applySuggestion = useCallback(
    async (item: AiTodoItem, silent = false) => {
      const res = await fetch("/api/import?applySuggestion=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: item.matchId,
          action: item.action,
          confirmedBy: "用户",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) toast.error(data.error || "操作失败");
        return false;
      }
      if (data.aiTodos) setTodos(data.aiTodos as AiTodoResult);
      return true;
    },
    []
  );

  const handleApply = useCallback(
    async (item: AiTodoItem) => {
      setBusyId(item.id);
      try {
        const ok = await applySuggestion(item);
        if (ok) {
          toast.success(`已采用建议并确认 ${item.ticketNo}`);
        }
      } finally {
        setBusyId(null);
      }
    },
    [applySuggestion]
  );

  const handleVerifyMeasure = useCallback(
    async (item: AiTodoItem) => {
      const measureId = item.action.type === "verify" ? item.action.measureId : item.measureId;
      if (!measureId) return;
      setBusyId(item.id);
      try {
        const res = await fetch("/api/import?verifyMeasure=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ measureId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "核对失败");
          return;
        }
        toast.success(`${item.ticketNo} 已核对`);
        if (data.aiTodos) setTodos(data.aiTodos as AiTodoResult);
        else await loadData();
      } finally {
        setBusyId(null);
      }
    },
    [loadData]
  );

  // 按需求简化：不再提供“一键处理全部”，避免页面复杂

  const openArchive = (item: AiTodoItem) => {
    if (item.action.type !== "addVehicleArchive") return;
    setArchive({
      item,
      plateNo: item.action.plateNo,
      driverName: item.action.driverName,
    });
    setArchiveForm({ payeeName: item.driverName || "", basePrice: "", priceDeduction: "" });
  };

  const openDetail = useCallback(async (item: AiTodoItem) => {
    setDetailItem(item);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await fetch("/api/import");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const matches = (data.ticketMatches ?? []) as TicketMatch[];
      const measures = (data.measureTickets ?? []) as MeasureTicket[];
      const inbounds = (data.inboundRecords ?? []) as InboundRecord[];

      const match = item.matchId ? matches.find((m) => m.id === item.matchId) : undefined;
      const measure = item.measureId
        ? measures.find((m) => m.id === item.measureId)
        : match
          ? measures.find((m) => m.id === match.measureTicketId)
          : undefined;
      const inbound =
        item.inboundId
          ? inbounds.find((r) => r.id === item.inboundId)
          : match?.inboundRecordId
            ? inbounds.find((r) => r.id === match.inboundRecordId)
            : undefined;

      setDetailData({ match, measure, inbound });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const ticketKey = highlightTicketNo?.trim();
    const matchId = highlightMatchId?.trim();
    if ((!ticketKey && !matchId) || loading || !todos || highlightHandledRef.current) {
      return;
    }

    const target = items.find((item) => {
      if (matchId && item.matchId === matchId) return true;
      if (!ticketKey) return false;
      return normalizeTicketNo(item.ticketNo) === normalizeTicketNo(ticketKey);
    });

    if (!target) return;

    highlightHandledRef.current = true;
    if (target.status === "auto-passed") {
      setActiveView("payable");
    } else if (target.matchId) {
      setActiveView("exception");
    } else {
      setActiveView("ai-review");
    }
    if (target.matchId) {
      void openDetail(target);
    }
  }, [highlightTicketNo, highlightMatchId, loading, todos, items, openDetail]);

  const handleSaveArchive = async () => {
    if (!archive) return;
    if (!archiveForm.payeeName.trim()) {
      toast.error("请填写收款人");
      return;
    }
    setArchiveSaving(true);
    try {
      const res = await fetch("/api/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "vehicleSettlement",
          action: "upsert",
          item: {
            plateNo: archive.plateNo,
            driverName: archive.driverName,
            payeeName: archiveForm.payeeName.trim(),
            basePrice: Number(archiveForm.basePrice) || 0,
            priceDeduction: Number(archiveForm.priceDeduction) || 0,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "保存档案失败");
        return;
      }
      toast.success("已补录车辆结算档案");
      const target = archive.item;
      setArchive(null);
      await loadData();
    } finally {
      setArchiveSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载核对列表…
      </div>
    );
  }

  const nothingToDo = matchItems.length === 0;

  return (
    <div className={cn("flex flex-col gap-3", embedded ? "px-4 py-3" : "p-4")}>
      {summary && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background px-4 py-2.5 shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-semibold">
            {pendingItems.length > 0
              ? `待处理 ${pendingItems.length}`
              : `已核对 ${matchItems.length}`}
          </span>
          <span className="text-xs text-muted-foreground">
            / 共 {matchItems.length} 张 · 已通过 {autoPassedItems.length}
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <StatusPill
              label="全部"
              value={matchItems.length}
              active={activeView === "ai-review"}
              onClick={() => setActiveView("ai-review")}
            />
            <StatusPill
              label="异常"
              value={exceptionItems.length}
              tone="amber"
              active={activeView === "exception"}
              onClick={() => setActiveView("exception")}
            />
            <StatusPill
              label="可付款"
              value={canGeneratePaymentItems.length}
              tone="success"
              active={activeView === "payable"}
              onClick={() => setActiveView("payable")}
            />
          </div>
        </div>
      )}

      {nothingToDo && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
            <CheckCircle className="h-10 w-10 text-success" />
            <p className="text-sm font-medium text-foreground">没有待处理的单据</p>
            <p className="text-xs">
              上传新单据后，AI 会自动核对并把结果展示在这里
            </p>
          </CardContent>
        </Card>
      )}

      {/* AI 核对（全部核对记录：待处理 + 已通过） */}
      {activeView === "ai-review" && matchItems.length > 0 && (
        <div className="space-y-2">
          {pendingItems.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="flex items-center gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                待处理 {pendingItems.length} 张，会阻塞付款
                <span className="font-normal text-amber-700/80 dark:text-amber-300/80">
                  · 左侧黄条 = 尚未核对通过
                </span>
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                点磅单号看原图，点右侧按钮处理
              </p>
            </div>
          )}
          <ReviewTable
            items={pendingItems}
            busyId={busyId}
            measureById={measureById}
            inboundById={inboundById}
            onPreviewImage={setImagePreview}
            onDetail={openDetail}
            onApply={handleApply}
            onArchive={openArchive}
            onNavigateTab={navigateTab}
            onVerify={handleVerifyMeasure}
          />
          {autoPassedItems.length > 0 && (
            <PassedList
              title={`已通过（${autoPassedItems.length}）`}
              items={autoPassedItems}
              measureById={measureById}
              inboundById={inboundById}
              onPreviewImage={setImagePreview}
              onNavigateTab={navigateTab}
              onDetail={openDetail}
            />
          )}
        </div>
      )}

      {/* 异常：包含所有核对不通过的 */}
      {activeView === "exception" && (
        exceptionItems.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
              <h3 className="text-sm font-semibold">
                异常待处理（{exceptionItems.length}）
              </h3>
              <span className="text-xs text-muted-foreground">
                这些问题会阻塞付款
              </span>
            </div>
            <ReviewTable
              items={exceptionItems}
              busyId={busyId}
              measureById={measureById}
              inboundById={inboundById}
              onPreviewImage={setImagePreview}
              onDetail={openDetail}
              onApply={handleApply}
              onArchive={openArchive}
              onNavigateTab={navigateTab}
              onVerify={handleVerifyMeasure}
            />
          </div>
        ) : (
          <Card className="border-border/70">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <CheckCircle className="h-8 w-8 text-success" />
              <p className="text-sm font-medium">暂无异常核对记录</p>
              <p className="text-xs text-muted-foreground">
                当前没有会阻塞付款的单据
              </p>
            </CardContent>
          </Card>
        )
      )}

      {/* 可生成付款 */}
      {activeView === "payable" && (
        canGeneratePaymentItems.length > 0 ? (
          <PassedList
            title={`可生成付款（${canGeneratePaymentItems.length}）`}
            items={canGeneratePaymentItems}
            measureById={measureById}
            inboundById={inboundById}
            onPreviewImage={setImagePreview}
            onNavigateTab={navigateTab}
            onDetail={openDetail}
          />
        ) : (
          <Card className="border-border/70">
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <Banknote className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">暂无可付款单据</p>
              <p className="text-xs text-muted-foreground">
                AI 确认通过后会出现在这里
              </p>
            </CardContent>
          </Card>
        )
      )}

      {/* 明细弹窗 */}
      <Dialog open={detailOpen} onOpenChange={(o) => !detailLoading && setDetailOpen(o)}>
        <DialogContent className="w-[95vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              查看明细
              {detailItem?.ticketNo ? (
                <Badge variant="outline" className="font-mono">
                  {detailItem.ticketNo}
                </Badge>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载明细…
            </div>
          ) : detailData?.measure ? (
            (() => {
              const verification = detailData.inbound
                ? verifyMeasureAndInbound(detailData.measure, detailData.inbound)
                : null;
              const confirmChannel = detailData.match
                ? getMatchConfirmChannel(
                    detailData.match.confirmedBy,
                    detailData.match.matchStatus,
                    verification
                  )
                : null;
              const verifiedAt =
                detailData.match?.matchStatus === "已确认"
                  ? formatMatchVerificationTime(detailData.match, verification)
                  : undefined;

              return (
            <div className="space-y-4">
              {verification ? (
                <VerificationSummaryBanner
                  verification={verification}
                  matchStatus={detailData.match?.matchStatus}
                  confirmedBy={detailData.match?.confirmedBy}
                  verifiedAt={verifiedAt}
                  channelLabel={
                    confirmChannel ? (
                      <MatchConfirmChannelBadge channel={confirmChannel} />
                    ) : null
                  }
                />
              ) : null}

              <DetailDocumentImages
                ticketNo={detailItem?.ticketNo ?? detailData.measure.ticketNo}
                measure={detailData.measure}
                inbound={detailData.inbound}
                onPreview={setImagePreview}
              />

              {detailData.inbound ? (
                <DocumentCoreFieldsComparison
                  measure={detailData.measure}
                  inbound={detailData.inbound}
                  verification={verification}
                />
              ) : (
                <>
                  <DocumentCoreFieldsComparison measure={detailData.measure} />
                  <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20">
                    <CardContent className="space-y-2 py-4 text-sm">
                      <p className="font-medium text-amber-900 dark:text-amber-200">
                        未关联采购入库单
                      </p>
                      <p className="text-xs leading-relaxed text-amber-800/80 dark:text-amber-300/80">
                        请上传同号采购单 Excel 或截图，AI 会重新匹配这张磅单。
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}

              {detailData.match && detailData.inbound && verification ? (
                <VerificationReport
                  verification={verification}
                  matchStatus={detailData.match.matchStatus}
                  confirmedBy={detailData.match.confirmedBy}
                  hideHeader
                />
              ) : null}
            </div>
              );
            })()
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              暂无明细数据
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              关闭
            </Button>
            {detailItem?.action?.type === "addVehicleArchive" ? (
              <Button
                className="gap-1"
                onClick={() => {
                  setDetailOpen(false);
                  if (detailItem) openArchive(detailItem);
                }}
              >
                <Truck className="h-4 w-4" />
                补录档案
              </Button>
            ) : detailItem?.action.type === "adoptField" ? (
              <Button
                className="gap-1"
                disabled={busyId === detailItem.id}
                onClick={() => {
                  setDetailOpen(false);
                  void handleApply(detailItem);
                }}
              >
                <Wand2 className="h-4 w-4" />
                {detailItem.actionLabel}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 内联补录车辆档案 */}
      <Dialog open={archive !== null} onOpenChange={(o) => !archiveSaving && !o && setArchive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>补录车辆结算档案</DialogTitle>
          </DialogHeader>
          {archive && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">车牌</span>
                  <p className="font-mono">{archive.plateNo || "-"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">司机</span>
                  <p>{archive.driverName || "-"}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>收款人</Label>
                <Input
                  value={archiveForm.payeeName}
                  onChange={(e) => setArchiveForm((f) => ({ ...f, payeeName: e.target.value }))}
                  placeholder="收款人姓名"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>结算基础价</Label>
                  <Input
                    type="number"
                    value={archiveForm.basePrice}
                    onChange={(e) => setArchiveForm((f) => ({ ...f, basePrice: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>单价截留</Label>
                  <Input
                    type="number"
                    value={archiveForm.priceDeduction}
                    onChange={(e) => setArchiveForm((f) => ({ ...f, priceDeduction: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchive(null)} disabled={archiveSaving}>
              取消
            </Button>
            <Button onClick={() => void handleSaveArchive()} disabled={archiveSaving}>
              {archiveSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              保存并确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePreviewDialog
        preview={imagePreview}
        onClose={() => setImagePreview(null)}
      />
    </div>
  );
}

/** 七列表格：磅单号 | 司机 | 车牌 | 核对结果 | 原因 | 建议 | 处理方式 */
const REVIEW_TABLE_HEADERS = [
  "磅单号",
  "司机",
  "车牌",
  "核对结果",
  "原因",
  "建议",
  "处理方式",
] as const;
const REVIEW_ROW_PAD = "px-3 py-2 sm:px-4";
const reviewRowStyle = {
  gridTemplateColumns:
    "minmax(168px,1.1fr) minmax(64px,0.45fr) minmax(88px,0.55fr) minmax(128px,0.65fr) minmax(240px,1.45fr) minmax(220px,1.35fr) minmax(170px,0.9fr)",
} as const;
const REVIEW_ACTION_COL_INDEX = REVIEW_TABLE_HEADERS.length - 1;

function ReviewListFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/80 bg-background shadow-sm">
      <div className="min-w-[1160px] divide-y divide-border/70">
        <div
          className={cn(
            "grid items-center gap-x-3 bg-[#f4f6f3] text-[11px] font-medium text-muted-foreground dark:bg-muted/35",
            REVIEW_ROW_PAD
          )}
          style={reviewRowStyle}
        >
          {REVIEW_TABLE_HEADERS.map((label, i) => (
            <span
              key={label}
              className={cn(
                i > 0 && "border-l border-border/50 pl-3",
                i === REVIEW_ACTION_COL_INDEX && "text-right"
              )}
            >
              {label}
            </span>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

function ReviewTableCell({
  children,
  className,
  bordered = true,
  truncate = true,
}: {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  truncate?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 text-xs leading-snug",
        truncate && "truncate",
        bordered && "border-l border-border/50 pl-3",
        className
      )}
    >
      {children}
    </div>
  );
}

function ReviewTicketCell({
  ticketNo,
  measure,
  inbound,
  onPreview,
  onDetail,
}: {
  ticketNo: string;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
  onPreview: (preview: ImagePreview) => void;
  onDetail?: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <DocumentThumbs
        compact
        fixedSlots
        ticketNo={ticketNo}
        measure={measure}
        inbound={inbound}
        onPreview={onPreview}
      />
      {onDetail ? (
        <button
          type="button"
          className="truncate font-mono text-xs font-semibold text-foreground hover:text-primary hover:underline"
          title={ticketNo}
          onClick={onDetail}
        >
          {ticketNo}
        </button>
      ) : (
        <span className="truncate font-mono text-xs font-semibold" title={ticketNo}>
          {ticketNo}
        </span>
      )}
    </div>
  );
}

function ReviewResultCell({
  item,
  verification,
}: {
  item: AiTodoItem;
  verification?: ReturnType<typeof verifyMeasureAndInbound> | null;
}) {
  if (item.status === "auto-passed") {
    const channel =
      item.meta?.confirmChannel ? (
        <MatchConfirmChannelBadge channel={item.meta.confirmChannel} compact />
      ) : null;

    return (
      <VerificationResultBadge
        passed
        verification={verification}
        channelLabel={channel}
      />
    );
  }

  return <StatusBadge status={item.status} compact />;
}

function ReviewTextCell({
  text,
  emphasis = false,
}: {
  text: string;
  emphasis?: boolean;
}) {
  return (
    <ReviewTableCell truncate={false}>
      <span
        className={cn(
          "block",
          emphasis ? "font-medium text-foreground" : "text-muted-foreground"
        )}
        title={text}
      >
        {text}
      </span>
    </ReviewTableCell>
  );
}

function canOpenCompareDetail(item: AiTodoItem): boolean {
  return Boolean(item.matchId || item.measureId);
}

function ReviewSuggestionCell({
  item,
  busy,
  onDetail,
}: {
  item: AiTodoItem;
  busy?: boolean;
  onDetail: () => void;
}) {
  if (canOpenCompareDetail(item)) {
    const toneClass =
      item.status === "auto-passed"
        ? "border-success/45 bg-success/8 text-success hover:bg-success/15 hover:border-success/55 dark:bg-success/10"
        : item.status === "manual"
          ? "border-amber-400/55 bg-amber-50/80 text-amber-800 hover:bg-amber-100/90 hover:border-amber-500/60 dark:border-amber-700/60 dark:bg-amber-950/25 dark:text-amber-200"
          : "border-sky-400/55 bg-sky-50/80 text-sky-700 hover:bg-sky-100/90 hover:border-sky-500/60 dark:border-sky-700/60 dark:bg-sky-950/25 dark:text-sky-300";

    return (
      <ReviewTableCell truncate={false}>
        <Button
          size="sm"
          variant="outline"
          className={cn("h-7 gap-1 px-2.5 text-xs font-medium shadow-sm", toneClass)}
          disabled={busy}
          onClick={onDetail}
        >
          <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
          查看对比明细
        </Button>
      </ReviewTableCell>
    );
  }
  return (
    <ReviewTextCell
      text={getAiTodoSuggestion(item)}
      emphasis={item.status === "auto-passed"}
    />
  );
}

function StatusPill({
  label,
  value,
  tone = "default",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "amber";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    amber: "text-amber-700 dark:text-amber-300",
  };

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
        onClick && "cursor-pointer select-none",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border/70 bg-background text-muted-foreground hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={cn("font-semibold tabular-nums", active ? "text-primary" : toneClass[tone])}>
        {value}
      </span>
    </button>
  );
}

function ReviewTable({
  items,
  busyId,
  measureById,
  inboundById,
  onPreviewImage,
  onDetail,
  onApply,
  onArchive,
  onNavigateTab,
  onVerify,
}: {
  items: AiTodoItem[];
  busyId: string | null;
  measureById: Map<string, MeasureTicket>;
  inboundById: Map<string, InboundRecord>;
  onPreviewImage: (preview: ImagePreview) => void;
  onDetail: (item: AiTodoItem) => Promise<void>;
  onApply: (item: AiTodoItem) => Promise<void>;
  onArchive: (item: AiTodoItem) => void;
  onNavigateTab?: (tab: "measure" | "inbound" | "payment", ticketNo?: string) => void;
  onVerify: (item: AiTodoItem) => Promise<void>;
}) {
  return (
    <ReviewListFrame>
      {items.map((item) => (
        <ReviewTableRow
          key={item.id}
          item={item}
          busy={busyId === item.id}
          measure={item.measureId ? measureById.get(item.measureId) : undefined}
          inbound={item.inboundId ? inboundById.get(item.inboundId) : undefined}
          onPreviewImage={onPreviewImage}
          onDetail={() => void onDetail(item)}
          onApply={() => void onApply(item)}
          onArchive={() => onArchive(item)}
          onNavigateTab={onNavigateTab}
          onVerify={() => void onVerify(item)}
        />
      ))}
    </ReviewListFrame>
  );
}

function ReviewTableRow({
  item,
  busy,
  measure,
  inbound,
  onPreviewImage,
  onDetail,
  onApply,
  onArchive,
  onNavigateTab,
  onVerify,
}: {
  item: AiTodoItem;
  busy: boolean;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
  onPreviewImage: (preview: ImagePreview) => void;
  onDetail: () => void;
  onApply: () => void;
  onArchive: () => void;
  onNavigateTab?: (tab: "measure" | "inbound" | "payment", ticketNo?: string) => void;
  onVerify: () => void;
}) {
  const name = item.driverName?.trim() || "—";
  const plate = item.plateNo?.trim() || "—";
  const reason = getAiTodoReason(item);
  const verification =
    measure && inbound ? verifyMeasureAndInbound(measure, inbound) : null;

  return (
    <div
      className={cn(
        "grid items-center gap-x-3 border-l-4 transition-colors",
        item.status === "auto-passed"
          ? "border-l-success bg-success/[0.03] hover:bg-success/[0.06]"
          : "border-l-amber-400 bg-amber-50/20 hover:bg-amber-50/40 dark:border-l-amber-600 dark:bg-amber-950/10 dark:hover:bg-amber-950/20",
        REVIEW_ROW_PAD
      )}
      style={reviewRowStyle}
    >
      <ReviewTicketCell
        ticketNo={item.ticketNo}
        measure={measure}
        inbound={inbound}
        onPreview={onPreviewImage}
        onDetail={onDetail}
      />
      <ReviewTableCell bordered={false} className="text-foreground">
        <span className="truncate" title={name}>
          {name}
        </span>
      </ReviewTableCell>
      <ReviewTableCell>
        <span className="truncate font-mono" title={plate}>
          {plate}
        </span>
      </ReviewTableCell>
      <ReviewTableCell truncate={false}>
        <ReviewResultCell item={item} verification={verification} />
      </ReviewTableCell>
      <ReviewTextCell text={reason} emphasis={item.status === "manual"} />
      <ReviewSuggestionCell item={item} busy={busy} onDetail={onDetail} />
      <ReviewTableCell className="text-right">
        <ReviewRowActions
          item={item}
          busy={busy}
          onDetail={onDetail}
          onApply={onApply}
          onArchive={onArchive}
          onNavigateTab={onNavigateTab}
          onVerify={onVerify}
        />
      </ReviewTableCell>
    </div>
  );
}

function ReviewRowActions({
  item,
  busy,
  onDetail,
  onApply,
  onArchive,
  onNavigateTab,
  onVerify,
}: {
  item: AiTodoItem;
  busy: boolean;
  onDetail: () => void;
  onApply: () => void;
  onArchive: () => void;
  onNavigateTab?: (tab: "measure" | "inbound" | "payment", ticketNo?: string) => void;
  onVerify: () => void;
}) {
  const primary = (() => {
    switch (item.action.type) {
      case "openDetail":
        return null;
      case "adoptField":
        return (
          <Button size="sm" className="h-7 gap-0.5 px-2 text-xs" disabled={busy} onClick={onApply}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            {item.actionLabel ?? "采用"}
          </Button>
        );
      case "addVehicleArchive":
        return (
          <Button size="sm" className="h-7 gap-0.5 px-2 text-xs" disabled={busy} onClick={onArchive}>
            <Truck className="h-3 w-3" />
            {item.actionLabel ?? "补录档案"}
          </Button>
        );
      case "navigate": {
        const tab = item.action.tab;
        const ticketNo =
          item.action.tab === "payment" ? item.action.ticketNo ?? item.ticketNo : undefined;
        return (
          <Button
            size="sm"
            variant={tab === "payment" ? "default" : "secondary"}
            className="h-7 gap-0.5 px-2 text-xs"
            disabled={busy}
            onClick={() => onNavigateTab?.(tab, ticketNo)}
          >
            {tab === "inbound" ? (
              <Upload className="h-3 w-3" />
            ) : tab === "payment" ? (
              <Banknote className="h-3 w-3" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            {item.actionLabel ?? "去处理"}
          </Button>
        );
      }
      case "verify":
        return (
          <Button size="sm" className="h-7 gap-0.5 px-2 text-xs" disabled={busy} onClick={onVerify}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardCheck className="h-3 w-3" />}
            {item.actionLabel ?? "一键核对"}
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
      {primary}
    </div>
  );
}

const THUMB_SLOT_LABELS = ["计量", "采购"] as const;

function DocumentThumbSlot({
  image,
  label,
  sizeClass,
  onPreview,
}: {
  image?: ImagePreviewLabel;
  label: string;
  sizeClass: string;
  onPreview: (preview: ImagePreview) => void;
}) {
  if (image) {
    return (
      <button
        type="button"
        className={cn(
          "group relative shrink-0 overflow-hidden rounded border bg-muted",
          sizeClass
        )}
        title={`查看${label}单`}
        onClick={() => onPreview({ title: image.title, src: image.src })}
      >
        <img src={image.src} alt={image.title} className="h-full w-full object-cover" />
        <ImageMagnifyOverlay />
        <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[8px] leading-tight text-white">
          {label}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded border border-dashed border-border/60 bg-muted/30",
        sizeClass
      )}
      title={`暂无${label}单图片`}
    >
      <span className="text-[8px] leading-none text-muted-foreground/70">{label}</span>
    </div>
  );
}

function DocumentThumbs({
  ticketNo,
  measure,
  inbound,
  onPreview,
  compact = false,
  fixedSlots = false,
}: {
  ticketNo: string;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
  onPreview: (preview: ImagePreview) => void;
  compact?: boolean;
  /** 表格行：固定「计量+采购」两格，缺图显示占位，保证榜单号对齐 */
  fixedSlots?: boolean;
}) {
  const images = getDocumentImages({ ticketNo, measure, inbound });
  const sizeClass = compact ? "h-8 w-7" : "h-11 w-11";

  if (fixedSlots) {
    const byLabel = new Map(images.map((img) => [img.label, img]));
    return (
      <div className="flex w-[3.75rem] shrink-0 gap-1">
        {THUMB_SLOT_LABELS.map((label) => (
          <DocumentThumbSlot
            key={label}
            label={label}
            sizeClass={sizeClass}
            image={byLabel.get(label)}
            onPreview={onPreview}
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }

  return (
    <div className="flex gap-1">
      {images.map((image) => (
        <DocumentThumbSlot
          key={image.label}
          label={image.label}
          sizeClass={sizeClass}
          image={image}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

function DetailDocumentImages({
  ticketNo,
  measure,
  inbound,
  onPreview,
}: {
  ticketNo: string;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
  onPreview: (preview: ImagePreview) => void;
}) {
  const images = getDocumentImages({ ticketNo, measure, inbound });

  if (images.length === 0) return null;

  return (
    <section className="rounded-lg border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">单据图片</h3>
        <span className="text-xs text-muted-foreground">点击放大镜放大，可拖动查看</span>
      </div>
      <div
        className={cn(
          "grid gap-3",
          images.length > 1 ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {images.map((image) => (
          <button
            key={image.label}
            type="button"
            className="group overflow-hidden rounded-lg border bg-background text-left shadow-sm"
            onClick={() => onPreview({ title: image.title, src: image.src })}
          >
            <div className="relative aspect-[4/3] overflow-hidden bg-muted">
              <img
                src={image.src}
                alt={image.title}
                className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
              />
              <ImageMagnifyOverlay />
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium">{image.label}单</span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ZoomIn className="h-3 w-3" />
                放大
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function getDocumentImages({
  ticketNo,
  measure,
  inbound,
}: {
  ticketNo: string;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
}) {
  return [
    measure?.imagePath
      ? {
          label: "计量",
          src: normalizeFileUrl(measure.imagePath),
          title: `${ticketNo} 计量单`,
        }
      : null,
    inbound?.sourceFile && inbound.sourceFile.includes("/api/files")
      ? {
          label: "采购",
          src: normalizeFileUrl(inbound.sourceFile),
          title: `${ticketNo} 采购单`,
        }
      : null,
  ].filter(Boolean) as ImagePreviewLabel[];
}

type ImagePreviewLabel = ImagePreview & {
  label: string;
};

function StatusBadge({
  status,
  compact = false,
}: {
  status: AiTodoStatus;
  compact?: boolean;
}) {
  const statusLabel: Record<AiTodoStatus, string> = {
    "ai-fixable": compact ? "可修正" : "AI 可修正",
    manual: compact ? "需人工" : "需人工处理",
    "auto-passed": "已通过",
  };
  const toneClass: Record<AiTodoStatus, string> = {
    "ai-fixable": "border-sky-500/30 text-sky-700 dark:text-sky-300",
    manual: "border-amber-500/35 text-amber-700 dark:text-amber-300",
    "auto-passed": "border-success/30 text-success",
  };

  return (
    <Badge
      variant="outline"
      className={cn(compact ? "h-5 px-1.5 text-[10px]" : "text-[11px]", toneClass[status])}
    >
      {statusLabel[status]}
    </Badge>
  );
}

function PassedList({
  title,
  items,
  measureById,
  inboundById,
  onPreviewImage,
  onNavigateTab,
  onDetail,
}: {
  title: string;
  items: AiTodoItem[];
  measureById: Map<string, MeasureTicket>;
  inboundById: Map<string, InboundRecord>;
  onPreviewImage: (preview: ImagePreview) => void;
  onNavigateTab: (tab: "measure" | "inbound" | "payment", ticketNo?: string) => void;
  onDetail: (item: AiTodoItem) => Promise<void>;
}) {
  const shown = items.slice(0, 50);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2 text-xs font-semibold text-success">
        <CheckCircle className="h-4 w-4 shrink-0" />
        {title}
        <span className="font-normal text-muted-foreground">· 左侧绿条 = 已核对通过</span>
      </p>
      <ReviewListFrame>
            {shown.map((item) => {
              const measure = item.measureId
                ? measureById.get(item.measureId)
                : undefined;
              const inbound = item.inboundId
                ? inboundById.get(item.inboundId)
                : undefined;
              const verification =
                measure && inbound
                  ? verifyMeasureAndInbound(measure, inbound)
                  : null;
              const confirmChannel =
                item.meta?.confirmChannel ??
                getMatchConfirmChannel(
                  item.meta?.confirmedBy,
                  "已确认",
                  verification
                );

              const name = item.driverName?.trim() || "—";
              const plate = item.plateNo?.trim() || "—";
              const reason = getAiTodoReason(item);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "grid items-center gap-x-3 border-l-4 border-l-success bg-success/[0.04] transition-colors hover:bg-success/[0.08] dark:hover:bg-success/10",
                    REVIEW_ROW_PAD
                  )}
                  style={reviewRowStyle}
                >
                  <ReviewTicketCell
                    ticketNo={item.ticketNo}
                    measure={measure}
                    inbound={inbound}
                    onPreview={onPreviewImage}
                  />
                  <ReviewTableCell bordered={false} className="text-foreground">
                    <span className="truncate" title={name}>
                      {name}
                    </span>
                  </ReviewTableCell>
                  <ReviewTableCell>
                    <span className="truncate font-mono" title={plate}>
                      {plate}
                    </span>
                  </ReviewTableCell>
                  <ReviewTableCell truncate={false}>
                    <VerificationResultBadge
                      passed
                      verification={verification}
                      channelLabel={
                        <MatchConfirmChannelBadge channel={confirmChannel} compact />
                      }
                    />
                  </ReviewTableCell>
                  <ReviewTextCell text={reason} emphasis />
                  <ReviewSuggestionCell
                    item={item}
                    onDetail={() => void onDetail(item)}
                  />
                  <ReviewTableCell className="text-right">
                    <ReviewRowActions
                      item={item}
                      busy={false}
                      onDetail={() => void onDetail(item)}
                      onApply={() => {}}
                      onArchive={() => {}}
                      onNavigateTab={onNavigateTab}
                      onVerify={() => {}}
                    />
                  </ReviewTableCell>
                </div>
              );
            })}
      </ReviewListFrame>
      {items.length > 50 && (
        <p className="text-[10px] text-muted-foreground">已隐藏 {items.length - 50} 条</p>
      )}
    </div>
  );
}
