import path from "path";
import { NextResponse } from "next/server";
import { saveUploadFile } from "@/lib/db/file-storage";
import {
  addUpload,
  buildInboundStoragePath,
  deleteInboundRecord,
  generateId,
  getStore,
  nowString,
} from "@/lib/db/store";
import {
  enqueueInboundUploadJob,
  processInboundUploadJob,
} from "@/lib/import/process-inbound-upload";
import {
  getInboundRecordById,
  patchInboundRecord,
} from "@/lib/import/inbound-update";

const EXCEL_EXT = new Set([".xlsx", ".xls", ".csv"]);
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function resolveInboundKind(file: File): "excel" | "image" | null {
  const ext = path.extname(file.name).toLowerCase();
  if (EXCEL_EXT.has(ext)) return "excel";
  if (IMAGE_EXT.has(ext)) return "image";
  const mime = file.type?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  return null;
}

export async function POST(request: Request) {
  try {
    const asyncMode =
      new URL(request.url).searchParams.get("async") === "true";
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择入库单文件" }, { status: 400 });
    }

    const kind = resolveInboundKind(file);
    if (!kind) {
      return NextResponse.json(
        { error: "支持 Excel（XLSX/XLS/CSV）或图片截图（JPG/PNG/WEBP）" },
        { status: 400 }
      );
    }

    const ext =
      path.extname(file.name).toLowerCase() ||
      (kind === "image" ? ".jpg" : ".xlsx");
    const uploadId = generateId("UP");
    const storedName = `${uploadId}${ext}`;
    const relativePath = buildInboundStoragePath(storedName);
    const buffer = Buffer.from(await file.arrayBuffer());

    await saveUploadFile(relativePath, buffer);

    await addUpload({
      id: uploadId,
      name: file.name,
      type: kind === "image" ? "inbound-image" : "excel",
      size: file.size,
      status: "处理中",
      progress: 20,
      uploadTime: nowString(),
      storedPath: relativePath,
    });

    const job = {
      uploadId,
      kind,
      buffer,
      mimeType: file.type || "image/jpeg",
      relativePath,
    };

    if (asyncMode) {
      enqueueInboundUploadJob(job);
      return NextResponse.json({
        async: true,
        uploadId,
        source: kind,
        fileName: file.name,
      });
    }

    const outcome = await processInboundUploadJob(job);
    if (!outcome.success) {
      return NextResponse.json({ error: outcome.error }, { status: 422 });
    }

    const store = await getStore();
    const records = store.inboundRecords.filter((r) => r.uploadId === uploadId);
    const aiApproved = records.filter((r) => r.reviewSource === "ai").length;

    return NextResponse.json({
      success: true,
      count: records.length,
      source: kind,
      aiApproved,
      needsReview: records.length - aiApproved,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少入库单 ID" }, { status: 400 });
  }
  const record = await getInboundRecordById(id);
  if (!record) {
    return NextResponse.json({ error: "入库单不存在" }, { status: 404 });
  }
  return NextResponse.json({ record });
}

export async function PATCH(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "缺少入库单 ID" }, { status: 400 });
    }
    const body = await request.json();
    const result = await patchInboundRecord(id, body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, record: result.record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少入库单 ID" }, { status: 400 });
  }
  const success = await deleteInboundRecord(id);
  if (!success) {
    return NextResponse.json({ error: "入库单不存在" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
