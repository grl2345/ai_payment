"use client";

import { useEffect, useState } from "react";
import { getUploadRecognizeDurationLabel } from "@/lib/import/recognize-duration";
import type { UploadedFileRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RecognizeDurationCell({
  upload,
  processing = false,
  className,
}: {
  upload?: UploadedFileRecord | null;
  processing?: boolean;
  className?: string;
}) {
  const live =
    processing || (upload?.status === "处理中" && upload.recognizeDurationMs == null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live || !upload?.recognizeStartedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live, upload?.recognizeStartedAt]);

  return (
    <span
      className={cn(
        "text-xs tabular-nums text-muted-foreground whitespace-nowrap",
        live && "text-blue-600 dark:text-blue-400",
        className
      )}
    >
      {getUploadRecognizeDurationLabel(upload, { processing: live, now })}
    </span>
  );
}
