import {
  addInboundRecords,
  updateUpload,
} from "@/lib/db/store";
import { applyInboundAutoReview } from "@/lib/import/auto-review";
import { parseInboundExcel } from "@/lib/parsers/inbound-excel";
import { parseInboundImage } from "@/lib/parsers/inbound-vision";
import { pulseUploadProgress } from "@/lib/import/upload-progress";
import { runAutoReview } from "@/lib/import/run-auto-review";
import { buildFileUrl } from "@/lib/utils";
import type { InboundInsertDedupeResult } from "@/lib/import/ticket-uniqueness";

function formatSkippedTickets(
  skipped: InboundInsertDedupeResult["skipped"]
): string {
  const labels = skipped.map((item) => item.ticketNo).filter(Boolean);
  const shown = labels.slice(0, 5).join("、");
  return labels.length > 5 ? `${shown} 等` : shown;
}

async function finalizeInboundUpload(
  uploadId: string,
  insertedCount: number,
  skipped: InboundInsertDedupeResult["skipped"],
  parsedCount: number,
  recognizeDurationMs?: number
): Promise<{ success: boolean; error?: string }> {
  if (insertedCount === 0 && parsedCount > 0) {
    const detail = formatSkippedTickets(skipped);
    const message = detail
      ? `解析到 ${parsedCount} 条，均因磅单编号重复未导入：${detail}`
      : `解析到 ${parsedCount} 条，均因磅单编号重复未导入`;
    await updateUpload(uploadId, {
      status: "失败",
      progress: 100,
      resultCount: 0,
      errorMessage: message,
      recognizeDurationMs,
    });
    return { success: false, error: message };
  }

  let warning: string | undefined;
  if (skipped.length > 0) {
    const detail = formatSkippedTickets(skipped);
    warning = `已导入 ${insertedCount} 条，跳过重复 ${skipped.length} 条${detail ? `（${detail}）` : ""}`;
  }

  await updateUpload(uploadId, {
    status: "已完成",
    progress: 100,
    resultCount: insertedCount,
    errorMessage: warning,
    recognizeDurationMs,
  });
  return { success: true };
}

export type InboundUploadJob = {
  uploadId: string;
  kind: "excel" | "image";
  buffer: Buffer;
  mimeType: string;
  relativePath: string;
};

export async function processInboundUploadJob(
  job: InboundUploadJob
): Promise<{ success: boolean; error?: string }> {
  const { uploadId, kind, buffer, mimeType, relativePath } = job;
  const sourceFile = buildFileUrl(relativePath);
  const recognizeStartedAt = Date.now();
  try {
    await updateUpload(uploadId, {
      progress: 25,
      status: "处理中",
      recognizeStartedAt: new Date(recognizeStartedAt).toISOString(),
    });

    if (kind === "excel") {
      const rawRecords = parseInboundExcel(buffer, uploadId, sourceFile);
      await updateUpload(uploadId, { progress: 85 });
      const reviewCtx = rawRecords.map((row) => ({
        id: row.id,
        ticketNo: row.ticketNo,
      }));
      const records = rawRecords.map((row) =>
        applyInboundAutoReview(row, kind, {
          allInboundRecords: reviewCtx,
          recordId: row.id,
        })
      );
      const { inserted, skipped } = await addInboundRecords(records);
      await runAutoReview();
      return finalizeInboundUpload(
        uploadId,
        inserted.length,
        skipped,
        rawRecords.length,
        Date.now() - recognizeStartedAt
      );
    }

    const stopPulse = pulseUploadProgress(uploadId, 35, 82);
    let rawRecords;
    try {
      rawRecords = await parseInboundImage(buffer, mimeType, uploadId, sourceFile);
    } finally {
      stopPulse();
    }
    await updateUpload(uploadId, { progress: 88 });
    const reviewCtx = rawRecords!.map((row) => ({
      id: row.id,
      ticketNo: row.ticketNo,
    }));
    const records = rawRecords!.map((row) =>
      applyInboundAutoReview(row, kind, {
        allInboundRecords: reviewCtx,
        recordId: row.id,
      })
    );
    const { inserted, skipped } = await addInboundRecords(records);
    await runAutoReview();
    return finalizeInboundUpload(
      uploadId,
      inserted.length,
      skipped,
      records.length,
      Date.now() - recognizeStartedAt
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "入库单解析失败";
    await updateUpload(uploadId, {
      status: "失败",
      progress: 100,
      errorMessage: message,
      recognizeDurationMs: Date.now() - recognizeStartedAt,
    });
    return { success: false, error: message };
  }
}

export function enqueueInboundUploadJob(job: InboundUploadJob): void {
  setImmediate(() => {
    void processInboundUploadJob(job);
  });
}
