import path from "path";
import { NextResponse } from "next/server";

import { saveUploadFile } from "@/lib/db/file-storage";
import {
  addUpload,
  buildMeasureStoragePath,
  deleteMeasureTicket,
  generateId,
  getStore,
  nowString,
} from "@/lib/db/store";
import type { MeasureTicket, UploadedFileRecord } from "@/lib/types";
import {
  enqueueMeasureUploadJobs,
  processMeasureUploadJob,
  type MeasureUploadJob,
} from "@/lib/import/process-measure-upload";
import {
  getMeasureTicketById,
  patchMeasureTicket,
} from "@/lib/import/measure-update";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function isAllowedMeasureImage(file: File): boolean {
  if (file.type && ALLOWED_TYPES.has(file.type.toLowerCase())) return true;
  const ext = path.extname(file.name).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

export async function POST(request: Request) {
  try {
    const asyncMode =
      new URL(request.url).searchParams.get("async") === "true";
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((item) => item instanceof File) as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "请选择要上传的计量单图片" }, { status: 400 });
    }

    if (files.length > 50) {
      return NextResponse.json({ error: "单次最多上传 50 张图片" }, { status: 400 });
    }

    const rejected: { fileName: string; error: string }[] = [];
    const jobs: MeasureUploadJob[] = [];
    const queued: { uploadId: string; fileName: string }[] = [];
    const results: {
      fileName: string;
      success: boolean;
      error?: string;
      upload?: UploadedFileRecord;
      ticket?: MeasureTicket;
    }[] = [];

    for (const file of files) {
      if (!isAllowedMeasureImage(file)) {
        rejected.push({
          fileName: file.name,
          error: "仅支持 JPG、PNG、JPEG、WEBP 格式",
        });
        results.push({
          fileName: file.name,
          success: false,
          error: "仅支持 JPG、PNG、JPEG、WEBP 格式",
        });
        continue;
      }

      const uploadId = generateId("UP");
      const ext = path.extname(file.name) || ".jpg";
      const storedName = `${uploadId}${ext}`;
      const relativePath = buildMeasureStoragePath(storedName);
      const buffer = Buffer.from(await file.arrayBuffer());

      await saveUploadFile(relativePath, buffer);

      const uploadRecord = await addUpload({
        id: uploadId,
        name: file.name,
        type: "image",
        size: file.size,
        status: "处理中",
        progress: 15,
        uploadTime: nowString(),
        storedPath: relativePath,
      });

      const job: MeasureUploadJob = {
        uploadId,
        fileName: file.name,
        buffer,
        mimeType: file.type || "image/jpeg",
        relativePath,
      };

      if (asyncMode) {
        jobs.push(job);
        queued.push({ uploadId, fileName: file.name });
      } else {
        const outcome = await processMeasureUploadJob(job);
        const store = await getStore();
        const upload = store.uploads.find((u) => u.id === uploadId) ?? uploadRecord;
        const ticket = store.measureTickets.find((t) => t.uploadId === uploadId);
        results.push({
          fileName: file.name,
          success: outcome.success,
          error: outcome.error,
          upload,
          ticket,
        });
      }
    }

    if (asyncMode) {
      enqueueMeasureUploadJobs(jobs);
      return NextResponse.json({
        async: true,
        total: files.length,
        queued: queued.length,
        uploadIds: queued.map((item) => item.uploadId),
        queuedFiles: queued,
        rejected,
      });
    }

    const successCount = results.filter((item) => item.success).length;
    return NextResponse.json({
      success: successCount > 0,
      total: files.length,
      successCount,
      results,
      rejected,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少计量单 ID" }, { status: 400 });
  }
  const ticket = await getMeasureTicketById(id);
  if (!ticket) {
    return NextResponse.json({ error: "计量单不存在" }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}

export async function PATCH(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少计量单 ID" }, { status: 400 });
    }
    const body = await request.json();
    const result = await patchMeasureTicket(id, body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, ticket: result.ticket });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少计量单 ID" }, { status: 400 });
  }
  const success = await deleteMeasureTicket(id);
  if (!success) {
    return NextResponse.json({ error: "计量单不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
