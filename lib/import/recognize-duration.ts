import type { MeasureTicket, UploadedFileRecord } from "@/lib/types";

export function formatRecognizeDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}毫秒`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}秒`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return rem > 0 ? `${min}分${rem}秒` : `${min}分钟`;
}

export function getUploadRecognizeDurationMs(
  upload: UploadedFileRecord | null | undefined,
  now = Date.now()
): number | null {
  if (!upload) return null;
  if (upload.recognizeDurationMs != null) {
    return upload.recognizeDurationMs;
  }
  if (upload.status === "处理中" && upload.recognizeStartedAt) {
    const started = Date.parse(upload.recognizeStartedAt);
    if (Number.isFinite(started)) {
      return Math.max(0, now - started);
    }
  }
  return null;
}

export function getUploadRecognizeDurationLabel(
  upload: UploadedFileRecord | null | undefined,
  options?: { processing?: boolean; now?: number }
): string {
  const ms = getUploadRecognizeDurationMs(upload, options?.now);
  if (ms == null) return "-";
  const label = formatRecognizeDurationMs(ms);
  const processing =
    options?.processing ??
    (upload?.status === "处理中" && upload.recognizeDurationMs == null);
  return processing ? `${label}…` : label;
}

export function getMeasureRecognizeDurationLabel(
  measure: Pick<MeasureTicket, "recognizeDurationMs" | "ocrStatus" | "uploadId">,
  upload?: UploadedFileRecord | null,
  options?: { processing?: boolean; now?: number }
): string {
  const processing =
    options?.processing ??
    (measure.ocrStatus === "识别中" || measure.ocrStatus === "待识别");

  if (measure.recognizeDurationMs != null) {
    const label = formatRecognizeDurationMs(measure.recognizeDurationMs);
    return processing ? `${label}…` : label;
  }

  return getUploadRecognizeDurationLabel(upload, { ...options, processing });
}
