"use client";

import { useEffect, useState } from "react";
import {
  getMeasureRecognizeDurationLabel,
  getUploadRecognizeDurationLabel,
} from "@/lib/import/recognize-duration";
import type { MeasureTicket, UploadedFileRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RecognizeDurationCell({
  upload,
  measure,
  processing = false,
  className,
}: {
  upload?: UploadedFileRecord | null;
  measure?: Pick<MeasureTicket, "recognizeDurationMs" | "ocrStatus" | "uploadId">;
  processing?: boolean;
  className?: string;
}) {
  const live =
    processing ||
    measure?.ocrStatus === "识别中" ||
    measure?.ocrStatus === "待识别" ||
    (upload?.status === "处理中" && upload.recognizeDurationMs == null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live || (!upload?.recognizeStartedAt && measure?.recognizeDurationMs == null))
      return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live, upload?.recognizeStartedAt, measure?.recognizeDurationMs]);

  const label = measure
    ? getMeasureRecognizeDurationLabel(measure, upload, { processing: live, now })
    : getUploadRecognizeDurationLabel(upload, { processing: live, now });

  return (
    <span
      className={cn(
        "text-xs tabular-nums text-muted-foreground whitespace-nowrap",
        live && "text-blue-600 dark:text-blue-400",
        className
      )}
      title={label === "-" ? "功能上线前上传的单据无耗时记录" : undefined}
    >
      {label}
    </span>
  );
}
