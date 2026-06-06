"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { DocumentVerificationResult } from "@/lib/import/document-verification";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

const CHECK_LABELS = ["磅单号", "车牌", "司机", "物料", "结算重", "绝干重"] as const;

export function getVerificationPassFlags(verification: DocumentVerificationResult) {
  const { checks } = verification;
  return [
    checks.ticketNo.pass,
    checks.plate.pass,
    checks.driver.pass,
    checks.materialType.pass,
    checks.settleVsActual.pass,
    checks.dryWeight.pass,
  ] as const;
}

export function countVerificationPasses(verification: DocumentVerificationResult) {
  return getVerificationPassFlags(verification).filter(Boolean).length;
}

/** 列表「核对结果」列：一眼看出是否核对通过 */
export function VerificationResultBadge({
  passed,
  verification,
  channelLabel,
}: {
  passed: boolean;
  verification?: DocumentVerificationResult | null;
  channelLabel?: ReactNode;
}) {
  if (!passed) {
    return (
      <Badge
        variant="outline"
        className="h-5 w-fit gap-0.5 border-amber-500/40 bg-amber-50 px-1.5 text-[10px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <CircleDashed className="h-3 w-3" />
        待核对
      </Badge>
    );
  }

  const allPass = verification?.overallPass ?? true;

  return (
    <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap">
      <Badge
        className={cn(
          "h-5 shrink-0 gap-0.5 border-0 px-1.5 text-[10px] font-semibold shadow-sm",
          allPass
            ? "bg-success text-success-foreground hover:bg-success/90"
            : "bg-destructive text-destructive-foreground"
        )}
      >
        {allPass ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 shrink-0" />
        )}
        {allPass ? "核对通过" : "核对未通过"}
      </Badge>
      {channelLabel ? <span className="shrink-0">{channelLabel}</span> : null}
    </span>
  );
}

/** 明细弹窗顶部：核对结论条 */
export function VerificationSummaryBanner({
  verification,
  matchStatus,
  confirmedBy,
  verifiedAt,
  channelLabel,
}: {
  verification: DocumentVerificationResult;
  matchStatus?: string;
  confirmedBy?: string;
  verifiedAt?: string;
  channelLabel?: ReactNode;
}) {
  const isConfirmed = matchStatus === "已确认";
  const passCount = countVerificationPasses(verification);
  const total = CHECK_LABELS.length;
  const overallPass = isConfirmed || verification.overallPass;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        overallPass
          ? "border-success/40 bg-gradient-to-r from-success/15 via-success/8 to-transparent"
          : "border-destructive/40 bg-gradient-to-r from-destructive/12 via-destructive/6 to-transparent"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {overallPass ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground shadow-sm">
              <CheckCircle2 className="h-6 w-6" />
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm">
              <XCircle className="h-6 w-6" />
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold tracking-tight">
                {overallPass ? "核对通过" : "核对未通过"}
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-semibold",
                  overallPass
                    ? "border-success/50 bg-success/10 text-success"
                    : "border-destructive/50 bg-destructive/10 text-destructive"
                )}
              >
                {passCount}/{total} 项一致
              </Badge>
              {channelLabel}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {overallPass
                ? "计量单与采购单关键字段、重量核算均已对齐，可进入付款流程。"
                : `${total - passCount} 项不一致，请修正数据或人工确认后再付款。`}
            </p>
            {verifiedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                核对时间 <span className="font-medium tabular-nums text-foreground">{verifiedAt}</span>
                {confirmedBy?.trim() ? (
                  <span className="ml-2">· 记录 {confirmedBy}</span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <span className="text-[11px] font-medium text-muted-foreground">六项校验</span>
          <div className="flex flex-wrap gap-1">
            {getVerificationPassFlags(verification).map((pass, i) => {
              const label = CHECK_LABELS[i];
              const moisture = verification.checks.dryWeight.moisturePercent;
              const title =
                label === "绝干重" && moisture > 0
                  ? `${label}: ${pass ? "一致" : "不一致"} · 采购水分 ${moisture}%`
                  : `${label}: ${pass ? "一致" : "不一致"}`;

              return (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                  pass
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                )}
                title={title}
              >
                {pass ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {label}
                {label === "绝干重" && moisture > 0 ? (
                  <span className="font-semibold tabular-nums opacity-90">
                    {moisture}%
                  </span>
                ) : null}
              </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
