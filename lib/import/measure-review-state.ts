import { getMeasureConfidenceDisplay } from "@/lib/import/measure-confidence";
import type { MeasureTicket } from "@/lib/types";

export type MeasureRowStatusKind = "pending" | "ai_audited" | "manual" | "failed";

export type MeasureRowStatus = {
  kind: MeasureRowStatusKind;
  /** 列表状态标签 */
  statusLabel: string;
  statusTitle: string;
  statusBadgeClass: string;
  confidencePercent: string;
  confidenceValueClass: string;
  actionLabel: string;
  actionButtonClass: string;
};

export function getMeasureRowStatus(
  ticket: Pick<
    MeasureTicket,
    "ocrStatus" | "reviewSource" | "confidence" | "reviewHint"
  >
): MeasureRowStatus {
  const meta = getMeasureConfidenceDisplay(ticket);
  const percent =
    ticket.ocrStatus === "识别失败" ? "—" : String(meta.percent);

  const confidenceValueClass = {
    high: "text-success",
    medium: "text-warning",
    low: "text-destructive",
    failed: "text-muted-foreground",
  }[meta.level];

  if (ticket.ocrStatus === "识别失败") {
    return {
      kind: "failed",
      statusLabel: "识别失败",
      statusTitle: meta.summary,
      statusBadgeClass:
        "border-destructive/40 bg-destructive/10 text-destructive",
      confidencePercent: percent,
      confidenceValueClass,
      actionLabel: "复核",
      actionButtonClass:
        "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-none border-0",
    };
  }

  if (ticket.ocrStatus === "待审核") {
    return {
      kind: "pending",
      statusLabel: "待复核",
      statusTitle: meta.summary,
      statusBadgeClass: "border-warning/50 bg-warning/15 text-warning",
      confidencePercent: percent,
      confidenceValueClass,
      actionLabel: "复核",
      actionButtonClass:
        "bg-warning text-warning-foreground hover:bg-warning/90 shadow-none border-0",
    };
  }

  if (ticket.reviewSource === "manual") {
    return {
      kind: "manual",
      statusLabel: "人工已确认",
      statusTitle: meta.summary,
      statusBadgeClass:
        "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      confidencePercent: percent,
      confidenceValueClass: "text-sky-700 dark:text-sky-400",
      actionLabel: "查看",
      actionButtonClass:
        "border-sky-500/50 bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 shadow-none dark:text-sky-400",
    };
  }

  if (ticket.ocrStatus === "已审核" && ticket.reviewSource === "ai") {
    return {
      kind: "ai_audited",
      statusLabel: "AI审核",
      statusTitle: meta.summary,
      statusBadgeClass:
        "border-success/45 bg-success/12 text-success",
      confidencePercent: percent,
      confidenceValueClass: "text-success",
      actionLabel: "查看",
      actionButtonClass:
        "border-success/50 bg-success/10 text-success hover:bg-success/20 shadow-none",
    };
  }

  return {
    kind: "pending",
    statusLabel: "待复核",
    statusTitle: meta.summary,
    statusBadgeClass: "border-warning/50 bg-warning/15 text-warning",
    confidencePercent: percent,
    confidenceValueClass,
    actionLabel: "复核",
    actionButtonClass:
      "bg-warning text-warning-foreground hover:bg-warning/90 shadow-none border-0",
  };
}
