"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Save,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import type { InboundRecord } from "@/lib/types";
import { normalizeFileUrl } from "@/lib/utils";
import {
  getReviewStatusBadgeClass,
  isInboundExcelSource,
  isInboundSourcePreviewable,
} from "@/lib/import/review-status";
import { getInboundDisplayConfidence } from "@/lib/import/inbound-confidence";
import { ImagePanViewer } from "@/components/image-pan-viewer";
import { ImageZoomToolbar } from "@/components/image-zoom-toolbar";
import { InboundExcelPreview } from "@/components/inbound-excel-preview";
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
import { Spinner } from "@/components/ui/spinner";
import {
  INBOUND_FIELD_LABELS,
  formatInboundBasePriceInput,
  formatInboundDeductInput,
  formatInboundDryWeightInput,
  formatInboundSettlementWeightInput,
  parseInboundBasePriceInput,
  parseInboundDeductInput,
  parseInboundDryWeightInput,
  parseInboundSettlementWeightInput,
  roundInboundBasePrice,
  roundInboundDeductWeight,
  roundInboundDryWeight,
  roundInboundSettlementWeight,
} from "@/lib/import/inbound-display";

type EditableInbound = Pick<
  InboundRecord,
  | "ticketNo"
  | "outboundDate"
  | "inboundDate"
  | "inboundTime"
  | "supplierName"
  | "plateNo"
  | "driverName"
  | "materialType"
  | "regionName"
  | "originalAttached"
  | "deductWeight"
  | "deductReason"
  | "netWeight"
  | "moisturePercent"
  | "settlementWeight"
  | "dryWeight"
  | "basePrice"
  | "purchaseAmount"
  | "factoryName"
  | "areaName"
>;

interface InboundReviewDialogProps {
  record: InboundRecord | null;
  batchRecords?: InboundRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (record: InboundRecord, action: "save" | "confirm") => void;
  onNavigate?: (record: InboundRecord) => void;
}

function toFormState(record: InboundRecord): EditableInbound {
  return {
    ticketNo: record.ticketNo,
    outboundDate: record.outboundDate,
    inboundDate: record.inboundDate,
    inboundTime: record.inboundTime,
    supplierName: record.supplierName,
    plateNo: record.plateNo,
    driverName: record.driverName,
    materialType: record.materialType,
    regionName: record.regionName,
    originalAttached: record.originalAttached ?? "",
    deductWeight: roundInboundDeductWeight(record.deductWeight),
    deductReason: record.deductReason,
    netWeight: record.netWeight,
    moisturePercent: record.moisturePercent,
    settlementWeight: roundInboundSettlementWeight(record.settlementWeight),
    dryWeight: roundInboundDryWeight(record.dryWeight),
    basePrice: roundInboundBasePrice(record.basePrice),
    purchaseAmount: record.purchaseAmount,
    factoryName: record.factoryName,
    areaName: record.areaName,
  };
}

export function InboundReviewDialog({
  record,
  batchRecords = [],
  open,
  onOpenChange,
  onSaved,
  onNavigate,
}: InboundReviewDialogProps) {
  const [form, setForm] = useState<EditableInbound | null>(null);
  const [displayRecord, setDisplayRecord] = useState<InboundRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "confirm" | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [panResetKey, setPanResetKey] = useState(0);

  useEffect(() => {
    if (!record) return;
    setForm(toFormState(record));
    setDisplayRecord(record);
    setZoom(100);
    setRotation(0);
    setPanResetKey((k) => k + 1);
    setSuccessVisible(false);
    setConfirmDialogOpen(false);
  }, [record]);

  if (!open || !record) return null;

  const activeRecord = displayRecord ?? record;
  const activeForm = form ?? toFormState(record);

  const hasImagePreview = isInboundSourcePreviewable(activeRecord.sourceFile);
  const hasExcelPreview = isInboundExcelSource(activeRecord.sourceFile);
  const showSourcePanel = hasImagePreview || hasExcelPreview;
  const isAudited = activeRecord.reviewStatus === "已审核";
  const formDisabled = saving || successVisible;

  const batch = batchRecords.length > 0 ? batchRecords : [activeRecord];
  const currentIndex = batch.findIndex((item) => item.id === activeRecord.id);
  const pendingInBatch = batch.filter((item) => item.reviewStatus === "待审核").length;

  const updateField = <K extends keyof EditableInbound>(
    field: K,
    value: EditableInbound[K]
  ) => {
    setForm((prev) => ({ ...(prev ?? toFormState(record)), [field]: value }));
  };

  const submit = async (confirm: boolean) => {
    if (confirm && !activeForm.ticketNo?.trim()) {
      toast.error("请先填写磅单编号", { description: "磅单编号为必填项" });
      return;
    }

    setSaving(true);
    setSavingAction(confirm ? "confirm" : "save");
    try {
      const response = await fetch(
        `/api/import/inbound?id=${encodeURIComponent(record.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...activeForm, confirm }),
        }
      );
      const text = await response.text();
      let data: { error?: string; record?: InboundRecord };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("服务器响应异常，请刷新后重试");
      }
      if (!response.ok || !data.record) {
        throw new Error(data.error || "保存失败");
      }

      setDisplayRecord(data.record);
      onSaved(data.record, confirm ? "confirm" : "save");

      if (confirm) {
        setConfirmDialogOpen(false);
        setSuccessVisible(true);
        toast.success("入库单审核确认成功", {
          description: `磅单 ${data.record.ticketNo} 已审核，可参与单据匹配`,
        });
        window.setTimeout(() => {
          setSuccessVisible(false);
          onOpenChange(false);
        }, 1400);
      } else {
        toast.success("修改已保存", {
          description: "状态仍为「待审核」",
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  };

  const goSibling = (delta: number) => {
    if (!onNavigate || currentIndex < 0) return;
    const next = batch[currentIndex + delta];
    if (next) onNavigate(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
        <DialogContent
          className={`w-[96vw] max-w-none sm:max-w-[96vw] h-[94vh] max-h-[94vh] p-5 grid grid-rows-[auto_1fr_auto] gap-4 overflow-hidden ${
            showSourcePanel ? "" : "sm:max-w-3xl"
          }`}
        >
          <DialogHeader className="shrink-0 space-y-2">
            <DialogTitle className="flex flex-wrap items-center gap-3 pr-8">
              采购入库单审核
              <Badge
                className={getReviewStatusBadgeClass(activeRecord.reviewStatus)}
                variant="outline"
              >
                {activeRecord.reviewStatus}
              </Badge>
              {(() => {
                const conf = getInboundDisplayConfidence(activeRecord);
                if (conf == null) return null;
                return (
                  <Badge variant="secondary" className="tabular-nums">
                    置信度 {conf}%
                  </Badge>
                );
              })()}
              {batch.length > 1 && (
                <span className="text-xs font-normal text-muted-foreground">
                  本批第 {currentIndex + 1}/{batch.length} 条，待审核 {pendingInBatch} 条
                </span>
              )}
            </DialogTitle>
            {batch.length > 1 && onNavigate && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentIndex <= 0 || saving}
                  onClick={() => goSibling(-1)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一条
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentIndex >= batch.length - 1 || saving}
                  onClick={() => goSibling(1)}
                >
                  下一条
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </DialogHeader>

          {successVisible && (
            <div className="shrink-0 flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-success animate-in fade-in slide-in-from-top-2 duration-300">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium text-sm">审核已确认</p>
                <p className="text-xs opacity-90 mt-0.5">
                  磅单 {activeRecord.ticketNo} 已审核，即将关闭…
                </p>
              </div>
            </div>
          )}

          <div
            className={`grid min-h-0 gap-5 overflow-hidden ${
              showSourcePanel
                ? "grid-cols-[minmax(0,1fr)_minmax(360px,46%)]"
                : "grid-cols-1"
            }`}
          >
            {hasImagePreview ? (
              <div className="flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between shrink-0 mb-2">
                  <Label>原始截图</Label>
                  <ImageZoomToolbar
                    zoom={zoom}
                    onZoomIn={() => setZoom((z) => Math.min(300, z + 25))}
                    onZoomOut={() => setZoom((z) => Math.max(50, z - 25))}
                    onRotate={() => setRotation((r) => (r + 90) % 360)}
                    onResetPan={() => setPanResetKey((k) => k + 1)}
                  />
                </div>
                <div className="rounded-lg border bg-muted/20 flex-1 min-h-0 p-2">
                  <ImagePanViewer
                    src={normalizeFileUrl(activeRecord.sourceFile)}
                    alt="入库单"
                    zoom={zoom}
                    rotation={rotation}
                    resetKey={panResetKey}
                    onWheelZoom={(deltaY) =>
                      setZoom((z) =>
                        Math.min(300, Math.max(50, z + (deltaY > 0 ? -25 : 25)))
                      )
                    }
                  />
                </div>
              </div>
            ) : hasExcelPreview ? (
              <div className="flex flex-col min-w-0 min-h-0">
                <Label className="shrink-0 mb-2">采购单 Excel 原表</Label>
                <InboundExcelPreview
                  uploadId={activeRecord.uploadId}
                  highlightTicketNo={activeForm.ticketNo}
                  className="flex-1 min-h-0"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/30 p-6 flex flex-col items-center justify-center text-center min-h-[120px]">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">无原始文件预览</p>
                <p className="text-xs text-muted-foreground mt-1">
                  请对照线下单据核对下列字段
                </p>
              </div>
            )}

            <div
              className={`flex flex-col min-w-0 min-h-0 ${showSourcePanel ? "border-l pl-5" : ""}`}
            >
              <div className="flex items-center justify-between shrink-0 mb-2 gap-2">
                <Label>入库明细（可编辑，与 Excel 列一致）</Label>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  共 20 项 · 可向下滚动
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-2 border rounded-md bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pb-2">
                  <Field
                    label={INBOUND_FIELD_LABELS.outboundDate}
                    value={activeForm.outboundDate}
                    onChange={(v) => updateField("outboundDate", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.inboundTime}
                    value={activeForm.inboundTime}
                    onChange={(v) => updateField("inboundTime", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.ticketNo}
                    value={activeForm.ticketNo}
                    onChange={(v) => updateField("ticketNo", v)}
                    className="col-span-2"
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.supplierName}
                    value={activeForm.supplierName}
                    onChange={(v) => updateField("supplierName", v)}
                    className="col-span-2"
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.plateNo}
                    value={activeForm.plateNo}
                    onChange={(v) => updateField("plateNo", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.driverName}
                    value={activeForm.driverName}
                    onChange={(v) => updateField("driverName", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.materialType}
                    value={activeForm.materialType}
                    onChange={(v) => updateField("materialType", v)}
                    className="col-span-2"
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.regionName}
                    value={activeForm.regionName}
                    onChange={(v) => updateField("regionName", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.originalAttached}
                    value={activeForm.originalAttached ?? ""}
                    onChange={(v) => updateField("originalAttached", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.inboundDate}
                    value={activeForm.inboundDate}
                    onChange={(v) => updateField("inboundDate", v)}
                    className="col-span-2"
                    disabled={formDisabled}
                  />
                  <DecimalNumberField
                    label={INBOUND_FIELD_LABELS.deductWeight}
                    value={activeForm.deductWeight}
                    onChange={(v) => updateField("deductWeight", v)}
                    formatInput={formatInboundDeductInput}
                    parseInput={parseInboundDeductInput}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.deductReason}
                    value={activeForm.deductReason}
                    onChange={(v) => updateField("deductReason", v)}
                    disabled={formDisabled}
                  />
                  <NumberField
                    label={INBOUND_FIELD_LABELS.netWeight}
                    value={activeForm.netWeight}
                    onChange={(v) => updateField("netWeight", v)}
                    disabled={formDisabled}
                  />
                  <NumberField
                    label={INBOUND_FIELD_LABELS.moisturePercent}
                    value={activeForm.moisturePercent}
                    onChange={(v) => updateField("moisturePercent", v)}
                    disabled={formDisabled}
                  />
                  <DecimalNumberField
                    label={INBOUND_FIELD_LABELS.settlementWeight}
                    value={activeForm.settlementWeight}
                    onChange={(v) => updateField("settlementWeight", v)}
                    formatInput={formatInboundSettlementWeightInput}
                    parseInput={parseInboundSettlementWeightInput}
                    disabled={formDisabled}
                  />
                  <DecimalNumberField
                    label={INBOUND_FIELD_LABELS.dryWeight}
                    value={activeForm.dryWeight}
                    onChange={(v) => updateField("dryWeight", v)}
                    formatInput={formatInboundDryWeightInput}
                    parseInput={parseInboundDryWeightInput}
                    disabled={formDisabled}
                  />
                  <DecimalNumberField
                    label={INBOUND_FIELD_LABELS.basePrice}
                    value={activeForm.basePrice}
                    onChange={(v) => updateField("basePrice", v)}
                    formatInput={formatInboundBasePriceInput}
                    parseInput={parseInboundBasePriceInput}
                    disabled={formDisabled}
                  />
                  <NumberField
                    label={INBOUND_FIELD_LABELS.purchaseAmount}
                    value={activeForm.purchaseAmount}
                    onChange={(v) => updateField("purchaseAmount", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.factoryName}
                    value={activeForm.factoryName}
                    onChange={(v) => updateField("factoryName", v)}
                    disabled={formDisabled}
                  />
                  <Field
                    label={INBOUND_FIELD_LABELS.areaName}
                    value={activeForm.areaName}
                    onChange={(v) => updateField("areaName", v)}
                    disabled={formDisabled}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:gap-2 pt-3 border-t bg-background flex-col sm:flex-row sm:justify-end">
            {isAudited && !successVisible && (
              <p className="text-xs text-muted-foreground sm:mr-auto w-full sm:w-auto">
                已审核记录可修改保存；确认后将参与与计量单的自动匹配
              </p>
            )}
            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                关闭
              </Button>
              <Button variant="secondary" onClick={() => submit(false)} disabled={formDisabled}>
                {savingAction === "save" ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    保存中…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    保存修改
                  </>
                )}
              </Button>
              <Button onClick={() => setConfirmDialogOpen(true)} disabled={formDisabled || isAudited}>
                {savingAction === "confirm" ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" />
                    提交中…
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    确认无误
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认入库单审核通过？</AlertDialogTitle>
            <AlertDialogDescription>
              确认后，磅单「{activeForm.ticketNo}」将标记为「已审核」，并与已审核的计量单按磅单号自动匹配核对。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>再检查一下</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                void submit(true);
              }}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {savingAction === "confirm" ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  提交中…
                </>
              ) : (
                "确认提交"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1"
        disabled={disabled}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  className,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value === 0 ? "0" : value ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          onChange(raw === "" ? 0 : Number(raw) || 0);
        }}
        className="mt-1"
        disabled={disabled}
      />
    </div>
  );
}

function DecimalNumberField({
  label,
  value,
  onChange,
  formatInput,
  parseInput,
  className,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  formatInput: (value: number) => string;
  parseInput: (raw: string) => number;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => formatInput(value));

  useEffect(() => {
    setText(formatInput(value));
  }, [value, formatInput]);

  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const parsed = parseInput(text);
          onChange(parsed);
          setText(formatInput(parsed));
        }}
        className="mt-1 tabular-nums"
        disabled={disabled}
      />
    </div>
  );
}
