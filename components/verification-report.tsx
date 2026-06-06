"use client";

import { Badge } from "@/components/ui/badge";
import type { DocumentVerificationResult } from "@/lib/import/document-verification";
import { isAiConfirmedBy } from "@/lib/import/document-verification";
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ChevronDown,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type CheckCard = {
  label: string;
  measureLabel: string;
  measureValue: string;
  purchaseLabel: string;
  purchaseValue: string;
  pass: boolean;
  helper?: string;
  /** 卡片强调类型 */
  accent?: "default" | "weight" | "dry";
  /** 绝干重量校验：采购登记水分 */
  moisturePercent?: number;
  /** 绝干重量校验：结算重量（吨） */
  settleWeightTon?: number;
  /** 绝干重量校验：理论绝干（吨） */
  calculatedDryTon?: number;
};

function StatusIcon({ pass, className }: { pass: boolean; className?: string }) {
  return pass ? (
    <CheckCircle2 className={cn("h-4 w-4 shrink-0 text-success", className)} />
  ) : (
    <XCircle className={cn("h-4 w-4 shrink-0 text-destructive", className)} />
  );
}

function CheckResultCard({ item }: { item: CheckCard }) {
  const valueHighlight = item.pass ? "pass" : "fail";
  const accentBorder =
    item.accent === "weight"
      ? "border-l-4 border-l-amber-400"
      : item.accent === "dry"
        ? "border-l-4 border-l-sky-500"
        : "";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        accentBorder,
        item.pass ? "border-success/25" : "border-destructive/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon pass={item.pass} />
          <span className="truncate text-sm font-medium">{item.label}</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[11px]",
            item.pass
              ? "border-success/30 text-success"
              : "border-destructive/30 text-destructive"
          )}
        >
          {item.pass ? "一致" : "不一致"}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] sm:items-center">
        <ValueBlock
          label={item.measureLabel}
          value={item.measureValue}
          side="measure"
          highlight={valueHighlight}
        />
        <div
          className={cn(
            "hidden h-6 w-6 items-center justify-center rounded-full sm:flex",
            item.pass ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}
        >
          {item.pass ? "=" : "≠"}
        </div>
        <ValueBlock
          label={item.purchaseLabel}
          value={item.purchaseValue}
          side="purchase"
          highlight={valueHighlight}
        />
      </div>

      {item.moisturePercent != null && item.moisturePercent > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-500/25 bg-sky-50/80 px-3 py-2.5 dark:bg-sky-950/20">
            <div>
              <p className="text-[11px] font-medium text-sky-800/80 dark:text-sky-200/80">
                采购登记水分
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                取自采购入库单，绝干核算依据
              </p>
            </div>
            <span className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-300">
              {item.moisturePercent}%
            </span>
          </div>
          {item.settleWeightTon != null &&
          item.settleWeightTon > 0 &&
          item.calculatedDryTon != null &&
          item.calculatedDryTon > 0 ? (
            <div className="rounded-md border border-violet-200/60 bg-violet-50/60 px-3 py-2 font-mono text-xs leading-relaxed dark:border-violet-900/40 dark:bg-violet-950/20">
              <span className="font-medium text-violet-800/80 dark:text-violet-200/80">
                核算过程：
              </span>
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {item.settleWeightTon.toFixed(3)} 吨
              </span>
              <span className="mx-1 text-muted-foreground">×</span>
              <span>
                (1 -{" "}
                <span className="font-bold text-sky-600 dark:text-sky-400">
                  {item.moisturePercent}%
                </span>
                )
              </span>
              <span className="mx-1 text-muted-foreground">=</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {item.calculatedDryTon.toFixed(3)} 吨
              </span>
              <span className="ml-1 text-muted-foreground">（理论绝干）</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {item.helper ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {item.helper}
        </p>
      ) : null}
    </div>
  );
}

function ValueBlock({
  label,
  value,
  side,
  highlight,
}: {
  label: string;
  value: string;
  side: "measure" | "purchase";
  highlight?: "pass" | "fail";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border px-2.5 py-2",
        side === "measure"
          ? "border-amber-200/70 bg-amber-50/80 dark:border-amber-900/45 dark:bg-amber-950/30"
          : "border-sky-200/70 bg-sky-50/80 dark:border-sky-900/45 dark:bg-sky-950/30"
      )}
    >
      <p
        className={cn(
          "text-[11px] font-medium",
          side === "measure"
            ? "text-amber-800/75 dark:text-amber-200/75"
            : "text-sky-800/75 dark:text-sky-200/75"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate font-mono text-sm",
          highlight === "pass" && "font-semibold text-success",
          highlight === "fail" && "font-semibold text-destructive",
          !highlight && "text-foreground"
        )}
        title={value || "—"}
      >
        {value || "—"}
      </p>
    </div>
  );
}

export function VerificationReport({
  verification,
  matchStatus,
  confirmedBy = "",
  hideHeader = false,
}: {
  verification: DocumentVerificationResult;
  matchStatus?: string;
  confirmedBy?: string;
  /** 已有顶部结论条时隐藏重复摘要 */
  hideHeader?: boolean;
}) {
  const { checks, overallPass: autoPass } = verification;
  const isConfirmed = matchStatus === "已确认";
  const aiConfirmed = isConfirmed && isAiConfirmedBy(confirmedBy);
  const legacyAutoConfirmed = isConfirmed && !confirmedBy.trim() && autoPass;
  const manualConfirmed = isConfirmed && !aiConfirmed && !legacyAutoConfirmed;
  const overallPass = isConfirmed || autoPass;
  const passCount = [
    checks.ticketNo.pass,
    checks.plate.pass,
    checks.driver.pass,
    checks.materialType.pass,
    checks.dryWeight.pass,
    checks.settleVsActual.pass,
  ].filter(Boolean).length;
  const totalCount = 6;

  const calcDry =
    checks.dryWeight.calculatedDry > 0
      ? `${checks.dryWeight.calculatedDry.toFixed(3)} 吨`
      : "—";
  const regDry =
    checks.dryWeight.dryWeight > 0
      ? `${checks.dryWeight.dryWeight.toFixed(3)} 吨`
      : "—";

  const checkCards: CheckCard[] = [
    {
      label: "磅单号",
      measureLabel: "计量单",
      measureValue: checks.ticketNo.measureValue,
      purchaseLabel: "采购单",
      purchaseValue: checks.ticketNo.purchaseValue,
      pass: checks.ticketNo.pass,
    },
    {
      label: "车牌",
      measureLabel: "计量单",
      measureValue: checks.plate.measureValue,
      purchaseLabel: "采购单",
      purchaseValue: checks.plate.purchaseValue,
      pass: checks.plate.pass,
    },
    {
      label: "司机",
      measureLabel: "计量单",
      measureValue: checks.driver.measureValue,
      purchaseLabel: "采购单",
      purchaseValue: checks.driver.purchaseValue,
      pass: checks.driver.pass,
    },
    {
      label: "物料类型",
      measureLabel: "计量单",
      measureValue: checks.materialType.measureValue,
      purchaseLabel: "采购单",
      purchaseValue: checks.materialType.purchaseValue,
      pass: checks.materialType.pass,
    },
    {
      label: "结算重量",
      measureLabel: "实际重量换算",
      measureValue:
        checks.settleVsActual.actualWeightKg > 0
          ? `${checks.settleVsActual.actualWeightKg.toLocaleString()} KG -> ${checks.settleVsActual.actualWeightTon.toFixed(3)} 吨`
          : "—",
      purchaseLabel: "采购登记",
      purchaseValue:
        checks.settleVsActual.settleWeightTon > 0
          ? `${checks.settleVsActual.settleWeightTon.toFixed(3)} 吨`
          : "—",
      pass: checks.settleVsActual.pass,
      accent: "weight",
      helper: "实际重量按 KG / 1000 换算后，与采购结算重量比较。",
    },
    {
      label: "绝干重量",
      measureLabel: "理论计算",
      measureValue: calcDry,
      purchaseLabel: "采购登记",
      purchaseValue: regDry,
      pass: checks.dryWeight.pass,
      accent: "dry",
      moisturePercent: checks.dryWeight.moisturePercent,
      settleWeightTon: checks.dryWeight.settleWeight,
      calculatedDryTon: checks.dryWeight.calculatedDry,
      helper:
        checks.dryWeight.moisturePercent > 0
          ? `以采购单水分 ${checks.dryWeight.moisturePercent}% 核算理论绝干，再与采购登记绝干比对。`
          : "需采购单提供水分百分比方可核算绝干重量。",
    },
  ];

  const resultLabel = aiConfirmed
    ? "AI 自动确认"
    : manualConfirmed
      ? "人工确认通过"
      : overallPass
        ? "校验通过"
        : "校验未通过";
  const summaryText = aiConfirmed
    ? "六项校验全部一致，AI 已自动确认，可生成付款明细。"
    : manualConfirmed
      ? `系统比对 ${passCount}/${totalCount} 项一致，当前按人工确认结果通过。`
      : overallPass
        ? "关键字段和重量核算一致，可以放心进入付款。"
        : `${totalCount - passCount} 项未通过，请先修正数据或人工确认。`;

  return (
    <div className="space-y-3">
      {!hideHeader ? (
      <div
        className={cn(
          "rounded-lg border px-4 py-3",
          overallPass
            ? "border-success/35 bg-success/8"
            : "border-destructive/35 bg-destructive/8"
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {overallPass ? (
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success" />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{resultLabel}</h3>
                <Badge
                  variant="outline"
                  className={cn(
                    overallPass
                      ? "border-success/35 text-success"
                      : "border-destructive/35 text-destructive"
                  )}
                >
                  {passCount}/{totalCount} 通过
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{summaryText}</p>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-1.5 sm:w-[210px]">
            {checkCards.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "h-2 rounded-full",
                  item.pass ? "bg-success" : "bg-destructive"
                )}
                title={`${item.label}: ${item.pass ? "通过" : "未通过"}`}
              />
            ))}
          </div>
        </div>
      </div>
      ) : null}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">六项校验</h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              琥珀色 = 计量单
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
              蓝色 = 采购单
            </span>
            <span className="text-muted-foreground">绿色数值 = 一致</span>
          </div>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {checkCards.map((item) => (
            <CheckResultCard key={item.label} item={item} />
          ))}
        </div>
      </div>

      <details open className="group rounded-lg border bg-muted/20">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium list-none">
          <Calculator className="h-4 w-4 text-primary" />
          校验规则与公式说明
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t px-4 pb-4 pt-3 text-sm text-muted-foreground">
          <p>磅单号、车牌、司机、物料类型：计量单与采购入库单对应字段须一致。</p>
          <p className="flex flex-wrap items-center gap-1 rounded-md border bg-background px-2 py-1 font-mono text-xs">
            <span>结算重量</span>
            <span>=</span>
            <span>实际重量 KG</span>
            <ArrowRight className="h-3 w-3" />
            <span>吨</span>
          </p>
          <p className="rounded-md border bg-background px-2 py-1 font-mono text-xs">
            理论绝干 = 结算重量 × (1 - 采购登记水分% ÷ 100)，与采购登记绝干比较。
          </p>
        </div>
      </details>
    </div>
  );
}
