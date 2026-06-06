import {
  addMeasureTicket,
  generateId,
  nowString,
  updateMeasureTicket,
  updateUpload,
} from "@/lib/db/store";
import { pulseUploadProgress } from "@/lib/import/upload-progress";
import { runAutoReview } from "@/lib/import/run-auto-review";
import { recognizeMeasureImage } from "@/lib/parsers/measure-ocr";
import { buildFileUrl } from "@/lib/utils";

export type MeasureUploadJob = {
  uploadId: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  relativePath: string;
};

export async function processMeasureUploadJob(job: MeasureUploadJob): Promise<{
  success: boolean;
  error?: string;
}> {
  const { uploadId, buffer, mimeType, relativePath } = job;
  try {
    updateUpload(uploadId, { progress: 25, status: "处理中" });

    // 先插入占位 ticket，让前端立即看到「识别中」状态
    const placeholderId = generateId("MT");
    const imageUrl = buildFileUrl(relativePath);
    addMeasureTicket({
      id: placeholderId,
      uploadId,
      ticketNo: "",
      plateNo: "",
      driverName: "",
      supplierName: "",
      materialName: "",
      materialType: "",
      sourceArea: "",
      unloadPlace: "",
      location: "",
      grossWeight: 0,
      tareWeight: 0,
      netWeight: 0,
      deductWeight: 0,
      actualWeight: 0,
      grossTime: "",
      tareTime: "",
      imagePath: imageUrl,
      ocrStatus: "识别中",
      confidence: 0,
      createdAt: nowString(),
      updatedAt: nowString(),
    });

    const stopPulse = pulseUploadProgress(uploadId, 35, 82);
    let ticket;
    try {
      ticket = await recognizeMeasureImage(
        buffer,
        uploadId,
        imageUrl,
        mimeType
      );
    } finally {
      stopPulse();
    }
    updateUpload(uploadId, { progress: 90 });

    // 用识别结果替换占位 ticket（保持相同 id 避免重复）
    updateMeasureTicket(placeholderId, { ...ticket, id: placeholderId });

    // 若磅单号重复（另一条真实 ticket 已存在），视为成功更新完毕
    updateUpload(uploadId, {
      status: "已完成",
      progress: 100,
      resultCount: 1,
    });
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "计量单识别失败";
    updateUpload(uploadId, {
      status: "失败",
      progress: 100,
      errorMessage: message,
    });
    return { success: false, error: message };
  }
}

export function enqueueMeasureUploadJobs(jobs: MeasureUploadJob[]): void {
  if (jobs.length === 0) return;
  setImmediate(() => {
    void (async () => {
      for (const job of jobs) {
        await processMeasureUploadJob(job);
      }
      runAutoReview();
    })();
  });
}
