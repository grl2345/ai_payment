"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatMeasureCoreValue,
  getMeasureCoreFieldLabel,
  getMeasureCoreFields,
} from "@/lib/import/measure-fields";
import {
  formatPurchaseCoreValue,
  getPurchaseCoreFields,
} from "@/lib/import/inbound-fields";
import type { DocumentVerificationResult } from "@/lib/import/document-verification";
import type { InboundRecord, MeasureTicket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckCircle2, Minus, XCircle } from "lucide-react";

type ComparisonRow = {
  label: string;
  measure: string;
  purchase: string;
  comparable?: boolean;
  pass?: boolean;
};

function buildComparisonRows(
  measure: MeasureTicket,
  inbound?: InboundRecord | null,
  verification?: DocumentVerificationResult | null
): ComparisonRow[] {
  const m = getMeasureCoreFields(measure);
  const p = inbound ? getPurchaseCoreFields(inbound) : null;
  const checks = verification?.checks;

  const actualTon =
    m.J_A_Weight > 0 ? (m.J_A_Weight / 1000).toFixed(3) : "-";

  return [
    {
      label: getMeasureCoreFieldLabel("DATE"),
      measure: formatMeasureCoreValue("DATE", m),
      purchase: "—",
    },
    {
      label: "磅单号",
      measure: formatMeasureCoreValue("J_WB_No", m),
      purchase: p ? formatPurchaseCoreValue("C_WB_No", p) : "—",
      comparable: Boolean(p),
      pass: checks?.ticketNo.pass,
    },
    {
      label: "车牌",
      measure: formatMeasureCoreValue("J_Veh_No", m),
      purchase: p ? formatPurchaseCoreValue("C_Veh_No", p) : "—",
      comparable: Boolean(p),
      pass: checks?.plate.pass,
    },
    {
      label: "司机",
      measure: formatMeasureCoreValue("J_Driver", m),
      purchase: p ? formatPurchaseCoreValue("C_Driver", p) : "—",
      comparable: Boolean(p),
      pass: checks?.driver.pass,
    },
    {
      label: getMeasureCoreFieldLabel("J_Mat_Type"),
      measure: formatMeasureCoreValue("J_Mat_Type", m),
      purchase: p ? formatPurchaseCoreValue("C_Mat_Type", p) : "—",
      comparable: Boolean(p),
      pass: checks?.materialType.pass,
    },
    {
      label: getMeasureCoreFieldLabel("J_N_Weight"),
      measure: formatMeasureCoreValue("J_N_Weight", m),
      purchase: "—",
    },
    {
      label: getMeasureCoreFieldLabel("J_A_Weight"),
      measure: formatMeasureCoreValue("J_A_Weight", m),
      purchase: "—",
    },
    {
      label: "结算重量(吨)",
      measure: actualTon === "-" ? "—" : `${actualTon} 吨`,
      purchase: p && p.C_Settle_Weight > 0 ? `${p.C_Settle_Weight.toFixed(3)} 吨` : "—",
      comparable: Boolean(p && p.C_Settle_Weight > 0 && m.J_A_Weight > 0),
      pass: checks?.settleVsActual.pass,
    },
    {
      label: "绝干重量(吨)",
      measure: "—",
      purchase: p ? formatPurchaseCoreValue("C_Dry_Weight", p) : "—",
      comparable: Boolean(p && p.C_Dry_Weight > 0),
      pass: checks?.dryWeight.pass,
    },
    {
      label: "水分百分比",
      measure: "—",
      purchase: p ? formatPurchaseCoreValue("C_Percentage", p) : "—",
    },
    {
      label: "结算基础",
      measure: "—",
      purchase: p ? formatPurchaseCoreValue("C_Base_Price", p) : "—",
    },
    {
      label: "采购总金额",
      measure: "—",
      purchase:
        p && p.Total_Amount > 0
          ? `¥${formatPurchaseCoreValue("Total_Amount", p)}`
          : p
            ? formatPurchaseCoreValue("Total_Amount", p)
            : "—",
    },
  ];
}

function CellValue({
  value,
  mono,
  highlight,
}: {
  value: string;
  mono?: boolean;
  highlight?: "pass" | "fail";
}) {
  return (
    <span
      className={cn(
        "tabular-nums",
        mono && "font-mono",
        highlight === "pass" && "text-success",
        highlight === "fail" && "text-destructive font-medium"
      )}
    >
      {value}
    </span>
  );
}

function RowCheckStatus({ row }: { row: ComparisonRow }) {
  if (!row.comparable) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
        单方
      </span>
    );
  }
  if (row.pass) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        一致
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive">
      <XCircle className="h-3.5 w-3.5" />
      不一致
    </span>
  );
}

export function DocumentCoreFieldsComparison({
  measure,
  inbound,
  verification,
  title = "核心信息对比",
}: {
  measure: MeasureTicket;
  inbound?: InboundRecord | null;
  verification?: DocumentVerificationResult | null;
  title?: string;
}) {
  const rows = buildComparisonRows(measure, inbound, verification);
  const comparableCount = rows.filter((r) => r.comparable).length;
  const passCount = rows.filter((r) => r.comparable && r.pass).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{title}</CardTitle>
        {verification && comparableCount > 0 ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              passCount === comparableCount
                ? "bg-success/12 text-success"
                : "bg-destructive/12 text-destructive"
            )}
          >
            {passCount === comparableCount ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            可对比 {passCount}/{comparableCount} 一致
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="p-0 pb-1">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px] pl-4">核对</TableHead>
              <TableHead className="w-[120px]">字段</TableHead>
              <TableHead>计量单</TableHead>
              <TableHead className="pr-4">采购单</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const measureHighlight =
                row.comparable && row.pass === false
                  ? "fail"
                  : row.comparable && row.pass === true
                    ? "pass"
                    : undefined;
              const purchaseHighlight = measureHighlight;

              return (
                <TableRow
                  key={row.label}
                  className={cn(
                    row.comparable &&
                      row.pass === true &&
                      "bg-success/[0.04] hover:bg-success/[0.07]",
                    row.comparable &&
                      row.pass === false &&
                      "bg-destructive/[0.05] hover:bg-destructive/[0.08]"
                  )}
                >
                  <TableCell className="pl-4">
                    <RowCheckStatus row={row} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.label}</TableCell>
                  <TableCell>
                    <CellValue
                      value={row.measure}
                      mono={row.label === "磅单号"}
                      highlight={measureHighlight}
                    />
                  </TableCell>
                  <TableCell className="pr-4">
                    <CellValue
                      value={row.purchase}
                      mono={row.label === "磅单号"}
                      highlight={purchaseHighlight}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
