import fs from "fs";
import { NextResponse } from "next/server";
import { getStore, getUploadFilePath } from "@/lib/db/store";
import { parseInboundExcelSheetPreview } from "@/lib/parsers/inbound-excel";

export async function GET(request: Request) {
  try {
    const uploadId = new URL(request.url).searchParams.get("uploadId")?.trim();
    if (!uploadId) {
      return NextResponse.json({ error: "缺少 uploadId" }, { status: 400 });
    }

    const upload = getStore().uploads.find((item) => item.id === uploadId);
    if (!upload?.storedPath) {
      return NextResponse.json({ error: "上传记录不存在" }, { status: 404 });
    }

    if (!/\.(xlsx|xls|csv)$/i.test(upload.storedPath)) {
      return NextResponse.json(
        { error: "仅支持 Excel 采购单预览" },
        { status: 400 }
      );
    }

    const absolutePath = getUploadFilePath(upload.storedPath);
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: "源文件不存在" }, { status: 404 });
    }

    const buffer = fs.readFileSync(absolutePath);
    const preview = parseInboundExcelSheetPreview(buffer);

    return NextResponse.json({
      uploadId,
      fileName: upload.name,
      ...preview,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "预览失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
