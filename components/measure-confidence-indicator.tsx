"use client";

import { Badge } from "@/components/ui/badge";
import {
  getMeasureConfidenceBadgeClass,
  getMeasureConfidenceBarClass,
  getMeasureConfidenceDisplay,
} from "@/lib/import/measure-confidence";
import type { MeasureTicket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

type MeasureConfidenceIndicatorProps = {
  ticket: Pick<
    MeasureTicket,
    "confidence" | "ocrStatus" | "reviewSource" | "reviewHint"
  >;
  /** compact：列表标签；detail：复核弹窗说明 */
  variant?: "compact" | "detail";
  className?: string;
};

export function MeasureConfidenceIndicator({
  ticket,
  variant = "compact",
  className,
}: MeasureConfidenceIndicatorProps) {
  const meta = getMeasureConfidenceDisplay(ticket);

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-col gap-0.5 w-full max-w-[68px]", className)}>
        <Badge
          variant="outline"
          className={cn(
            "w-fit text-[10px] font-medium shrink-0",
            getMeasureConfidenceBadgeClass(meta.level)
          )}
          title={meta.summary}
        >
          {meta.label}
        </Badge>
        {ticket.reviewSource !== "manual" && ticket.ocrStatus !== "识别失败" ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            AI {meta.percent}%
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30 px-3 py-2.5 space-y-2",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          AI 识别可信度
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0 text-[10px]", getMeasureConfidenceBadgeClass(meta.level))}
        >
          {meta.label}
        </Badge>
      </div>
      {ticket.reviewSource !== "manual" && ticket.ocrStatus !== "识别失败" ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full transition-all", getMeasureConfidenceBarClass(meta.level))}
              style={{ width: `${meta.percent}%` }}
            />
          </div>
          <span className="text-sm font-medium tabular-nums shrink-0">{meta.percent}%</span>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
      {ticket.reviewSource !== "manual" && !meta.autoPassEligible && meta.percent > 0 ? (
        <p className="text-[11px] text-warning">
          自动审核需 {meta.threshold}%（当前 {meta.percent}%），请对照原图核对后再参与一键核对。
        </p>
      ) : null}
    </div>
  );
}
