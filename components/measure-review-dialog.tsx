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
import { CheckCircle, Save } from "lucide-react";
import { toast } from "sonner";
import type { MeasureTicket } from "@/lib/types";
import {
  formatWeightInput,
  normalizeWeighTime,
  parseWeightInput,
  roundWeightKg,
} from "@/lib/import/list-display";
import { MeasureConfidenceIndicator } from "@/components/measure-confidence-indicator";
import { ImagePanViewer } from "@/components/image-pan-viewer";
import { ImageZoomToolbar } from "@/components/image-zoom-toolbar";
import { normalizeFileUrl } from "@/lib/utils";
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

type EditableMeasureTicket = Pick<
  MeasureTicket,
  | "ticketNo"
  | "supplierName"
  | "plateNo"
  | "driverName"
  | "materialName"
  | "materialType"
  | "sourceArea"
  | "unloadPlace"
  | "location"
  | "grossWeight"
  | "tareWeight"
  | "netWeight"
  | "deductWeight"
  | "actualWeight"
  | "grossTime"
  | "tareTime"
>;

interface MeasureReviewDialogProps {
  ticket: MeasureTicket | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (ticket: MeasureTicket, action: "save" | "confirm") => void;
}

function toFormState(ticket: MeasureTicket): EditableMeasureTicket {
  return {
    ticketNo: ticket.ticketNo,
    supplierName: ticket.supplierName,
    plateNo: ticket.plateNo,
    driverName: ticket.driverName,
    materialName: ticket.materialName,
    materialType: ticket.materialType,
    sourceArea: ticket.sourceArea,
    unloadPlace: ticket.unloadPlace,
    location: ticket.location,
    grossWeight: roundWeightKg(ticket.grossWeight),
    tareWeight: roundWeightKg(ticket.tareWeight),
    netWeight: roundWeightKg(ticket.netWeight),
    deductWeight: roundWeightKg(ticket.deductWeight),
    actualWeight: roundWeightKg(ticket.actualWeight),
    grossTime: normalizeWeighTime(ticket.grossTime) || ticket.grossTime,
    tareTime: normalizeWeighTime(ticket.tareTime) || ticket.tareTime,
  };
}

function getOcrStatusBadgeClass(status: MeasureTicket["ocrStatus"]) {
  switch (status) {
    case "已审核":
      return "bg-success/20 text-success";
    case "识别失败":
      return "bg-destructive/20 text-destructive";
    case "待审核":
      return "bg-warning/20 text-warning-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function MeasureReviewDialog({
  ticket,
  open,
  onOpenChange,
  onSaved,
}: MeasureReviewDialogProps) {
  const [form, setForm] = useState<EditableMeasureTicket | null>(null);
  const [displayTicket, setDisplayTicket] = useState<MeasureTicket | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState<"save" | "confirm" | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [panResetKey, setPanResetKey] = useState(0);

  useEffect(() => {
    if (ticket) {
      setForm(toFormState(ticket));
      setDisplayTicket(ticket);
      setZoom(100);
      setRotation(0);
      setPanResetKey((k) => k + 1);
      setSuccessVisible(false);
      setConfirmDialogOpen(false);
    }
  }, [ticket]);

  if (!ticket || !form || !displayTicket) return null;

  const isAudited = displayTicket.ocrStatus === "已审核";
  const formDisabled = saving || successVisible;

  const updateField = <K extends keyof EditableMeasureTicket>(
    field: K,
    value: EditableMeasureTicket[K]
  ) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const submit = async (confirm: boolean) => {
    if (confirm && !form.ticketNo?.trim()) {
      toast.error("请先填写磅单号", { description: "磅单号为必填项" });
      return;
    }

    setSaving(true);
    setSavingAction(confirm ? "confirm" : "save");
    try {
      const response = await fetch(
        `/api/import/measure?id=${encodeURIComponent(ticket.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            grossWeight: roundWeightKg(form.grossWeight),
            tareWeight: roundWeightKg(form.tareWeight),
            netWeight: roundWeightKg(form.netWeight),
            deductWeight: roundWeightKg(form.deductWeight),
            actualWeight: roundWeightKg(form.actualWeight),
            grossTime: normalizeWeighTime(form.grossTime) || form.grossTime,
            tareTime: normalizeWeighTime(form.tareTime) || form.tareTime,
            confirm,
          }),
        }
      );
      const text = await response.text();
      let data: { error?: string; ticket?: MeasureTicket; success?: boolean };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("服务器响应异常，请刷新后重试");
      }
      if (!response.ok || !data.ticket) {
        throw new Error(data.error || "保存失败");
      }

      setDisplayTicket(data.ticket);
      onSaved(data.ticket, confirm ? "confirm" : "save");

      if (confirm) {
        setConfirmDialogOpen(false);
        setSuccessVisible(true);
        toast.success("审核确认成功", {
          description: `磅单 ${data.ticket.ticketNo} 已标记为「已审核」`,
        });
        window.setTimeout(() => {
          setSuccessVisible(false);
          onOpenChange(false);
        }, 1600);
      } else {
        toast.success("修改已保存", {
          description: "数据已更新，状态仍为「待审核」",
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      toast.error(message);
    } finally {
      setSaving(false);
      setSavingAction(null);
    }
  };

  const handleConfirmClick = () => {
    if (!form.ticketNo?.trim()) {
      toast.error("请先填写磅单号", { description: "确认前请核对并填写磅单号" });
      return;
    }
    setConfirmDialogOpen(true);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="w-[96vw] max-w-none sm:max-w-[96vw] h-[94vh] max-h-[94vh] p-5 grid grid-rows-[auto_1fr_auto] gap-4 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-0">
          <DialogTitle className="flex items-center gap-3 pr-8">
            计量单审核
            <Badge className={getOcrStatusBadgeClass(displayTicket.ocrStatus)} variant="outline">
              {displayTicket.ocrStatus}
            </Badge>
          </DialogTitle>
          <MeasureConfidenceIndicator ticket={displayTicket} variant="detail" />
        </DialogHeader>

        {successVisible && (
          <div className="shrink-0 flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-success animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium text-sm">审核已确认</p>
              <p className="text-xs opacity-90 mt-0.5">
                磅单 {displayTicket.ticketNo} 已标记为「已审核」，即将关闭…
              </p>
            </div>
          </div>
        )}

        <div className="grid min-h-0 gap-5 overflow-hidden grid-cols-[minmax(0,58%)_minmax(0,1fr)]">
          <div className="flex flex-col min-w-0 min-h-0">
            <div className="flex items-center justify-between shrink-0 mb-2">
              <Label>原始图片</Label>
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
                src={normalizeFileUrl(displayTicket.imagePath)}
                alt="计量单"
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

          <div className="flex flex-col min-w-0 min-h-0 border-l pl-5">
            <Label className="shrink-0 mb-3">识别内容（可编辑）</Label>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-2">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 pb-6">
                <Field label="磅单号" value={form.ticketNo} onChange={(v) => updateField("ticketNo", v)} className="col-span-2" disabled={formDisabled} />
                <Field label="供应商" value={form.supplierName} onChange={(v) => updateField("supplierName", v)} className="col-span-2" disabled={formDisabled} />
                <Field label="车牌" value={form.plateNo} onChange={(v) => updateField("plateNo", v)} disabled={formDisabled} />
                <Field label="司机" value={form.driverName} onChange={(v) => updateField("driverName", v)} disabled={formDisabled} />
                <Field label="物料名称" value={form.materialName} onChange={(v) => updateField("materialName", v)} className="col-span-2" disabled={formDisabled} />
                <Field label="物料类型" value={form.materialType} onChange={(v) => updateField("materialType", v)} className="col-span-2" disabled={formDisabled} />
                <Field label="来料区域" value={form.sourceArea} onChange={(v) => updateField("sourceArea", v)} disabled={formDisabled} />
                <Field label="卸货地点" value={form.unloadPlace} onChange={(v) => updateField("unloadPlace", v)} disabled={formDisabled} />
                <Field label="区位" value={form.location} onChange={(v) => updateField("location", v)} className="col-span-2" disabled={formDisabled} />
                <NumberField label="毛重(KG)" value={form.grossWeight} onChange={(v) => updateField("grossWeight", v)} disabled={formDisabled} />
                <NumberField label="皮重(KG)" value={form.tareWeight} onChange={(v) => updateField("tareWeight", v)} disabled={formDisabled} />
                <NumberField label="净重(KG)" value={form.netWeight} onChange={(v) => updateField("netWeight", v)} disabled={formDisabled} />
                <NumberField label="扣重(KG)" value={form.deductWeight} onChange={(v) => updateField("deductWeight", v)} disabled={formDisabled} />
                <NumberField label="实际重量(KG)" value={form.actualWeight} onChange={(v) => updateField("actualWeight", v)} className="col-span-2" disabled={formDisabled} />
                <Field
                  label="检重时间"
                  value={form.grossTime}
                  onChange={(v) => updateField("grossTime", v)}
                  onBlur={() =>
                    updateField("grossTime", normalizeWeighTime(form.grossTime) || form.grossTime)
                  }
                  className="col-span-2"
                  placeholder="YYYY-MM-DD HH:mm:ss"
                  disabled={formDisabled}
                />
                <Field
                  label="检轻时间"
                  value={form.tareTime}
                  onChange={(v) => updateField("tareTime", v)}
                  onBlur={() =>
                    updateField("tareTime", normalizeWeighTime(form.tareTime) || form.tareTime)
                  }
                  className="col-span-2"
                  placeholder="YYYY-MM-DD HH:mm:ss"
                  disabled={formDisabled}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-2 pt-3 border-t bg-background flex-col sm:flex-row sm:justify-end">
          {isAudited && !successVisible && (
            <p className="text-xs text-muted-foreground sm:mr-auto w-full sm:w-auto text-center sm:text-left">
              该单据已审核，可继续修改后保存
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
          <Button onClick={handleConfirmClick} disabled={formDisabled || isAudited}>
            {savingAction === "confirm" ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                提交中…
              </>
            ) : successVisible ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                已确认
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
          <AlertDialogTitle>确认审核通过？</AlertDialogTitle>
          <AlertDialogDescription>
            确认后，磅单「{form.ticketNo}」将标记为「已审核」，并参与后续单据匹配。请确保已核对图片与识别内容一致。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>再检查一下</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              submit(true);
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
  onBlur,
  className,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
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
        type="text"
        inputMode="decimal"
        value={formatWeightInput(value)}
        onChange={(e) => onChange(parseWeightInput(e.target.value))}
        onBlur={() => onChange(roundWeightKg(value))}
        className="mt-1 tabular-nums"
        disabled={disabled}
      />
    </div>
  );
}
