"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getMeasureRowStatus } from "@/lib/import/measure-review-state";
import type { MeasureTicket } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { MeasureReconcileState } from "@/lib/import/measure-reconcile-state";
import { Eye, Loader2, Sparkles, Trash2 } from "lucide-react";

/** 操作列宽（右侧贴边；置信度列 right 偏移须与此一致） */
export const MEASURE_STICKY_ACTION_W = "w-[196px] min-w-[196px] max-w-[196px]";

/** 状态 + 置信度列宽 */
export const MEASURE_STICKY_CONF_W = "w-[108px] min-w-[108px] max-w-[108px]";

const stickyConfidenceBase = cn(
  "sticky z-30 border-l border-border border-r-0",
  "bg-card group-hover:bg-muted",
  MEASURE_STICKY_CONF_W,
  "right-[196px]"
);

const stickyActionBase = cn(
  "sticky right-0 z-30 border-0",
  "bg-card group-hover:bg-muted",
  MEASURE_STICKY_ACTION_W
);

export const measureStickyConfidenceHead = cn(
  stickyConfidenceBase,
  "z-40 bg-muted pl-2 pr-1 py-0 h-10 text-xs font-medium text-muted-foreground whitespace-nowrap align-middle"
);

export const measureStickyActionHead = cn(
  stickyActionBase,
  "z-40 bg-muted pl-0 pr-2 py-0 h-10 text-xs font-medium text-muted-foreground text-center whitespace-nowrap align-middle -ml-px"
);

export const measureStickyConfidenceCell = cn(
  stickyConfidenceBase,
  "pl-2 pr-1 py-2 align-middle"
);

export const measureStickyActionCell = cn(
  stickyActionBase,
  "pl-0 pr-2 py-2 align-middle -ml-px"
);

type MeasureTicketStickyProps = {
  ticket: MeasureTicket;
};

export function MeasureTableReconcileBadges({
  reconcile,
}: {
  reconcile: MeasureReconcileState;
}) {
  return (
    <div
      className="flex flex-col gap-1"
      title={reconcile.verifyHint}
    >
      <Badge
        variant="outline"
        className={cn(
          "h-5 w-fit px-1.5 text-[10px] font-semibold leading-none",
          reconcile.verified
            ? "border-emerald-500/50 bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
            : "border-muted-foreground/35 bg-muted/50 text-muted-foreground"
        )}
      >
        {reconcile.verified ? "已核对" : "未核对"}
      </Badge>
      <Badge
        variant="outline"
        className={cn(
          "h-5 w-fit px-1.5 text-[10px] font-medium leading-none",
          reconcile.billed
            ? "border-primary/45 bg-primary/10 text-primary"
            : reconcile.verified
              ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              : "border-border bg-muted/30 text-muted-foreground"
        )}
      >
        {reconcile.billed ? "已出账" : "未出账"}
      </Badge>
    </div>
  );
}

export function MeasureTableConfidence({ ticket }: MeasureTicketStickyProps) {
  const row = getMeasureRowStatus(ticket);

  return (
    <div className="flex flex-col gap-1 whitespace-nowrap" title={row.statusTitle}>
      <Badge
        variant="outline"
        className={cn(
          "h-5 w-fit px-1.5 text-[10px] font-medium leading-none",
          row.statusBadgeClass
        )}
      >
        {row.statusLabel}
      </Badge>
      <span className="text-[10px] text-muted-foreground leading-none">
        置信度：
        <span className={cn("font-semibold tabular-nums", row.confidenceValueClass)}>
          {row.confidencePercent}
        </span>
      </span>
    </div>
  );
}

type MeasureTableRowActionsProps = MeasureTicketStickyProps & {
  reconcile: MeasureReconcileState;
  verifying?: boolean;
  onView: () => void;
  onDelete: () => void;
  onVerify?: () => void;
};

export function MeasureTableRowActions({
  ticket,
  reconcile,
  verifying = false,
  onView,
  onDelete,
  onVerify,
}: MeasureTableRowActionsProps) {
  const row = getMeasureRowStatus(ticket);
  const useSolid = row.kind === "pending" || row.kind === "failed";
  const showOneClick =
    !reconcile.verified && Boolean(reconcile.matchId) && Boolean(onVerify);

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1">
      {showOneClick ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs bg-primary hover:bg-primary/90"
          disabled={verifying}
          title={reconcile.verifyHint || "自动匹配并确认"}
          onClick={onVerify}
        >
          {verifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          一键核对
        </Button>
      ) : null}
      {reconcile.verified ? (
        <Button
          type="button"
          variant={useSolid ? "default" : "outline"}
          size="sm"
          className={cn("h-8 shrink-0 gap-1 px-2 text-xs", row.actionButtonClass)}
          onClick={onView}
        >
          <Eye className="h-3.5 w-3.5" />
          {row.actionLabel}
        </Button>
      ) : (
        <Button
          type="button"
          variant={useSolid ? "default" : "outline"}
          size="sm"
          className={cn(
            "h-8 shrink-0 gap-1 px-2 text-xs",
            useSolid ? row.actionButtonClass : undefined
          )}
          onClick={onView}
        >
          <Eye className="h-3.5 w-3.5" />
          {useSolid ? row.actionLabel : "查看"}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0 bg-background hover:bg-destructive/10 hover:text-destructive"
        title="删除"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
