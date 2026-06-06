"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Header } from "@/components/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  Eye,
  RefreshCw,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import {
  collectFilesFromDataTransfer,
  MEASURE_UPLOAD_MAX,
  pickMeasureImageFiles,
} from "@/lib/import/measure-upload-files";
import { getInboundFileKind, isInboundFileSupported } from "@/lib/import/inbound-file";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
  UploadedFileRecord,
} from "@/lib/types";
import {
  getMeasureReconcileState,
  type MeasureReconcileState,
} from "@/lib/import/measure-reconcile-state";
import { MeasureReviewDialog } from "@/components/measure-review-dialog";
import {
  MeasureTableConfidence,
  MeasureTableRowActions,
  measureStickyActionCell,
  measureStickyActionHead,
  measureStickyConfidenceCell,
  measureStickyConfidenceHead,
} from "@/components/measure-table-sticky-actions";
import { InboundReviewDialog } from "@/components/inbound-review-dialog";
import {
  countGroupedItems,
  filterGroupsByDate,
  formatInboundRecordDate,
  formatRecordDate,
  getUploadDateKey,
  groupInboundRecordsByDate,
  groupMeasureTicketsByDate,
  groupUploadsByDate,
  normalizeDateSearchQuery,
} from "@/lib/import/upload-date-group";
import { Progress } from "@/components/ui/progress";
import { ListPaginationBar } from "@/components/list-pagination-bar";
import {
  DEFAULT_PAGE_SIZE,
  paginateDateGroups,
  type ListPageSize,
} from "@/lib/import/list-pagination";
import {
  formatInboundBasePrice,
  formatInboundDeductWeight,
  formatInboundDryWeight,
  formatInboundSettlementWeight,
} from "@/lib/import/inbound-display";
import { formatWeighTime, formatWeightKg } from "@/lib/import/list-display";
import {
  buildDuplicateTicketNoSet,
  normalizeTicketNo,
} from "@/lib/import/ticket-uniqueness";
import { cn } from "@/lib/utils";
import {
  DeleteConfirmDialog,
  type DeleteConfirmKind,
} from "@/components/delete-confirm-dialog";

export type ImportPanelProps = {
  embedded?: boolean;
  /** 仅展示上传记录/计量/采购列表（单据中心「上传记录」展开用） */
  recordsOnly?: boolean;
  /** 上传识别并完成 pipeline 后自动触发（业务页内为 AI 批量核对 + 跳转结果） */
  onAutoAiVerify?: () => Promise<void>;
};

export function ImportPanel({
  embedded = false,
  recordsOnly = false,
  onAutoAiVerify,
}: ImportPanelProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileRecord[]>([]);
  const [measureTickets, setMeasureTickets] = useState<MeasureTicket[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [ticketMatches, setTicketMatches] = useState<TicketMatch[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetail[]>([]);
  const [verifyingMeasureId, setVerifyingMeasureId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [listPageSize, setListPageSize] = useState<ListPageSize>(DEFAULT_PAGE_SIZE);
  const [filesPage, setFilesPage] = useState(1);
  const [measurePage, setMeasurePage] = useState(1);
  const [inboundPage, setInboundPage] = useState(1);
  const [recordsTab, setRecordsTab] = useState("files");
  const [dateSearch, setDateSearch] = useState("");
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const [ocrProvider, setOcrProvider] = useState<"volcengine" | "tesseract">("tesseract");
  const [isDraggingMeasure, setIsDraggingMeasure] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [reviewTicket, setReviewTicket] = useState<MeasureTicket | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewInbound, setReviewInbound] = useState<InboundRecord | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: DeleteConfirmKind;
    ticket?: MeasureTicket;
    record?: InboundRecord;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reviewInboundBatch, setReviewInboundBatch] = useState<InboundRecord[]>([]);
  const [reviewInboundOpen, setReviewInboundOpen] = useState(false);

  const measureInputRef = useRef<HTMLInputElement>(null);
  const inboundInputRef = useRef<HTMLInputElement>(null);
  const recordsSectionRef = useRef<HTMLDivElement>(null);
  const pendingMeasureUploadIdsRef = useRef<string[]>([]);
  const pendingInboundUploadIdRef = useRef<string | null>(null);
  const measureBatchFinalizedRef = useRef(false);
  const inboundBatchFinalizedRef = useRef(false);
  const measureSkippedNoteRef = useRef("");
  const pipelineOnLoadRanRef = useRef(false);

  const focusRecordsSection = useCallback(() => {
    setRecordsTab("files");
    requestAnimationFrame(() => {
      recordsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const hasProcessingUploads = uploadedFiles.some((f) => f.status === "处理中");
  const uploadGroups = useMemo(
    () => groupUploadsByDate(uploadedFiles),
    [uploadedFiles]
  );
  const measureGroups = useMemo(
    () => groupMeasureTicketsByDate(measureTickets),
    [measureTickets]
  );
  const inboundGroups = useMemo(
    () => groupInboundRecordsByDate(inboundRecords),
    [inboundRecords]
  );

  const dateSearchKey = useMemo(
    () => normalizeDateSearchQuery(dateSearch),
    [dateSearch]
  );
  const dateSearchInvalid = dateSearch.trim() !== "" && dateSearchKey === null;

  const filteredUploadGroups = useMemo(
    () => filterGroupsByDate(uploadGroups, dateSearchKey),
    [uploadGroups, dateSearchKey]
  );
  const filteredMeasureGroups = useMemo(
    () => filterGroupsByDate(measureGroups, dateSearchKey),
    [measureGroups, dateSearchKey]
  );
  const filteredInboundGroups = useMemo(
    () => filterGroupsByDate(inboundGroups, dateSearchKey),
    [inboundGroups, dateSearchKey]
  );

  const filteredUploadCount = countGroupedItems(filteredUploadGroups);
  const filteredMeasureCount = countGroupedItems(filteredMeasureGroups);
  const filteredInboundCount = countGroupedItems(filteredInboundGroups);

  const pagedUpload = useMemo(
    () => paginateDateGroups(filteredUploadGroups, filesPage, listPageSize),
    [filteredUploadGroups, filesPage, listPageSize]
  );
  const pagedMeasure = useMemo(
    () => paginateDateGroups(filteredMeasureGroups, measurePage, listPageSize),
    [filteredMeasureGroups, measurePage, listPageSize]
  );
  const pagedInbound = useMemo(
    () => paginateDateGroups(filteredInboundGroups, inboundPage, listPageSize),
    [filteredInboundGroups, inboundPage, listPageSize]
  );

  const inboundById = useMemo(
    () => new Map(inboundRecords.map((r) => [r.id, r])),
    [inboundRecords]
  );

  const reconcileByMeasureId = useMemo(() => {
    const map = new Map<string, MeasureReconcileState>();
    for (const ticket of measureTickets) {
      map.set(
        ticket.id,
        getMeasureReconcileState(
          ticket,
          ticketMatches,
          paymentDetails,
          inboundById
        )
      );
    }
    return map;
  }, [measureTickets, ticketMatches, paymentDetails, inboundById]);

  useEffect(() => {
    setFilesPage(1);
    setMeasurePage(1);
    setInboundPage(1);
  }, [dateSearchKey, listPageSize]);

  useEffect(() => {
    if (filesPage > pagedUpload.totalPages) {
      setFilesPage(pagedUpload.totalPages);
    }
  }, [filesPage, pagedUpload.totalPages]);

  useEffect(() => {
    if (measurePage > pagedMeasure.totalPages) {
      setMeasurePage(pagedMeasure.totalPages);
    }
  }, [measurePage, pagedMeasure.totalPages]);

  useEffect(() => {
    if (inboundPage > pagedInbound.totalPages) {
      setInboundPage(pagedInbound.totalPages);
    }
  }, [inboundPage, pagedInbound.totalPages]);

  const handleListPageSizeChange = (size: ListPageSize) => {
    setListPageSize(size);
    setFilesPage(1);
    setMeasurePage(1);
    setInboundPage(1);
  };

  const loadData = useCallback(async () => {
    try {
      const response = await fetch("/api/import");
      if (!response.ok) throw new Error("加载数据失败");
      const data = await response.json();
      setUploadedFiles(data.uploads ?? []);
      setMeasureTickets(data.measureTickets ?? []);
      setInboundRecords(data.inboundRecords ?? []);
      setTicketMatches(data.ticketMatches ?? []);
      setPaymentDetails(data.paymentDetails ?? []);
      setOcrProvider(data.ocrProvider === "volcengine" ? "volcengine" : "tesseract");
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "加载数据失败",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOneClickVerify = useCallback(
    async (ticket: MeasureTicket) => {
      setVerifyingMeasureId(ticket.id);
      try {
        const res = await fetch("/api/import?verifyMeasure=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ measureId: ticket.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({
            type: "error",
            text: data.error || `${ticket.ticketNo} 核对失败`,
          });
          return;
        }
        setMeasureTickets(data.measureTickets ?? []);
        setInboundRecords(data.inboundRecords ?? []);
        setTicketMatches(data.ticketMatches ?? []);
        setPaymentDetails(data.paymentDetails ?? []);
        const billed = data.paymentCreated ? "，已出账" : "";
        setMessage({
          type: "success",
          text: `${ticket.ticketNo} 已核对通过${billed}`,
        });
        if (onAutoAiVerify) {
          await onAutoAiVerify();
        }
      } catch {
        setMessage({ type: "error", text: "一键核对请求失败" });
      } finally {
        setVerifyingMeasureId(null);
      }
    },
    [onAutoAiVerify]
  );

  const formatPipelineNote = (p: {
    measureApproved?: number;
    inboundApproved?: number;
    autoConfirmed?: number;
    paymentsCreated?: number;
  }) => {
    const parts: string[] = [];
    if ((p.measureApproved ?? 0) > 0 || (p.inboundApproved ?? 0) > 0) {
      parts.push(
        `AI 审核 计量${p.measureApproved ?? 0}/入库${p.inboundApproved ?? 0}`
      );
    }
    if ((p.autoConfirmed ?? 0) > 0) {
      parts.push(`自动确认 ${p.autoConfirmed} 条`);
    }
    if ((p.paymentsCreated ?? 0) > 0) {
      parts.push(`生成付款 ${p.paymentsCreated} 条`);
    }
    return parts.length > 0 ? `；${parts.join("，")}` : "";
  };

  const runAiPipeline = useCallback(async () => {
    try {
      const response = await fetch("/api/import?pipeline=true", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return null;
      await loadData();
      return data.pipeline as {
        measureApproved?: number;
        inboundApproved?: number;
        autoConfirmed?: number;
        paymentsCreated?: number;
      } | null;
    } catch {
      return null;
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (loading || pipelineOnLoadRanRef.current) return;
    const pending =
      measureTickets.filter((t) => t.ocrStatus === "待审核").length +
      inboundRecords.filter((r) => r.reviewStatus === "待审核").length;
    if (pending === 0) return;

    pipelineOnLoadRanRef.current = true;
    void runAiPipeline();
  }, [loading, measureTickets, inboundRecords, runAiPipeline]);

  useEffect(() => {
    if (!hasProcessingUploads) {
      setAutoRefreshing(false);
      return;
    }
    setAutoRefreshing(true);
    const timer = window.setInterval(() => {
      void loadData();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [hasProcessingUploads, loadData]);

  const uploadMeasureFiles = async (files: FileList | File[]) => {
    const picked = pickMeasureImageFiles(files);
    const { images } = picked;

    if (images.length === 0) {
      setMessage({
        type: "error",
        text: "未找到可用的计量单图片（支持 JPG、PNG、JPEG、WEBP）",
      });
      return;
    }

    focusRecordsSection();
    measureBatchFinalizedRef.current = false;
    setUploading(true);

    let skippedNote = "";
    if (picked.skipped > 0) {
      skippedNote += `，已忽略 ${picked.skipped} 个无效或超限文件`;
    }
    if (picked.total > MEASURE_UPLOAD_MAX) {
      skippedNote += `（最多处理 ${MEASURE_UPLOAD_MAX} 张）`;
    }
    measureSkippedNoteRef.current = skippedNote;

    setMessage({
      type: "success",
      text:
        images.length === 1
          ? "已上传，AI 正在识别…"
          : `已上传 ${images.length} 张，AI 正在识别…${skippedNote}`,
    });

    const formData = new FormData();
    images.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/import/measure?async=true", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "计量单上传失败");
      }

      const uploadIds = (data.uploadIds ?? []) as string[];
      pendingMeasureUploadIdsRef.current = uploadIds;
      await loadData();

      if (uploadIds.length === 0) {
        measureBatchFinalizedRef.current = true;
        setMessage({
          type: "error",
          text: "没有可识别的图片" + skippedNote,
        });
        setUploading(false);
        return;
      }

      if (data.rejected?.length) {
        setMessage({
          type: "success",
          text: `${uploadIds.length} 张已进入识别队列${skippedNote}，${data.rejected.length} 张格式无效已跳过`,
        });
      }
    } catch (error) {
      measureBatchFinalizedRef.current = true;
      pendingMeasureUploadIdsRef.current = [];
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "计量单上传失败",
      });
      setUploading(false);
    }
  };

  const uploadInboundFile = async (file: File) => {
    if (!isInboundFileSupported(file)) {
      setMessage({
        type: "error",
        text: "请上传 Excel 或入库单截图（JPG/PNG/WEBP）",
      });
      return;
    }

    const kind = getInboundFileKind(file);
    focusRecordsSection();
    inboundBatchFinalizedRef.current = false;
    setUploading(true);
    setMessage({
      type: "success",
      text:
        kind === "image"
          ? "已上传，AI 正在识别入库单截图…"
          : "已上传，正在解析入库单 Excel…",
    });

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/import/inbound?async=true", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "入库单上传失败");
      }

      pendingInboundUploadIdRef.current = data.uploadId as string;
      await loadData();
    } catch (error) {
      inboundBatchFinalizedRef.current = true;
      pendingInboundUploadIdRef.current = null;
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "入库单上传失败",
      });
      setUploading(false);
    }
  };

  const handleMeasureDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingMeasure(false);
    if (!e.dataTransfer) return;
    try {
      const collected = await collectFilesFromDataTransfer(e.dataTransfer);
      if (collected.length > 0) {
        await uploadMeasureFiles(collected);
        return;
      }
      const file = e.dataTransfer.files?.[0];
      if (file) await uploadMeasureFiles([file]);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "读取文件失败",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInboundDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void uploadInboundFile(file);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getUploadTypeLabel = (type: UploadedFileRecord["type"]) => {
    switch (type) {
      case "image":
        return "计量单";
      case "inbound-image":
        return "入库单截图";
      case "excel":
        return "入库单";
      default:
        return "未知";
    }
  };

  const handleDeleteUpload = async (id: string) => {
    const response = await fetch(`/api/import?id=${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      setMessage({ type: "error", text: data.error || "删除失败" });
      return;
    }
    await loadData();
  };

  const openDeleteMeasureConfirm = (ticket: MeasureTicket) => {
    setDeleteConfirm({ kind: "measure", ticket });
  };

  const openDeleteInboundConfirm = (record: InboundRecord) => {
    setDeleteConfirm({ kind: "inbound", record });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm || deleting) return;

    setDeleting(true);
    try {
      if (deleteConfirm.kind === "measure" && deleteConfirm.ticket) {
        const ticket = deleteConfirm.ticket;
        const label = ticket.ticketNo || ticket.id;
        const response = await fetch(`/api/import/measure?id=${ticket.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json();
          setMessage({ type: "error", text: data.error || "删除失败" });
          return;
        }
        if (reviewTicket?.id === ticket.id) {
          setReviewOpen(false);
          setReviewTicket(null);
        }
        await loadData();
        setDeleteConfirm(null);
        setMessage({ type: "success", text: `已删除计量单 ${label}` });
        return;
      }

      if (deleteConfirm.kind === "inbound" && deleteConfirm.record) {
        const record = deleteConfirm.record;
        const label = record.ticketNo || record.id;
        const response = await fetch(`/api/import/inbound?id=${record.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json();
          setMessage({ type: "error", text: data.error || "删除失败" });
          return;
        }
        if (reviewInbound?.id === record.id) {
          setReviewInboundOpen(false);
          setReviewInbound(null);
        }
        await loadData();
        setDeleteConfirm(null);
        setMessage({ type: "success", text: `已删除入库单 ${label}` });
      }
    } finally {
      setDeleting(false);
    }
  };

  const deleteDialogLabel =
    deleteConfirm?.kind === "measure"
      ? deleteConfirm.ticket?.ticketNo || deleteConfirm.ticket?.id || ""
      : deleteConfirm?.record?.ticketNo || deleteConfirm?.record?.id || "";

  const deleteDialogSubtitle = (() => {
    if (deleteConfirm?.kind === "measure" && deleteConfirm.ticket) {
      const parts = [
        deleteConfirm.ticket.plateNo,
        deleteConfirm.ticket.supplierName,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    if (deleteConfirm?.kind === "inbound" && deleteConfirm.record) {
      const parts = [
        deleteConfirm.record.plateNo,
        deleteConfirm.record.supplierName,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    return undefined;
  })();

  const handleClearCompleted = async () => {
    const response = await fetch("/api/import?completed=true", { method: "DELETE" });
    if (!response.ok) {
      setMessage({ type: "error", text: "清空失败" });
      return;
    }
    await loadData();
    setMessage({ type: "success", text: "已清空已完成的上传记录" });
  };

  const openReview = (ticket: MeasureTicket) => {
    setReviewTicket(ticket);
    setReviewOpen(true);
  };

  const openInboundReview = (record: InboundRecord, batch?: InboundRecord[]) => {
    const siblings =
      batch ??
      inboundRecords.filter((item) => item.uploadId === record.uploadId);
    setReviewInboundBatch(siblings.length > 0 ? siblings : [record]);
    setReviewInbound(record);
    setReviewInboundOpen(true);
  };

  useEffect(() => {
    const ids = pendingMeasureUploadIdsRef.current;
    if (ids.length === 0 || measureBatchFinalizedRef.current) return;

    const related = uploadedFiles.filter((u) => ids.includes(u.id));
    if (related.length < ids.length) return;

    if (related.some((u) => u.status === "处理中")) return;

    measureBatchFinalizedRef.current = true;
    const tickets = ids
      .map((id) => measureTickets.find((t) => t.uploadId === id))
      .filter(Boolean) as MeasureTicket[];
    const pendingTickets = tickets.filter((t) => t.ocrStatus === "待审核");
    const aiCount = tickets.filter((t) => t.reviewSource === "ai").length;
    const successCount = related.filter((u) => u.status === "已完成").length;
    const skippedNote = measureSkippedNoteRef.current;

    let text =
      ids.length === 1
        ? successCount > 0
          ? pendingTickets.length > 0
            ? "识别完成，请人工复核"
            : aiCount > 0
              ? "识别完成，已自动通过"
              : "识别完成"
          : related[0]?.errorMessage || "识别失败"
        : `完成 ${successCount}/${ids.length} 张${
            pendingTickets.length > 0 ? `，需复核 ${pendingTickets.length} 张` : ""
          }${aiCount > 0 ? `，自动通过 ${aiCount} 张` : ""}`;

    if (skippedNote) {
      text += skippedNote;
    }

    void (async () => {
      if (successCount > 0) {
        const pipeline = await runAiPipeline();
        if (pipeline) {
          text += formatPipelineNote(pipeline);
        }
      }
      setMessage({
        type: successCount > 0 ? "success" : "error",
        text,
      });
      if (successCount > 0 && onAutoAiVerify) {
        await onAutoAiVerify();
      }
      pendingMeasureUploadIdsRef.current = [];
      measureSkippedNoteRef.current = "";
      setUploading(false);
    })();
  }, [uploadedFiles, measureTickets, runAiPipeline, onAutoAiVerify]);

  useEffect(() => {
    const uploadId = pendingInboundUploadIdRef.current;
    if (!uploadId || inboundBatchFinalizedRef.current) return;

    const upload = uploadedFiles.find((u) => u.id === uploadId);
    if (!upload || upload.status === "处理中") return;

    inboundBatchFinalizedRef.current = true;
    const imported = inboundRecords.filter((r) => r.uploadId === uploadId);
    const needsReview = imported.filter((r) => r.reviewStatus === "待审核");
    const aiApproved = imported.filter((r) => r.reviewSource === "ai").length;

    void (async () => {
      if (upload.status === "已完成") {
        const via = upload.type === "inbound-image" ? "截图识别" : "Excel 解析";
        let text = `入库单${via}：共 ${imported.length} 条，AI 自动通过 ${aiApproved} 条${
          needsReview.length > 0
            ? `，需复核 ${needsReview.length} 条（可在列表中逐条复核）`
            : ""
        }${upload.errorMessage ? `；${upload.errorMessage}` : ""}`;
        const pipeline = await runAiPipeline();
        if (pipeline) {
          text += formatPipelineNote(pipeline);
        }
        setMessage({
          type: upload.errorMessage ? "error" : "success",
          text,
        });
        if (!upload.errorMessage && onAutoAiVerify) {
          await onAutoAiVerify();
        }
      } else if (upload.errorMessage) {
        setMessage({ type: "error", text: upload.errorMessage });
      }

      pendingInboundUploadIdRef.current = null;
      setUploading(false);
    })();
  }, [uploadedFiles, inboundRecords, runAiPipeline, onAutoAiVerify]);

  const getInboundRecordsByUpload = (uploadId: string) =>
    inboundRecords.filter((item) => item.uploadId === uploadId);

  const getFirstPendingInboundByUpload = (uploadId: string) =>
    getInboundRecordsByUpload(uploadId).find((item) => item.reviewStatus === "待审核");

  const handleInboundReviewSaved = (
    record: InboundRecord,
    action: "save" | "confirm"
  ) => {
    setInboundRecords((prev) => {
      const updated = prev.map((item) => (item.id === record.id ? record : item));
      if (action === "confirm") {
        const siblings = updated.filter((item) => item.uploadId === record.uploadId);
        setReviewInboundBatch(siblings);
        const next = siblings.find((item) => item.reviewStatus === "待审核");
        if (next) {
          window.setTimeout(() => {
            setReviewInbound(next);
            setReviewInboundOpen(true);
          }, 1600);
        } else {
          setMessage({
            type: "success",
            text: `本批入库单已全部审核完成`,
          });
        }
      }
      return updated;
    });
    setReviewInbound(record);
    setReviewInboundBatch((prev) =>
      prev.map((item) => (item.id === record.id ? record : item))
    );
  };

  const handleReviewSaved = (ticket: MeasureTicket, action: "save" | "confirm") => {
    setMeasureTickets((prev) =>
      prev.map((item) => (item.id === ticket.id ? ticket : item))
    );
    setReviewTicket(ticket);
    if (action === "confirm") {
      setMessage({
        type: "success",
        text: `磅单 ${ticket.ticketNo || ticket.id} 已审核`,
      });
    }
  };

  const getMeasureTicketByUpload = (uploadId: string) =>
    measureTickets.find((ticket) => ticket.uploadId === uploadId);

  const duplicateInboundTicketKeys = useMemo(
    () => buildDuplicateTicketNoSet(inboundRecords.map((r) => r.ticketNo)),
    [inboundRecords]
  );

  const duplicateMeasureTicketKeys = useMemo(
    () => buildDuplicateTicketNoSet(measureTickets.map((t) => t.ticketNo)),
    [measureTickets]
  );
  const completedUploadCount = uploadedFiles.filter((f) => f.status === "已完成").length;
  const pendingReviewCount =
    measureTickets.filter((t) => t.ocrStatus === "待审核").length +
    inboundRecords.filter((r) => r.reviewStatus === "待审核").length;
  const recognizedRecordCount = measureTickets.length + inboundRecords.length;

  const isDuplicateInboundTicket = (record: InboundRecord) => {
    const key = normalizeTicketNo(record.ticketNo);
    return Boolean(key && duplicateInboundTicketKeys.has(key));
  };

  const isDuplicateMeasureTicket = (ticket: MeasureTicket) => {
    const key = normalizeTicketNo(ticket.ticketNo);
    return Boolean(key && duplicateMeasureTicketKeys.has(key));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "已完成":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "失败":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "处理中":
        return <RefreshCw className="h-4 w-4 text-primary animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className={cn("flex flex-col", embedded ? "min-h-0" : "h-full")}>
      {!embedded && (
        <Header
          title="单据导入"
          description="上传计量单与采购单，识别完成后自动 AI 核对"
        />
      )}

      <div className={cn("flex-1", embedded ? "p-0 space-y-3" : "p-6 space-y-6")}>
        {message && (
          <div
            className={`rounded-md border px-3 py-2 text-xs ${
              message.type === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        )}

        {!recordsOnly && (
        <>
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardContent className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                上传后自动进入 AI 流程
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["1", "上传单据", "计量单、采购单统一进来"],
                  ["2", "AI 识别", "抽取车牌、重量、金额等字段"],
                  ["3", "进入核对", "异常与可确认项自动排队"],
                ].map(([step, title, desc]) => (
                  <div key={step} className="rounded-lg border border-border/70 bg-muted/25 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                        {step}
                      </span>
                      <span className="text-sm font-medium">{title}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-muted/25 p-3">
              <div>
                <p className="text-xs text-muted-foreground">已完成上传</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{completedUploadCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">识别记录</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{recognizedRecordCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">待审核</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{pendingReviewCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <FileImage className="h-3.5 w-3.5 text-primary" />
                计量单（图片，可多选）
              </p>
              <input
                ref={measureInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void uploadMeasureFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
              <div
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left transition-colors",
                  isDraggingMeasure
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40",
                  uploading && "opacity-60 pointer-events-none"
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingMeasure(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingMeasure(false);
                }}
                onDrop={handleMeasureDrop}
                onClick={() => measureInputRef.current?.click()}
              >
                <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    拖拽或点击 · JPG/PNG · 最多 {MEASURE_UPLOAD_MAX} 张
                    {ocrProvider === "volcengine" ? " · 火山识别" : ""}
                  </p>
                </div>
                <Button type="button" size="sm" className="h-7 text-xs shrink-0" disabled={uploading}>
                  {uploading ? "识别中" : "选图"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-none">
            <CardContent className="p-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <FileSpreadsheet className="h-3.5 w-3.5 text-success" />
                采购单（Excel 或截图）
              </p>
              <input
                ref={inboundInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,image/jpeg,image/jpg,image/png,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void uploadInboundFile(file);
                    e.target.value = "";
                  }
                }}
              />
              <div
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border px-3 py-3 transition-colors hover:border-success/40",
                  uploading && "opacity-60 pointer-events-none"
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleInboundDrop}
                onClick={() => inboundInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">
                    拖拽或点击 · XLSX/CSV 或截图
                    {ocrProvider === "volcengine" ? " · 火山识别" : ""}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" disabled={uploading}>
                  {uploading ? "处理中" : "选文件"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        </>
        )}

        <div ref={recordsSectionRef}>
        <Tabs value={recordsTab} onValueChange={setRecordsTab} className="space-y-2">
          <TabsList className="h-8 p-0.5">
            <TabsTrigger value="files" className="text-xs px-2.5 py-1 h-7">
              上传记录 ({uploadedFiles.length}
              {hasProcessingUploads
                ? ` · ${uploadedFiles.filter((f) => f.status === "处理中").length} 识别中`
                : ""}
              )
            </TabsTrigger>
            <TabsTrigger value="measure" className="text-xs px-2.5 py-1 h-7">
              计量单 ({measureTickets.length})
            </TabsTrigger>
            <TabsTrigger value="inbound" className="text-xs px-2.5 py-1 h-7">
              采购单 ({inboundRecords.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={dateSearch}
                onChange={(e) => setDateSearch(e.target.value)}
                placeholder="日期筛选 2026-06-01"
                className="pl-7 h-8 text-xs"
              />
            </div>
            {dateSearch.trim() !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDateSearch("")}
              >
                <X className="h-4 w-4 mr-1" />
                清除筛选
              </Button>
            )}
            {dateSearchKey && (
              <span className="text-xs text-muted-foreground">
                已筛选：{formatRecordDate(dateSearchKey)}
              </span>
            )}
            {dateSearchInvalid && (
              <span className="text-xs text-destructive">
                日期格式无效，请使用 2026-06-01 或 2026/6/1
              </span>
            )}
          </div>

          <TabsContent value="files">
            <Card className="shadow-none">
              <CardHeader className="flex flex-row items-center justify-between py-2 px-3 space-y-0">
                <div>
                  <CardTitle className="text-sm">上传记录</CardTitle>
                  {autoRefreshing && (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      火山方舟云端识别中（单张约 20–60 秒），自动刷新…
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void loadData()}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${autoRefreshing ? "animate-spin" : ""}`} />
                    刷新
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleClearCompleted}>
                    清空已完成
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">加载中...</p>
                ) : uploadedFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    暂无上传记录，请上传计量单或入库单（Excel/截图）
                  </p>
                ) : dateSearchKey && filteredUploadCount === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    未找到 {formatRecordDate(dateSearchKey)} 的上传记录
                  </p>
                ) : (
                  <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>上传日期</TableHead>
                        <TableHead>文件名</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>大小</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>结果</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedUpload.items.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell className="tabular-nums whitespace-nowrap">
                                {formatRecordDate(getUploadDateKey(file.uploadTime))}
                              </TableCell>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {file.type === "image" ||
                                  file.type === "inbound-image" ? (
                                    <FileImage
                                      className={`h-4 w-4 ${file.type === "inbound-image" ? "text-success" : "text-primary"}`}
                                    />
                                  ) : (
                                    <FileSpreadsheet className="h-4 w-4 text-success" />
                                  )}
                                  <span className="truncate max-w-[280px]" title={file.name}>
                                    {file.name}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {getUploadTypeLabel(file.type)}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(file.status)}
                                  <span>
                                    {file.status === "处理中"
                                      ? "云端识别中"
                                      : file.status}
                                  </span>
                                  {file.status === "处理中" && (
                                    <span className="text-xs text-muted-foreground">
                                      {file.progress}%
                                    </span>
                                  )}
                                </div>
                                {file.status === "处理中" && (
                                  <Progress
                                    value={file.progress}
                                    className="h-1.5 mt-2 w-32"
                                  />
                                )}
                                {file.errorMessage && (
                                  <p className="text-xs text-destructive mt-1">
                                    {file.errorMessage}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell>
                                {file.resultCount != null ? `${file.resultCount} 条` : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  {file.type === "image" && file.status === "已完成" && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const ticket = getMeasureTicketByUpload(file.id);
                                        if (ticket) openReview(ticket);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {(file.type === "excel" || file.type === "inbound-image") &&
                                    file.status === "已完成" && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        title="审核入库单"
                                        onClick={() => {
                                          const pending =
                                            getFirstPendingInboundByUpload(file.id);
                                          const first =
                                            pending ??
                                            getInboundRecordsByUpload(file.id)[0];
                                          if (first) {
                                            openInboundReview(
                                              first,
                                              getInboundRecordsByUpload(file.id)
                                            );
                                          }
                                        }}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteUpload(file.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <ListPaginationBar
                    page={pagedUpload.page}
                    totalPages={pagedUpload.totalPages}
                    total={pagedUpload.total}
                    pageSize={listPageSize}
                    rangeStart={pagedUpload.rangeStart}
                    rangeEnd={pagedUpload.rangeEnd}
                    onPageChange={setFilesPage}
                    onPageSizeChange={handleListPageSizeChange}
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="measure">
            <Card className="shadow-none">
              <CardHeader className="py-2 px-3 space-y-0">
                <CardTitle className="text-sm">已识别计量单</CardTitle>
              </CardHeader>
              <CardContent>
                {measureTickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    暂无计量单数据，请上传计量单图片
                  </p>
                ) : dateSearchKey && filteredMeasureCount === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    未找到 {formatRecordDate(dateSearchKey)} 的计量单
                  </p>
                ) : (
                  <>
                  <div className="rounded-md border overflow-hidden isolate bg-card [&_[data-slot=table-container]]:bg-card">
                  <Table className="min-w-max border-collapse">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[148px]">磅单号</TableHead>
                        <TableHead className="min-w-[140px]">供应商</TableHead>
                        <TableHead className="min-w-[88px]">车牌</TableHead>
                        <TableHead className="min-w-[72px]">司机</TableHead>
                        <TableHead className="min-w-[120px]">物料类型</TableHead>
                        <TableHead className="min-w-[88px]">毛重(KG)</TableHead>
                        <TableHead className="min-w-[88px]">皮重(KG)</TableHead>
                        <TableHead className="min-w-[88px]">净重(KG)</TableHead>
                        <TableHead className="min-w-[88px]">扣重(KG)</TableHead>
                        <TableHead className="min-w-[88px]">实重(KG)</TableHead>
                        <TableHead className="min-w-[168px]">检重时间</TableHead>
                        <TableHead className="min-w-[168px]">检轻时间</TableHead>
                        <TableHead className="min-w-[88px]">核对</TableHead>
                        <TableHead className="min-w-[88px]">出账</TableHead>
                        <TableHead className={measureStickyConfidenceHead}>
                          识别状态
                        </TableHead>
                        <TableHead className={measureStickyActionHead}>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedMeasure.items.map((ticket) => {
                            const reconcile =
                              reconcileByMeasureId.get(ticket.id) ?? {
                                verified: false,
                                billed: false,
                              };
                            return (
                            <TableRow key={ticket.id} className="group">
                              <TableCell
                                className={cn(
                                  "font-mono text-sm whitespace-nowrap",
                                  isDuplicateMeasureTicket(ticket) &&
                                    "bg-destructive/5 text-destructive"
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>{ticket.ticketNo || "-"}</span>
                                  {isDuplicateMeasureTicket(ticket) ? (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 border-destructive/40 text-destructive text-[10px]"
                                    >
                                      重复
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell
                                className="max-w-[180px] truncate"
                                title={ticket.supplierName}
                              >
                                {ticket.supplierName || "-"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {ticket.plateNo || "-"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {ticket.driverName || "-"}
                              </TableCell>
                              <TableCell
                                className="max-w-[140px] truncate"
                                title={ticket.materialType}
                              >
                                {ticket.materialType || "-"}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                {formatWeightKg(ticket.grossWeight)}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                {formatWeightKg(ticket.tareWeight)}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                {formatWeightKg(ticket.netWeight)}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                {formatWeightKg(ticket.deductWeight)}
                              </TableCell>
                              <TableCell className="text-sm tabular-nums whitespace-nowrap">
                                {formatWeightKg(
                                  ticket.actualWeight || ticket.netWeight
                                )}
                              </TableCell>
                              <TableCell
                                className="text-sm tabular-nums max-w-[168px] truncate"
                                title={ticket.grossTime}
                              >
                                {ticket.grossTime
                                  ? formatWeighTime(ticket.grossTime)
                                  : "-"}
                              </TableCell>
                              <TableCell
                                className="text-sm tabular-nums max-w-[168px] truncate"
                                title={ticket.tareTime}
                              >
                                {ticket.tareTime
                                  ? formatWeighTime(ticket.tareTime)
                                  : "-"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  title={reconcile.verifyHint}
                                  className={cn(
                                    "h-5 text-[10px] font-semibold",
                                    reconcile.verified
                                      ? "border-emerald-500/50 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
                                      : "border-muted-foreground/35 bg-muted/50 text-muted-foreground"
                                  )}
                                >
                                  {reconcile.verified ? "已核对" : "未核对"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "h-5 text-[10px] font-semibold",
                                    reconcile.billed
                                      ? "border-primary/45 bg-primary/10 text-primary"
                                      : reconcile.verified
                                        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                                        : "border-border text-muted-foreground"
                                  )}
                                >
                                  {reconcile.billed ? "已出账" : "未出账"}
                                </Badge>
                              </TableCell>
                              <TableCell className={measureStickyConfidenceCell}>
                                <MeasureTableConfidence ticket={ticket} />
                              </TableCell>
                              <TableCell className={measureStickyActionCell}>
                                <MeasureTableRowActions
                                  ticket={ticket}
                                  reconcile={reconcile}
                                  verifying={verifyingMeasureId === ticket.id}
                                  onView={() => openReview(ticket)}
                                  onDelete={() => openDeleteMeasureConfirm(ticket)}
                                  onVerify={() => void handleOneClickVerify(ticket)}
                                />
                              </TableCell>
                            </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                  <p className="text-[11px] text-muted-foreground px-2 py-1.5 border-t bg-muted">
                    左右滑动查看字段；右侧「识别状态」「操作」固定可见
                  </p>
                  </div>
                  <ListPaginationBar
                    page={pagedMeasure.page}
                    totalPages={pagedMeasure.totalPages}
                    total={pagedMeasure.total}
                    pageSize={listPageSize}
                    rangeStart={pagedMeasure.rangeStart}
                    rangeEnd={pagedMeasure.rangeEnd}
                    onPageChange={setMeasurePage}
                    onPageSizeChange={handleListPageSizeChange}
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbound">
            <Card className="shadow-none">
              <CardHeader className="py-2 px-3 space-y-0">
                <CardTitle className="text-sm">已导入采购单</CardTitle>
              </CardHeader>
              <CardContent>
                {inboundRecords.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    暂无入库单数据，请上传 Excel 或入库单截图
                  </p>
                ) : dateSearchKey && filteredInboundCount === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    未找到 {formatRecordDate(dateSearchKey)} 的入库单
                  </p>
                ) : (
                  <>
                  <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[96px]">出厂过磅日期</TableHead>
                        <TableHead className="min-w-[100px]">进厂过磅日期</TableHead>
                        <TableHead className="min-w-[148px]">磅单编号</TableHead>
                        <TableHead className="min-w-[140px]">供应商名称</TableHead>
                        <TableHead className="min-w-[88px]">车牌</TableHead>
                        <TableHead className="min-w-[72px]">司机</TableHead>
                        <TableHead className="min-w-[88px]">区域名称</TableHead>
                        <TableHead className="min-w-[100px]">过磅净重(KG)</TableHead>
                        <TableHead className="min-w-[88px]">扣重(KG)</TableHead>
                        <TableHead className="min-w-[72px]">水分%</TableHead>
                        <TableHead className="min-w-[88px]">结算重量(吨)</TableHead>
                        <TableHead className="min-w-[88px]">绝干重量(吨)</TableHead>
                        <TableHead className="min-w-[80px]">结算基础</TableHead>
                        <TableHead className="min-w-[100px]">采购总金额</TableHead>
                        <TableHead className="text-right min-w-[88px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedInbound.items.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell className="tabular-nums whitespace-nowrap text-xs">
                                {record.outboundDate || "-"}
                              </TableCell>
                              <TableCell className="tabular-nums whitespace-nowrap text-xs">
                                {formatInboundRecordDate(record)}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "font-mono text-sm whitespace-nowrap",
                                  isDuplicateInboundTicket(record) &&
                                    "bg-destructive/5 text-destructive"
                                )}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>{record.ticketNo}</span>
                                  {isDuplicateInboundTicket(record) ? (
                                    <Badge
                                      variant="outline"
                                      className="shrink-0 border-destructive/40 text-destructive text-[10px]"
                                    >
                                      重复
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell
                                className="max-w-[180px] truncate"
                                title={record.supplierName}
                              >
                                {record.supplierName}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {record.plateNo}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {record.driverName}
                              </TableCell>
                              <TableCell
                                className="max-w-[88px] truncate"
                                title={record.regionName}
                              >
                                {record.regionName || "-"}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatWeightKg(record.netWeight)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatInboundDeductWeight(record.deductWeight)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {record.moisturePercent > 0
                                  ? `${record.moisturePercent}%`
                                  : "-"}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatInboundSettlementWeight(record.settlementWeight)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatInboundDryWeight(record.dryWeight)}
                              </TableCell>
                              <TableCell className="tabular-nums">
                                {formatInboundBasePrice(record.basePrice)}
                              </TableCell>
                              <TableCell className="font-medium tabular-nums">
                                ¥{record.purchaseAmount.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openInboundReview(record)}
                                  >
                                    {record.reviewStatus === "待审核"
                                      ? "复核"
                                      : "查看"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    title="删除"
                                    onClick={() => openDeleteInboundConfirm(record)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                  <ListPaginationBar
                    page={pagedInbound.page}
                    totalPages={pagedInbound.totalPages}
                    total={pagedInbound.total}
                    pageSize={listPageSize}
                    rangeStart={pagedInbound.rangeStart}
                    rangeEnd={pagedInbound.rangeEnd}
                    onPageChange={setInboundPage}
                    onPageSizeChange={handleListPageSizeChange}
                  />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        </div>
      </div>

      <MeasureReviewDialog
        ticket={reviewTicket}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSaved={handleReviewSaved}
      />

      <InboundReviewDialog
        record={reviewInbound}
        batchRecords={reviewInboundBatch}
        open={reviewInboundOpen}
        onOpenChange={setReviewInboundOpen}
        onSaved={handleInboundReviewSaved}
        onNavigate={(next) => setReviewInbound(next)}
      />

      <DeleteConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteConfirm(null);
        }}
        kind={deleteConfirm?.kind ?? null}
        label={deleteDialogLabel}
        subtitle={deleteDialogSubtitle}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
