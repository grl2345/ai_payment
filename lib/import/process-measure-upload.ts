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
import { scheduleAfterResponse } from "@/lib/import/schedule-after-response";
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
    await updateUpload(uploadId, { progress: 25, status: "处理中" });

    const placeholderId = generateId("MT");
    const imageUrl = buildFileUrl(relativePath);
    await addMeasureTicket({
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
    await updateUpload(uploadId, { progress: 90 });

    await updateMeasureTicket(placeholderId, { ...ticket, id: placeholderId });

    await updateUpload(uploadId, {
      status: "已完成",
      progress: 100,
      resultCount: 1,
    });
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "计量单识别失败";
    await updateUpload(uploadId, {
      status: "失败",
      progress: 100,
      errorMessage: message,
    });
    return { success: false, error: message };
  }
}

export function enqueueMeasureUploadJobs(jobs: MeasureUploadJob[]): void {
  if (jobs.length === 0) return;
  scheduleAfterResponse(async () => {
    for (const job of jobs) {
      await processMeasureUploadJob(job);
    }
    await runAutoReview();
  });
}
