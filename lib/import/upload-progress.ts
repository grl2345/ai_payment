import { getStore, updateUpload } from "@/lib/db/store";

/** 云端识别期间平滑推进进度，避免长时间停在同一百分比 */
export function pulseUploadProgress(
  uploadId: string,
  start: number,
  cap: number,
  intervalMs = 2500
): () => void {
  let current = start;
  updateUpload(uploadId, { progress: current });

  const timer = setInterval(() => {
    const upload = getStore().uploads.find((item) => item.id === uploadId);
    if (!upload || upload.status !== "处理中") {
      clearInterval(timer);
      return;
    }
    current = Math.min(Math.max(upload.progress, current) + 5, cap);
    if (current > upload.progress) {
      updateUpload(uploadId, { progress: current });
    }
  }, intervalMs);

  return () => clearInterval(timer);
}
