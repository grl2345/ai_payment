"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeTicketNo } from "@/lib/import/ticket-uniqueness";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type SheetPreviewPayload = {
  headers: string[];
  headerRowIndex: number;
  rows: {
    sheetRowIndex: number;
    cells: string[];
    ticketNo: string;
    isDataRow: boolean;
  }[];
  fileName?: string;
};

type InboundExcelPreviewProps = {
  uploadId: string;
  highlightTicketNo: string;
  className?: string;
};

export function InboundExcelPreview({
  uploadId,
  highlightTicketNo,
  className,
}: InboundExcelPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SheetPreviewPayload | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  const highlightKey = normalizeTicketNo(highlightTicketNo);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/import/inbound/preview?uploadId=${encodeURIComponent(uploadId)}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "加载 Excel 预览失败");
        }
        if (!cancelled) {
          setData(json as SheetPreviewPayload);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "加载失败");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uploadId]);

  const highlightRowIndex = useMemo(() => {
    if (!data || !highlightKey) return -1;
    return data.rows.findIndex(
      (row) =>
        row.isDataRow && normalizeTicketNo(row.ticketNo) === highlightKey
    );
  }, [data, highlightKey]);

  useEffect(() => {
    if (highlightRowIndex < 0) return;
    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [highlightRowIndex, data]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex flex-1 min-h-[200px] items-center justify-center text-sm text-muted-foreground gap-2",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载采购单表格…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className={cn(
          "flex flex-1 min-h-[120px] items-center justify-center text-sm text-destructive px-4 text-center",
          className
        )}
      >
        {error ?? "无法预览"}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col min-h-0 flex-1", className)}>
      <p className="text-[11px] text-muted-foreground mb-1.5 shrink-0 px-0.5">
        {data.fileName ? `${data.fileName} · ` : ""}
        红框为当前磅单对应行（Excel 第{" "}
        {highlightRowIndex >= 0
          ? data.rows[highlightRowIndex].sheetRowIndex
          : "—"}{" "}
        行）
      </p>
      <div className="flex-1 min-h-0 overflow-auto rounded-md border bg-white">
        <table className="border-collapse text-[10px] leading-tight min-w-full">
          <thead className="sticky top-0 z-20 bg-[#e8e8e8]">
            <tr>
              <th className="border border-black/20 px-1 py-1 w-8 text-center font-medium text-muted-foreground bg-[#efefef]">
                #
              </th>
              {data.headers.map((header, col) => (
                <th
                  key={`${header}-${col}`}
                  className="border border-black/20 px-1.5 py-1 text-left font-medium whitespace-nowrap min-w-[72px]"
                  title={header}
                >
                  {header || `列${col + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => {
              const isHighlight = index === highlightRowIndex;
              const isSummary = !row.isDataRow;
              return (
                <tr
                  key={row.sheetRowIndex}
                  ref={isHighlight ? highlightRef : undefined}
                  className={cn(
                    isSummary && "bg-[#f5f5f5] font-medium",
                    !isSummary && index % 2 === 0 && "bg-white",
                    !isSummary && index % 2 === 1 && "bg-[#fafafa]",
                    isHighlight &&
                      "relative z-10 bg-red-50/90 shadow-[inset_0_0_0_2px_#ef4444]"
                  )}
                >
                  <td
                    className={cn(
                      "border border-black/15 px-1 py-0.5 text-center text-muted-foreground tabular-nums",
                      isHighlight && "font-semibold text-red-600"
                    )}
                  >
                    {row.sheetRowIndex}
                  </td>
                  {row.cells.map((cell, col) => (
                    <td
                      key={`${row.sheetRowIndex}-${col}`}
                      className={cn(
                        "border border-black/15 px-1.5 py-0.5 whitespace-nowrap min-w-[72px]",
                        isHighlight && "font-medium"
                      )}
                      title={cell}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {highlightRowIndex < 0 && highlightKey ? (
        <p className="text-[11px] text-warning mt-1.5 shrink-0">
          未在表格中找到磅单号 {highlightTicketNo}，请核对编号是否一致
        </p>
      ) : null}
    </div>
  );
}
