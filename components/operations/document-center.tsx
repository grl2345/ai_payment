"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileImage,
  FileSpreadsheet,
  Sparkles,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  MoreHorizontal,
  Eye,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn, normalizeFileUrl, parseFetchJsonResponse } from "@/lib/utils";
import {
  collectFilesFromDataTransfer,
  MEASURE_UPLOAD_MAX,
  pickMeasureImageFiles,
} from "@/lib/import/measure-upload-files";
import { getInboundFileKind, isInboundFileSupported } from "@/lib/import/inbound-file";
import {
  buildMeasureCentricReviewItems,
  type AiTodoResult,
} from "@/lib/import/ai-suggestions";
import type { DashboardStats } from "@/lib/import/dashboard-stats";
import { formatMatchVerificationTime } from "@/lib/import/document-verification";
import type {
  InboundRecord,
  MeasureTicket,
  TicketMatch,
  UploadedFileRecord,
} from "@/lib/types";
import { MeasureReviewDialog } from "@/components/measure-review-dialog";
import { InboundReviewDialog } from "@/components/inbound-review-dialog";
import { AiReviewPanel } from "@/components/operations/ai-review-panel";
import { RecognizeDurationCell } from "@/components/recognize-duration-cell";

type UploadKind = "measure" | "inbound" | "both";
type DocStatus = "passed" | "pending" | "rejected";
type DocRow = {
  key: string;
  kind: "measure" | "inbound";
  ticketNo: string;
  plateNo?: string;
  driverName?: string;
  supplierName?: string;
  imageSrc?: string;
  status: DocStatus;
  statusText: string;
  time?: string;
  measureId?: string;
  measure?: MeasureTicket;
  inbound?: InboundRecord;
  matchId?: string;
  canVerify: boolean;
};

export function DocumentCenter() {
  const searchParams = useSearchParams();
  const [todos, setTodos] = useState<AiTodoResult | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [measures, setMeasures] = useState<MeasureTicket[]>([]);
  const [inbounds, setInbounds] = useState<InboundRecord[]>([]);
  const [matches, setMatches] = useState<TicketMatch[]>([]);
  const [uploads, setUploads] = useState<UploadedFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [listTab, setListTab] = useState("measure");
  const [search, setSearch] = useState("");
  const [uploadKind] = useState<UploadKind>("both");
  const [uploading, setUploading] = useState(false);
  // 计量单当前批次
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchUploadIds, setBatchUploadIds] = useState<string[]>([]);
  // 采购单上传结果横幅
  const [inboundResult, setInboundResult] = useState<{ count: number; fileName: string } | null>(null);
  // 采购单图片异步识别进度
  const [inboundPendingUpload, setInboundPendingUpload] = useState<{ uploadId: string; fileName: string } | null>(null);
  const [reviewTicket, setReviewTicket] = useState<MeasureTicket | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewInbound, setReviewInbound] = useState<InboundRecord | null>(null);
  const [reviewInboundOpen, setReviewInboundOpen] = useState(false);

  const measureInputRef = useRef<HTMLInputElement>(null);
  const inboundInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const res = await fetch("/api/import");
      const data = await parseFetchJsonResponse<{
        aiTodos?: AiTodoResult | null;
        dashboardStats?: DashboardStats | null;
        measureTickets?: MeasureTicket[];
        inboundRecords?: InboundRecord[];
        ticketMatches?: TicketMatch[];
        uploads?: UploadedFileRecord[];
      }>(res);
      if (!res.ok) return;
      setTodos(data.aiTodos ?? null);
      setStats(data.dashboardStats ?? null);
      setMeasures(data.measureTickets ?? []);
      setInbounds(data.inboundRecords ?? []);
      setMatches(data.ticketMatches ?? []);
      setUploads(data.uploads ?? []);
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "加载数据失败");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshForAiReview = useCallback(() => {
    void loadData({ silent: true });
  }, [loadData]);

  // 有「识别中」票据时快轮询（1s），否则慢轮询（5s）
  const hasProcessing =
    measures.some((m) => m.ocrStatus === "识别中" || m.ocrStatus === "待识别") ||
    !!inboundPendingUpload;

  useEffect(() => {
    // 初始加载后立即跑一次 pipeline，用最新阈值重新评估所有"待审核"记录
    void loadData().then(() =>
      fetch("/api/import?pipeline=true", { method: "POST" })
        .then(() => loadData())
        .catch(() => {})
    );
  }, [loadData]);

  useEffect(() => {
    const interval = hasProcessing ? 1000 : 5000;
    const t = window.setInterval(() => void loadData({ silent: true }), interval);
    return () => window.clearInterval(t);
  }, [loadData, hasProcessing]);

  const summary = todos?.summary;
  const aiReviewRows = useMemo(
    () => buildMeasureCentricReviewItems(measures, todos?.items ?? []),
    [measures, todos?.items]
  );
  const aiReviewPendingCount = useMemo(
    () => aiReviewRows.filter((r) => r.status !== "auto-passed").length,
    [aiReviewRows]
  );
  const aiVerifyTodoCount = aiReviewPendingCount;

  const highlightTicketNo = searchParams.get("ticketNo")?.trim() || undefined;
  const highlightMatchId = searchParams.get("matchId")?.trim() || undefined;
  const uploadById = useMemo(
    () => new Map(uploads.map((u) => [u.id, u])),
    [uploads]
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (
      tab === "passed" ||
      tab === "verify" ||
      tab === "verification" ||
      tab === "ai-review" ||
      tab === "pending"
    ) {
      setListTab("passed");
    }
  }, [searchParams]);

  const totalDocs = measures.length + inbounds.length;
  const todayUpload = stats?.today.uploadCount ?? uploads.length;
  const todaySuccess =
    stats?.today.recognizeSuccess ??
    measures.filter((m) => m.ocrStatus === "已审核").length;
  const todayFail = measures.filter((m) => m.ocrStatus === "识别失败").length;

  const uploadMeasure = async (files: FileList | File[]) => {
    const picked = pickMeasureImageFiles(files);
    if (picked.images.length === 0) {
      toast.error("请上传 JPG/PNG 计量单图片");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    picked.images.forEach((f) => formData.append("files", f));
    try {
      const res = await fetch("/api/import/measure?async=true", {
        method: "POST",
        body: formData,
      });
      const data = await parseFetchJsonResponse<{ error?: string; uploadIds?: string[] }>(res);
      if (!res.ok) throw new Error(data.error || "上传失败");
      const ids: string[] = data.uploadIds ?? [];
      setBatchTotal(picked.images.length);
      setBatchUploadIds(ids);
      toast.success(`已上传 ${picked.images.length} 张计量单，AI 识别中`);
      await fetch("/api/import?pipeline=true", { method: "POST" });
      setListTab("measure");
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const uploadInbound = async (file: File) => {
    if (!isInboundFileSupported(file)) {
      toast.error("请上传 Excel 或采购单截图");
      return;
    }
    setInboundResult(null);
    setInboundPendingUpload(null);
    const isImage = file.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(file.name);
    const formData = new FormData();
    formData.append("file", file);

    if (isImage) {
      // 图片采购单：异步识别，立即返回 uploadId，显示进度横幅
      setUploading(true);
      try {
        const res = await fetch("/api/import/inbound?async=true", { method: "POST", body: formData });
        const data = await parseFetchJsonResponse<{ error?: string; uploadId?: string }>(res);
        if (!res.ok) throw new Error(data.error || "上传失败");
        setInboundPendingUpload({ uploadId: data.uploadId!, fileName: file.name });
        toast.success("采购单截图已上传，AI 识别中…");
        setListTab("inbound");
        await loadData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    } else {
      // Excel：同步解析，速度极快，直接等待结果
      setUploading(true);
      try {
        const res = await fetch("/api/import/inbound", { method: "POST", body: formData });
        const data = await parseFetchJsonResponse<{
          error?: string;
          count?: number;
          records?: unknown[];
        }>(res);
        if (!res.ok) throw new Error(data.error || "上传失败");
        const count: number = data.count ?? data.records?.length ?? 0;
        setInboundResult({ count, fileName: file.name });
        toast.success(`采购单导入成功，共 ${count} 条记录`);
        await fetch("/api/import?pipeline=true", { method: "POST" });
        setListTab("inbound");
        await loadData();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    }
  };

  const handleZoneFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const images = arr.filter((f) =>
      f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
    );
    const sheets = arr.filter((f) =>
      /\.(xlsx|xls|csv)$/i.test(f.name)
    );

    if (uploadKind === "inbound") {
      // 采购单模式：Excel 优先，其次图片
      const target = sheets[0] ?? images[0];
      if (!target) {
        toast.error("不支持该文件格式，请上传 Excel（.xlsx/.csv）或采购单截图（JPG/PNG）");
        return;
      }
      void uploadInbound(target);
      return;
    }

    if (uploadKind === "measure") {
      // 计量单模式：只接受图片，Excel 直接拒绝
      if (images.length === 0) {
        if (sheets.length > 0) {
          toast.error("计量单请上传磅单图片（JPG / PNG），Excel 文件请切换到「采购单」模式");
        } else {
          toast.error("不支持该文件格式，请上传计量单图片（JPG / PNG）");
        }
        return;
      }
      void uploadMeasure(images);
      return;
    }

    // "both" 模式：Excel → 采购单，图片 → 计量单
    if (sheets.length) void uploadInbound(sheets[0]);
    if (images.length) void uploadMeasure(images);
  };

  const measureById = useMemo(
    () => new Map(measures.map((m) => [m.id, m])),
    [measures]
  );
  const matchById = useMemo(
    () => new Map(matches.map((m) => [m.id, m])),
    [matches]
  );

  // 把每一张已上传的计量单 / 采购单都列成一行，并标注状态
  const docRows = useMemo<DocRow[]>(() => {
    const rows: DocRow[] = [];

    for (const m of measures) {
      const match = matches.find(
        (x) => x.measureTicketId === m.id && x.matchStatus !== "已作废"
      );
      const voided =
        !match &&
        matches.some((x) => x.measureTicketId === m.id && x.matchStatus === "已作废");
      let status: DocStatus = "pending";
      let statusText = "待人工处理";
      if (match?.matchStatus === "已确认") {
        status = "passed";
        statusText = "AI 核对已通过";
      } else if (voided) {
        status = "rejected";
        statusText = "已驳回";
      } else if (m.ocrStatus === "识别失败") {
        statusText = "识别失败，待人工";
      } else if (!match) {
        statusText = "待匹配采购单";
      } else {
        statusText = match.exceptionDetail || "待人工核对";
      }
      rows.push({
        key: `m-${m.id}`,
        kind: "measure",
        ticketNo: m.ticketNo || "(无磅单号)",
        plateNo: m.plateNo,
        driverName: m.driverName,
        supplierName: m.supplierName,
        imageSrc: m.imagePath,
        status,
        statusText,
        time: match?.confirmedAt || m.createdAt,
        measureId: m.id,
        measure: m,
        matchId: match?.id,
        canVerify: Boolean(match && match.matchStatus !== "已确认"),
      });
    }

    for (const r of inbounds) {
      const match = matches.find(
        (x) => x.inboundRecordId === r.id && x.matchStatus !== "已作废"
      );
      const voided =
        !match &&
        matches.some((x) => x.inboundRecordId === r.id && x.matchStatus === "已作废");
      let status: DocStatus = "pending";
      let statusText = "待人工处理";
      if (match?.matchStatus === "已确认") {
        status = "passed";
        statusText = "AI 核对已通过";
      } else if (voided) {
        status = "rejected";
        statusText = "已驳回";
      } else if (!match) {
        statusText = "待匹配计量单";
      } else {
        statusText = match.exceptionDetail || "待人工核对";
      }
      rows.push({
        key: `i-${r.id}`,
        kind: "inbound",
        ticketNo: r.ticketNo || "(无单号)",
        plateNo: r.plateNo,
        driverName: r.driverName,
        supplierName: r.supplierName,
        imageSrc: r.sourceFile?.includes("/api/files") ? r.sourceFile : undefined,
        status,
        statusText,
        time: match?.confirmedAt || r.createdAt,
        inbound: r,
        matchId: match?.id,
        canVerify: false,
      });
    }

    return rows;
  }, [measures, inbounds, matches]);

  const docPending = useMemo(() => docRows.filter((d) => d.status === "pending"), [docRows]);

  return (
    <div className="flex flex-col min-h-full bg-[#f7f8f6] dark:bg-muted/15">
      {/* 页头 */}
      <div className="border-b border-border bg-background px-4 py-3 sm:px-5">
        <div>
            <h1 className="text-xl font-semibold tracking-normal">单据核对</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              先看异常原因，再补单、核对、生成付款。
            </p>
          </div>
      </div>

      <div className="flex-1 space-y-3 p-3 sm:p-4 sm:px-5">
        {/* 任务摘要 + 紧凑上传 */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-stretch">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="flex h-full flex-col justify-between gap-3 p-4">
              <div className="space-y-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">当前核对进度</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    共 {measures.length} 张计量单，AI 已通过 {summary?.autoPassed ?? 0} 张，待人工处理 {aiVerifyTodoCount} 张。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCell label="计量单" value={measures.length} />
                  <StatCell label="采购单" value={inbounds.length} />
                  <StatCell label="待核对" value={aiVerifyTodoCount} accent={aiVerifyTodoCount > 0 ? "warning" : undefined} />
                  <StatCell label="识别中" value={measures.filter((m) => m.ocrStatus === "识别中" || m.ocrStatus === "待识别").length} />
                </div>
              </div>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                {aiVerifyTodoCount > 0
                  ? "请优先进入「AI 核对」处理缺采购单、磅单差异和档案缺失。"
                  : "当前没有阻塞付款的异常，可以继续上传新单据或去付款中心同步。"}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardContent className="flex h-full flex-col gap-2.5 p-3">
              {/* 隐藏文件输入 */}
              <input ref={measureInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                onChange={(e) => { if (e.target.files) void uploadMeasure(e.target.files); e.target.value = ""; }} />
              <input ref={inboundInputRef} type="file" accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadInbound(f); e.target.value = ""; }} />

              <p className="px-1 text-xs font-semibold">上传新单据</p>
              <div className="grid flex-1 grid-cols-2 gap-2.5">
                {/* 左：计量单 */}
                <div
                  className={cn(
                    "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center transition-all",
                    uploading
                      ? "border-blue-200 bg-blue-50/40 opacity-75 dark:border-blue-800/40 dark:bg-blue-950/10"
                      : "border-blue-200/70 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50/60 dark:border-blue-800/30 dark:bg-blue-950/10 dark:hover:border-blue-600"
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void collectFilesFromDataTransfer(e.dataTransfer).then((files) => {
                      const images = Array.from(files).filter(
                        (f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(f.name)
                      );
                      if (images.length) void uploadMeasure(images);
                      else toast.error("计量单请上传磅单图片（JPG / PNG）");
                    });
                  }}
                  onClick={() => !uploading && measureInputRef.current?.click()}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 transition-transform group-hover:scale-105 dark:bg-blue-900/40 dark:text-blue-400">
                    <FileImage className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">计量单</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-blue-600/70 dark:text-blue-500/70">
                      磅单照片 / 过磅截图<br />JPG、PNG · 最多 {MEASURE_UPLOAD_MAX} 张
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={uploading}
                    className="h-7 gap-1 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0"
                    onClick={(e) => { e.stopPropagation(); if (!uploading) measureInputRef.current?.click(); }}
                  >
                    {uploading ? <><RefreshCw className="h-3 w-3 animate-spin" />识别中…</> : <><Upload className="h-3 w-3" />上传图片</>}
                  </Button>
                </div>

                {/* 右：采购单 */}
                <div
                  className={cn(
                    "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-center transition-all",
                    uploading
                      ? "border-emerald-200 bg-emerald-50/40 opacity-75 dark:border-emerald-800/40 dark:bg-emerald-950/10"
                      : "border-emerald-200/70 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-emerald-800/30 dark:bg-emerald-950/10 dark:hover:border-emerald-600"
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void collectFilesFromDataTransfer(e.dataTransfer).then((files) => {
                      const arr = Array.from(files);
                      const sheets = arr.filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
                      const images = arr.filter((f) => f.type.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(f.name));
                      const target = sheets[0] ?? images[0];
                      if (target) void uploadInbound(target);
                      else toast.error("采购单支持 Excel（.xlsx/.csv）或截图（JPG/PNG）");
                    });
                  }}
                  onClick={() => !uploading && inboundInputRef.current?.click()}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-105 dark:bg-emerald-900/40 dark:text-emerald-400">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">采购单</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-emerald-600/70 dark:text-emerald-500/70">
                      结算 Excel 或采购单截图<br />XLSX、XLS、CSV、JPG、PNG
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={uploading}
                    className="h-7 gap-1 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    onClick={(e) => { e.stopPropagation(); if (!uploading) inboundInputRef.current?.click(); }}
                  >
                    <Upload className="h-3 w-3" />上传文件
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* 列表区 */}
        <Card className="border-border/80 shadow-sm">
          <CardContent className="p-0">
            <Tabs value={listTab} onValueChange={setListTab}>
              <div className="flex flex-col gap-2 border-b border-border px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="h-9 bg-muted/50 p-0.5">
                  <TabsTrigger value="measure" className="text-xs px-3 h-8">
                    计量单
                    <Badge variant="secondary" className="ml-1.5 h-4 min-w-[18px] px-1 text-[10px]">
                      {docRows.filter((d) => d.kind === "measure").length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="inbound" className="text-xs px-3 h-8">
                    采购单
                    <Badge variant="secondary" className="ml-1.5 h-4 min-w-[18px] px-1 text-[10px]">
                      {docRows.filter((d) => d.kind === "inbound").length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="passed" className="text-xs px-3 h-8 gap-1">
                    <Sparkles className="h-3 w-3" />
                    AI核对
                    {aiVerifyTodoCount > 0 ? (
                      <Badge className="ml-0.5 h-4 min-w-[18px] px-1 text-[10px] bg-amber-500/15 text-amber-700 border-0 dark:text-amber-300">
                        {aiVerifyTodoCount}
                      </Badge>
                    ) : (
                      <Badge className="ml-0.5 h-4 min-w-[18px] px-1 text-[10px] bg-emerald-500/15 text-emerald-700 border-0 dark:text-emerald-300">
                        {aiReviewRows.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="搜索单据号、车牌、司机…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void loadData()}>
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </Button>
                </div>
              </div>

              {/* 计量单 Tab — 展示识别状态 */}
              <TabsContent value="measure" className="m-0 p-4 space-y-3">
                <OcrProgressBar
                  measures={measures}
                  batchTotal={batchTotal}
                  batchUploadIds={batchUploadIds}
                  onDone={() => { setBatchTotal(0); setBatchUploadIds([]); }}
                />
                <MeasureOcrTable
                  uploadById={uploadById}
                  measures={measures.filter((m) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return `${m.ticketNo} ${m.plateNo} ${m.driverName} ${m.supplierName}`.toLowerCase().includes(q);
                  })}
                  onView={(t) => { setReviewTicket(t); setReviewOpen(true); }}
                  onDelete={async (id) => {
                    await fetch(`/api/import/measure?id=${id}`, { method: "DELETE" });
                    await loadData();
                  }}
                  onBulkDelete={async (ids) => {
                    await Promise.all(ids.map((id) => fetch(`/api/import/measure?id=${id}`, { method: "DELETE" })));
                    await loadData();
                  }}
                  onHumanConfirm={async (id) => {
                    const res = await fetch(`/api/import/measure?id=${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ confirm: true }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({}));
                      toast.error(data.error ?? "确认失败");
                      return;
                    }
                    toast.success("已人工确认");
                    await loadData();
                  }}
                />
              </TabsContent>

              {/* 采购单 Tab — 展示识别状态 */}
              <TabsContent value="inbound" className="m-0 p-4">
                {/* 图片识别进度横幅 */}
                {inboundPendingUpload && (
                  <InboundImageProgress
                    uploadId={inboundPendingUpload.uploadId}
                    fileName={inboundPendingUpload.fileName}
                    uploads={uploads}
                    inbounds={inbounds}
                    onDone={(count) => {
                      setInboundPendingUpload(null);
                      setInboundResult({ count, fileName: inboundPendingUpload.fileName });
                      void fetch("/api/import?pipeline=true", { method: "POST" });
                      void loadData();
                    }}
                  />
                )}
                {/* Excel 导入完成横幅 */}
                {inboundResult && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 dark:border-emerald-800/40 dark:bg-emerald-950/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">导入成功</span>
                      <span className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                        {inboundResult.fileName}，共导入 <strong>{inboundResult.count}</strong> 条记录
                      </span>
                    </div>
                    <button className="text-xs text-emerald-600 hover:underline shrink-0" onClick={() => setInboundResult(null)}>关闭</button>
                  </div>
                )}
                <InboundOcrTable
                  uploadById={uploadById}
                  inbounds={inbounds.filter((r) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return `${r.ticketNo} ${r.plateNo} ${r.driverName} ${r.supplierName}`.toLowerCase().includes(q);
                  })}
                  onView={(r) => { setReviewInbound(r); setReviewInboundOpen(true); }}
                  onDelete={async (id) => {
                    await fetch(`/api/import/inbound?id=${id}`, { method: "DELETE" });
                    await loadData();
                  }}
                  onBulkDelete={async (ids) => {
                    await Promise.all(ids.map((id) => fetch(`/api/import/inbound?id=${id}`, { method: "DELETE" })));
                    await loadData();
                  }}
                />
              </TabsContent>

              {/* AI核对 Tab（原独立核对页内容） */}
              <TabsContent value="passed" className="m-0 p-0">
                <AiReviewPanel
                  embedded
                  highlightTicketNo={highlightTicketNo}
                  highlightMatchId={highlightMatchId}
                  initialTodos={todos}
                  initialMeasures={measures}
                  initialInbounds={inbounds}
                  onRefreshParent={refreshForAiReview}
                  onNavigateTab={(tab) => setListTab(tab)}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      </div>

      <MeasureReviewDialog
        ticket={reviewTicket}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSaved={() => void loadData()}
      />
      <InboundReviewDialog
        record={reviewInbound}
        open={reviewInboundOpen}
        onOpenChange={setReviewInboundOpen}
        onSaved={() => void loadData()}
      />
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "warning" | "danger";
}) {
  const valueClass =
    accent === "success"
      ? "text-emerald-600"
      : accent === "warning"
        ? "text-amber-600"
        : accent === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-muted/25 px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums leading-none", valueClass)}>{value}</p>
    </div>
  );
}

function formatDateTime(value?: string): string {
  if (!value?.trim()) return "-";
  const d = new Date(value.replace(/\//g, "-"));
  if (Number.isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DocThumb({
  src,
  label,
  fallback = true,
}: {
  src?: string;
  label: string;
  fallback?: boolean;
}) {
  if (src) {
    return (
      <div className="relative h-8 w-6 shrink-0 overflow-hidden rounded border">
        <img src={normalizeFileUrl(src)} alt={label} className="h-full w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-black/55 text-center text-[7px] leading-tight text-white">
          {label}
        </span>
      </div>
    );
  }
  if (!fallback) return null;
  return (
    <div className="flex h-8 w-6 shrink-0 flex-col items-center justify-center rounded border bg-muted text-[7px] text-muted-foreground">
      <span>{label}</span>
    </div>
  );
}

// ── 计量单识别状态表 ──────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 100 ? "bg-emerald-500" : value >= 90 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={cn(
        "w-9 text-right text-xs tabular-nums font-medium",
        value >= 100 ? "text-emerald-600" : value >= 90 ? "text-amber-600" : "text-red-500"
      )}>
        {value}%
      </span>
    </div>
  );
}

function MeasureOcrTable({
  measures,
  uploadById,
  onView,
  onDelete,
  onBulkDelete,
  onHumanConfirm,
}: {
  measures: MeasureTicket[];
  uploadById: Map<string, UploadedFileRecord>;
  onView: (t: MeasureTicket) => void;
  onDelete?: (id: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  onHumanConfirm?: (id: string) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<MeasureTicket | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const allIds = measures.map((m) => m.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doBulkDelete = async () => {
    if (!onBulkDelete) return;
    setBulkDeleting(true);
    setBulkConfirmOpen(false);
    try {
      await onBulkDelete([...selected]);
      setSelected(new Set());
      toast.success(`已删除 ${selected.size} 条计量单`);
    } catch {
      toast.error("批量删除失败");
    } finally {
      setBulkDeleting(false);
    }
  };

  const doDelete = async () => {
    if (!confirmTarget || !onDelete) return;
    setDeletingId(confirmTarget.id);
    setConfirmTarget(null);
    try {
      await onDelete(confirmTarget.id);
      toast.success("计量单已删除");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  // 低置信度：仅 ocrStatus=待审核 且 confidence 在 0-85 之间（AI已通过的不再标红）
  const LOW_CONF_THRESHOLD = 95;
  const needsConfirm = (m: MeasureTicket) =>
    m.ocrStatus === "待审核" && m.confidence > 0 && m.confidence < LOW_CONF_THRESHOLD;

  // 已人工确认
  const isManualConfirmed = (m: MeasureTicket) =>
    m.reviewSource === "manual" && m.ocrStatus === "已审核";

  const statusBadge = (m: MeasureTicket, low: boolean) => {
    if (isManualConfirmed(m))
      return <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/12 text-emerald-700 border border-emerald-200 dark:border-emerald-800">人工确认</Badge>;
    if (m.ocrStatus === "已审核")
      return <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/12 text-emerald-700 border border-emerald-200 dark:border-emerald-800">AI识别</Badge>;
    if (m.ocrStatus === "待审核" && low)
      return <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/12 text-amber-700 border border-amber-200 dark:border-amber-800">待人工确认</Badge>;
    if (m.ocrStatus === "待审核")
      return <Badge className="h-5 px-1.5 text-[10px] bg-sky-50 text-sky-700 border border-sky-200 dark:border-sky-800">待审核</Badge>;
    if (m.ocrStatus === "识别失败")
      return <Badge className="h-5 px-1.5 text-[10px] bg-red-50 text-red-600 border border-red-200">识别失败</Badge>;
    if (m.ocrStatus === "识别中")
      return <Badge variant="secondary" className="h-5 px-1.5 text-[10px] animate-pulse">识别中…</Badge>;
    return <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{m.ocrStatus}</Badge>;
  };

  const lowCount = measures.filter(needsConfirm).length;

  if (measures.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        暂无上传的计量单
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {lowCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">{lowCount} 张</span>计量单置信度低于 85%，建议人工对照原件确认
          </p>
        </div>
      )}
      {/* 批量操作工具栏 */}
      {someSelected && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">已选 <strong className="text-foreground">{selected.size}</strong> 条</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1 px-2.5 text-xs ml-1"
            disabled={bulkDeleting}
            onClick={() => setBulkConfirmOpen(true)}
          >
            {bulkDeleting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            批量删除
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50 h-9 border-b">
              <TableHead className="h-9 w-9 pl-3">
                <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary" checked={allSelected} onChange={toggleAll} />
              </TableHead>
              <TableHead className="h-9 pl-2 text-[11px] font-semibold text-muted-foreground w-[200px]">单据号</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[96px]">车牌</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[72px]">司机</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[140px]">供应商</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[120px]">识别状态</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[130px] text-right pr-4">置信度</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[88px]">识别耗时</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[110px]">上传时间</TableHead>
              <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[160px] text-right pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {measures.map((m, idx) => {
              const low = needsConfirm(m);
              const manualDone = isManualConfirmed(m);
              const processing = m.ocrStatus === "识别中" || m.ocrStatus === "待识别";
              const upload = uploadById.get(m.uploadId);
              return (
                <TableRow
                  key={m.id}
                  className={cn(
                    "group transition-colors",
                    selected.has(m.id) && "!bg-primary/5",
                    processing
                      ? "bg-blue-50/40 dark:bg-blue-950/10 animate-pulse"
                      : manualDone
                        ? "bg-emerald-50/50 hover:bg-emerald-50/80 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20"
                        : m.ocrStatus === "待审核"
                          ? "bg-sky-50/40 hover:bg-sky-50/70 dark:bg-sky-950/10 dark:hover:bg-sky-950/20"
                          : low
                            ? "bg-amber-50/40 hover:bg-amber-50/80 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                            : idx % 2 === 0 ? "bg-white hover:bg-muted/30 dark:bg-transparent" : "bg-muted/20 hover:bg-muted/40"
                  )}
                >
                  <TableCell className="py-2 pl-3 w-9">
                    <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} />
                  </TableCell>
                  <TableCell className="py-2 pl-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!processing && manualDone && (
                        <div className="w-0.5 h-8 shrink-0 rounded-full bg-emerald-400" />
                      )}
                      {!processing && !manualDone && m.ocrStatus === "待审核" && (
                        <div className="w-0.5 h-8 shrink-0 rounded-full bg-sky-400" />
                      )}
                      {!processing && !manualDone && m.ocrStatus !== "待审核" && low && (
                        <div className="w-0.5 h-8 shrink-0 rounded-full bg-amber-400" />
                      )}
                      {processing && (
                        <div className="w-0.5 h-8 shrink-0 rounded-full bg-blue-400" />
                      )}
                      {m.imagePath ? (
                        <img
                          src={normalizeFileUrl(m.imagePath)}
                          alt=""
                          className="h-8 w-6 shrink-0 rounded border object-cover"
                        />
                      ) : (
                        <div className="h-8 w-6 shrink-0 rounded border bg-muted flex items-center justify-center text-[7px] text-muted-foreground">计量</div>
                      )}
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-medium truncate block">
                          {m.ticketNo || "(识别中…)"}
                        </span>
                        {processing && (
                          <span className="flex items-center gap-1 text-[10px] text-blue-500">
                            <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                            AI 识别中，请稍候
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    {processing
                      ? <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                      : <span className="font-mono text-[11px] text-foreground/80">{m.plateNo || "-"}</span>
                    }
                  </TableCell>
                  <TableCell className="py-2 text-xs text-foreground/80">
                    {processing ? <div className="h-3 w-10 rounded bg-muted animate-pulse" /> : (m.driverName || "-")}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-foreground/80 truncate max-w-[150px]">
                    {processing ? <div className="h-3 w-24 rounded bg-muted animate-pulse" /> : (m.supplierName || "-")}
                  </TableCell>
                  <TableCell className="py-2">{statusBadge(m, low)}</TableCell>
                  <TableCell className="py-2 pr-4">
                    {processing
                      ? <div className="flex items-center justify-end gap-1.5 pr-1"><div className="h-1.5 w-16 rounded-full bg-blue-200 overflow-hidden"><div className="h-full w-1/2 rounded-full bg-blue-400 animate-pulse" /></div><span className="text-xs text-blue-400">—</span></div>
                      : m.confidence ? <ConfidenceBar value={m.confidence} /> : <span className="text-xs text-muted-foreground text-right block pr-1">-</span>
                    }
                  </TableCell>
                  <TableCell className="py-2">
                    <RecognizeDurationCell measure={m} upload={upload} processing={processing} />
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(m.createdAt) || "-"}
                  </TableCell>
                  <TableCell className="py-2 pr-4">
                    <div className="flex items-center justify-end gap-1">
                      {/* 待审核：显示"待人工确认"，点击打开弹窗，弹窗里确认后才变状态 */}
                      {!processing && m.ocrStatus === "待审核" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 hover:border-sky-400 dark:border-sky-700 dark:text-sky-400"
                          onClick={() => onView(m)}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          待人工确认
                        </Button>
                      )}
                      {/* 低置信度且未人工确认：显示橙色"确认"按钮 */}
                      {!processing && m.ocrStatus !== "待审核" && low && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirmingId === m.id}
                          className="h-7 gap-1 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:text-amber-400 disabled:opacity-60"
                          onClick={async () => {
                            if (!onHumanConfirm) return;
                            setConfirmingId(m.id);
                            try {
                              await onHumanConfirm(m.id);
                            } finally {
                              setConfirmingId(null);
                            }
                          }}
                        >
                          {confirmingId === m.id
                            ? <RefreshCw className="h-3 w-3 animate-spin" />
                            : <AlertTriangle className="h-3 w-3" />
                          }
                          确认
                        </Button>
                      )}
                      {/* 非待审核 && 非处理中：显示查看 */}
                      {!processing && m.ocrStatus !== "待审核" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => onView(m)}
                        >
                          <Eye className="h-3 w-3" />
                          查看
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          disabled={deletingId === m.id}
                          onClick={() => setConfirmTarget(m)}
                        >
                          {deletingId === m.id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
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

      {/* 单条删除确认 */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(o) => { if (!o) setConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />确认删除计量单
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">即将删除计量单：</span>
              <span className="block font-mono font-semibold text-foreground">{confirmTarget?.ticketNo || confirmTarget?.id}</span>
              <span className="block text-destructive/80">此操作不可恢复，相关的匹配记录也将一并删除。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认 */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />批量删除计量单
            </AlertDialogTitle>
            <AlertDialogDescription>
              即将删除已选的 <strong>{selected.size}</strong> 条计量单，相关匹配记录一并删除。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doBulkDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── 采购单识别状态表 ──────────────────────────────────────────────────────────
function InboundOcrTable({
  inbounds,
  uploadById,
  onView,
  onDelete,
  onBulkDelete,
}: {
  inbounds: InboundRecord[];
  uploadById: Map<string, UploadedFileRecord>;
  onView: (r: InboundRecord) => void;
  onDelete?: (id: string) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InboundRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const allIds = inbounds.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;
  const toggleAll = () => { if (allSelected) setSelected(new Set()); else setSelected(new Set(allIds)); };
  const toggleOne = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const doDelete = async () => {
    if (!deleteTarget || !onDelete) return;
    setDeletingId(deleteTarget.id);
    setDeleteTarget(null);
    try {
      await onDelete(deleteTarget.id);
      toast.success("采购单已删除");
    } catch {
      toast.error("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const doBulkDelete = async () => {
    if (!onBulkDelete) return;
    setBulkDeleting(true);
    setBulkConfirmOpen(false);
    try {
      await onBulkDelete([...selected]);
      setSelected(new Set());
      toast.success(`已删除 ${selected.size} 条采购单`);
    } catch {
      toast.error("批量删除失败");
    } finally {
      setBulkDeleting(false);
    }
  };

  // 低置信度：仅 reviewStatus=待审核 且 ocrConfidence 在 0-95 之间（AI已通过的不再标红）
  const INBOUND_LOW_CONF = 95;
  const needsConfirm = (r: InboundRecord) =>
    r.reviewStatus === "待审核" && (r.ocrConfidence ?? 0) > 0 && (r.ocrConfidence ?? 0) < INBOUND_LOW_CONF;

  const isManualConfirmed = (r: InboundRecord) =>
    r.reviewSource === "manual" && r.reviewStatus === "已审核";

  const statusBadge = (r: InboundRecord) => {
    if (isManualConfirmed(r))
      return <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/12 text-emerald-700 border border-emerald-200 dark:border-emerald-800">人工确认</Badge>;
    if (r.reviewStatus === "已审核")
      return <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/12 text-emerald-700 border border-emerald-200 dark:border-emerald-800">AI识别</Badge>;
    if (needsConfirm(r))
      return <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/12 text-amber-700 border border-amber-200 dark:border-amber-800">待人工确认</Badge>;
    return <Badge className="h-5 px-1.5 text-[10px] bg-sky-50 text-sky-700 border border-sky-200 dark:border-sky-800">待审核</Badge>;
  };

  if (inbounds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        暂无上传的采购单
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 批量操作工具栏 */}
      {someSelected && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs text-muted-foreground">已选 <strong className="text-foreground">{selected.size}</strong> 条</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 gap-1 px-2.5 text-xs ml-1"
            disabled={bulkDeleting}
            onClick={() => setBulkConfirmOpen(true)}
          >
            {bulkDeleting ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            批量删除
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setSelected(new Set())}>取消选择</Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border shadow-sm">
      <Table className="min-w-[900px]">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50 h-9 border-b">
            <TableHead className="h-9 w-9 pl-3">
              <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary" checked={allSelected} onChange={toggleAll} />
            </TableHead>
            <TableHead className="h-9 pl-2 text-[11px] font-semibold text-muted-foreground w-[200px]">单据号</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[96px]">车牌</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[72px]">司机</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[140px]">供应商</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[108px]">识别状态</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[88px]">识别耗时</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[110px]">上传时间</TableHead>
            <TableHead className="h-9 text-[11px] font-semibold text-muted-foreground w-[160px] text-right pr-4">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inbounds.map((r, idx) => {
            const low = needsConfirm(r);
            const manualDone = isManualConfirmed(r);
            const isPending = r.reviewStatus === "待审核";
            const upload = uploadById.get(r.uploadId);
            return (
              <TableRow
                key={r.id}
                className={cn(
                  "group transition-colors",
                  selected.has(r.id) && "!bg-primary/5",
                  manualDone
                    ? "bg-emerald-50/50 hover:bg-emerald-50/80 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20"
                    : isPending
                      ? "bg-sky-50/40 hover:bg-sky-50/70 dark:bg-sky-950/10 dark:hover:bg-sky-950/20"
                      : low
                        ? "bg-amber-50/40 hover:bg-amber-50/80 dark:bg-amber-950/10 dark:hover:bg-amber-950/20"
                        : idx % 2 === 0 ? "bg-white hover:bg-muted/30 dark:bg-transparent" : "bg-muted/20 hover:bg-muted/40"
                )}
              >
                <TableCell className="py-2 pl-3 w-9">
                  <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                </TableCell>
                <TableCell className="py-2 pl-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {manualDone && <div className="w-0.5 h-8 shrink-0 rounded-full bg-emerald-400" />}
                    {!manualDone && isPending && <div className="w-0.5 h-8 shrink-0 rounded-full bg-sky-400" />}
                    {!manualDone && !isPending && low && <div className="w-0.5 h-8 shrink-0 rounded-full bg-amber-400" />}
                    {r.sourceFile && /\.(jpe?g|png|webp)(\?|$)/i.test(r.sourceFile) ? (
                      <img
                        src={normalizeFileUrl(r.sourceFile)}
                        alt=""
                        className="h-8 w-6 shrink-0 rounded border object-cover cursor-pointer hover:opacity-80"
                        onClick={(e) => { e.stopPropagation(); onView(r); }}
                      />
                    ) : (
                      <div className="h-8 w-6 shrink-0 rounded border bg-muted flex items-center justify-center text-[7px] text-muted-foreground">采购</div>
                    )}
                    <span className="font-mono text-xs font-medium truncate block">{r.ticketNo || "(无单号)"}</span>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  <span className="font-mono text-[11px] text-foreground/80">{r.plateNo || "-"}</span>
                </TableCell>
                <TableCell className="py-2 text-xs text-foreground/80">{r.driverName || "-"}</TableCell>
                <TableCell className="py-2 text-xs text-foreground/80 truncate max-w-[140px]">{r.supplierName || "-"}</TableCell>
                <TableCell className="py-2">{statusBadge(r)}</TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(r.createdAt) || "-"}
                </TableCell>
                <TableCell className="py-2">
                  <RecognizeDurationCell
                    upload={upload}
                    processing={upload?.status === "处理中"}
                  />
                </TableCell>
                <TableCell className="py-2 pr-4">
                  <div className="flex items-center justify-end gap-1">
                    {/* 待审核：点击打开弹窗，弹窗里确认后才变状态 */}
                    {isPending && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs border-sky-300 text-sky-700 hover:bg-sky-50 hover:border-sky-400 dark:border-sky-700 dark:text-sky-400"
                        onClick={() => onView(r)}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        待人工确认
                      </Button>
                    )}
                    {/* 低置信度且未人工确认 */}
                    {!isPending && low && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 hover:border-amber-400 dark:border-amber-700 dark:text-amber-400"
                        onClick={() => onView(r)}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        确认
                      </Button>
                    )}
                    {/* 非待审核：显示查看 */}
                    {!isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => onView(r)}
                      >
                        <Eye className="h-3 w-3" />
                        查看
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === r.id}
                        onClick={() => setDeleteTarget(r)}
                      >
                        {deletingId === r.id
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
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

      {/* 单条删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />确认删除采购单
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-1">
              <span className="block">即将删除采购单：</span>
              <span className="block font-mono font-semibold text-foreground">{deleteTarget?.ticketNo || deleteTarget?.id}</span>
              <span className="block text-destructive/80">此操作不可恢复，相关的匹配记录也将一并删除。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量删除确认 */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />批量删除采购单
            </AlertDialogTitle>
            <AlertDialogDescription>
              即将删除已选的 <strong>{selected.size}</strong> 条采购单，相关匹配记录一并删除。此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void doBulkDelete()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── 采购单截图识别进度横幅 ────────────────────────────────────────────────────
function InboundImageProgress({
  uploadId,
  fileName,
  uploads,
  inbounds,
  onDone,
}: {
  uploadId: string;
  fileName: string;
  uploads: UploadedFileRecord[];
  inbounds: InboundRecord[];
  onDone: (count: number) => void;
}) {
  const upload = uploads.find((u) => u.id === uploadId);
  const status = upload?.status ?? "处理中";
  const progress = upload?.progress ?? 0;
  const isDone = status === "完成" || status === "成功" || status === "已完成";
  const isFailed = status === "失败" || status === "错误";
  const percent = isDone
    ? 100
    : Math.min(99, Math.max(progress, progress > 0 ? progress : 8));
  const barWidth = `${percent}%`;

  // 完成后通知父组件
  useEffect(() => {
    if (isDone) {
      const count = inbounds.filter((r) => r.uploadId === uploadId).length;
      const t = setTimeout(() => onDone(count), 800);
      return () => clearTimeout(t);
    }
  }, [isDone, uploadId, inbounds, onDone]);

  if (isFailed) {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-sm font-medium text-red-700">识别失败</span>
          <span className="text-xs text-red-600/80">{upload?.errorMessage ?? "请重新上传"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "mb-3 rounded-lg border px-4 py-3 transition-colors",
      isDone
        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20"
        : "border-blue-200 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20"
    )}>
      {/* 标题行 */}
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {isDone
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
          }
          <span className={cn("text-sm font-medium", isDone ? "text-emerald-800 dark:text-emerald-300" : "text-blue-800 dark:text-blue-300")}>
            {isDone ? "识别完成" : `AI 正在识别采购单… ${percent}%`}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className={cn("text-xs font-semibold tabular-nums", isDone ? "text-emerald-600" : "text-blue-600 dark:text-blue-400")}>
            {percent}%
          </span>
          <span className="max-w-[180px] truncate text-[10px] text-muted-foreground" title={fileName}>
            {fileName}
          </span>
        </div>
      </div>
      {/* 进度条 */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className={cn("h-1.5 flex-1 overflow-hidden rounded-full", isDone ? "bg-emerald-100" : "bg-blue-100 dark:bg-blue-900/40")}>
          <div
            className={cn("h-full rounded-full transition-all duration-700", isDone ? "bg-emerald-500" : "bg-blue-500")}
            style={{ width: barWidth }}
          />
        </div>
        <span className={cn("w-9 shrink-0 text-right text-xs font-medium tabular-nums", isDone ? "text-emerald-600" : "text-blue-600 dark:text-blue-400")}>
          {percent}%
        </span>
      </div>
      {/* 三格统计 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-center">
          <p className="text-xl font-bold tabular-nums">1</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">本次选择</p>
        </div>
        <div className={cn("rounded-md px-3 py-2 text-center", isDone ? "border border-border/60 bg-background/70" : "border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30")}>
          <p className={cn("text-xl font-bold tabular-nums", isDone ? "text-muted-foreground" : "text-blue-600 dark:text-blue-400")}>
            {isDone ? 0 : 1}
          </p>
          <p className={cn("mt-0.5 text-[11px] flex items-center justify-center gap-1", isDone ? "text-muted-foreground" : "text-blue-600/70")}>
            识别中
            {!isDone && (
              <>
                <span className="tabular-nums">({percent}%)</span>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              </>
            )}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-center">
          <p className="text-xl font-bold tabular-nums text-muted-foreground">0</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">等待识别</p>
        </div>
      </div>
    </div>
  );
}

// ── 识别进度栏 ────────────────────────────────────────────────────────────────
function OcrProgressBar({
  measures,
  batchTotal,
  batchUploadIds,
  onDone,
}: {
  measures: MeasureTicket[];
  batchTotal: number;
  batchUploadIds: string[];
  onDone: () => void;
}) {
  const batchSet = new Set(batchUploadIds);
  const batchMeasures = batchUploadIds.length > 0
    ? measures.filter((m) => batchSet.has(m.uploadId))
    : [];

  const inStore = batchMeasures.length;
  const recognizing = batchMeasures.filter((m) => m.ocrStatus === "识别中").length;
  const waitingInStore = batchMeasures.filter((m) => m.ocrStatus === "待识别").length;
  const notYetInStore = Math.max(0, batchTotal - inStore);
  const waiting = waitingInStore + notYetInStore;
  const done = batchMeasures.filter(
    (m) => m.ocrStatus === "已审核" || m.ocrStatus === "识别失败" || m.ocrStatus === "待审核"
  ).length;

  const active = recognizing + waiting;
  const allDone = active === 0 && batchTotal > 0;

  useEffect(() => {
    if (allDone) {
      const t = setTimeout(onDone, 2500);
      return () => clearTimeout(t);
    }
  }, [allDone, onDone]);

  if (batchTotal === 0) return null;

  const donePercent = batchTotal > 0 ? Math.round((done / batchTotal) * 100) : 0;

  return (
    <div className={cn(
      "rounded-lg border px-4 py-3 transition-colors",
      allDone
        ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/20"
        : "border-blue-200 bg-blue-50/60 dark:border-blue-800/40 dark:bg-blue-950/20"
    )}>
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {allDone
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            : <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
          }
          <span className={cn(
            "text-sm font-medium",
            allDone ? "text-emerald-800 dark:text-emerald-300" : "text-blue-800 dark:text-blue-300"
          )}>
            {allDone ? "识别完成" : "AI 正在识别中"}
          </span>
        </div>
        <span className={cn(
          "text-xs tabular-nums",
          allDone ? "text-emerald-600" : "text-blue-600 dark:text-blue-400"
        )}>
          {done} / {batchTotal} 张完成
        </span>
      </div>

      <div className={cn(
        "mb-3 h-1.5 w-full overflow-hidden rounded-full",
        allDone ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-blue-100 dark:bg-blue-900/40"
      )}>
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            allDone ? "bg-emerald-500" : "bg-blue-500"
          )}
          style={{ width: `${donePercent}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-center">
          <p className="text-xl font-bold tabular-nums">{batchTotal}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">本次选择</p>
        </div>
        <div className={cn(
          "rounded-md px-3 py-2 text-center",
          recognizing > 0
            ? "border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30"
            : "border border-border/60 bg-background/70"
        )}>
          <p className={cn(
            "text-xl font-bold tabular-nums",
            recognizing > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
          )}>
            {recognizing}
          </p>
          <p className={cn(
            "mt-0.5 text-[11px] flex items-center justify-center gap-1",
            recognizing > 0 ? "text-blue-600/70" : "text-muted-foreground"
          )}>
            识别中
            {recognizing > 0 && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />}
          </p>
        </div>
        <div className={cn(
          "rounded-md px-3 py-2 text-center",
          waiting > 0
            ? "border border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
            : "border border-border/60 bg-background/70"
        )}>
          <p className={cn(
            "text-xl font-bold tabular-nums",
            waiting > 0 ? "text-amber-600" : "text-muted-foreground"
          )}>
            {waiting}
          </p>
          <p className={cn(
            "mt-0.5 text-[11px]",
            waiting > 0 ? "text-amber-600/70" : "text-muted-foreground"
          )}>
            等待识别
          </p>
        </div>
      </div>
    </div>
  );
}

// ── 已驳回列表 ────────────────────────────────────────────────────────────────
function DocRejectedSection({ rows }: { rows: DocRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        暂无已驳回单据
      </div>
    );
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <h3 className="text-xs font-semibold">已驳回（{rows.length}）</h3>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 h-8">
              <TableHead className="h-8 text-[11px] w-[180px]">单据号</TableHead>
              <TableHead className="h-8 text-[11px] w-[80px]">类型</TableHead>
              <TableHead className="h-8 text-[11px] w-[96px]">车牌</TableHead>
              <TableHead className="h-8 text-[11px] w-[72px]">司机</TableHead>
              <TableHead className="h-8 text-[11px]">状态说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="h-10">
                <TableCell className="py-1.5">
                  <span className="font-mono text-xs font-medium">{row.ticketNo}</span>
                </TableCell>
                <TableCell className="py-1.5">
                  {row.kind === "measure" ? (
                    <Badge variant="secondary" className="h-5 text-[10px] px-1">计量单</Badge>
                  ) : (
                    <Badge variant="outline" className="h-5 text-[10px] px-1">采购单</Badge>
                  )}
                </TableCell>
                <TableCell className="py-1.5">
                  <span className="font-mono text-[11px]">{row.plateNo || "-"}</span>
                </TableCell>
                <TableCell className="py-1.5 text-xs">{row.driverName || "-"}</TableCell>
                <TableCell className="py-1.5 text-xs text-destructive">{row.statusText}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
