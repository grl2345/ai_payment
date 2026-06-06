import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getUploadFilePath } from "@/lib/db/store";

const contentTypeMap: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const relativePath = searchParams.get("path")?.replace(/\\/g, "/") ?? "";

  if (
    !relativePath ||
    relativePath.includes("..") ||
    !relativePath.startsWith("uploads/")
  ) {
    return NextResponse.json({ error: "非法文件路径" }, { status: 400 });
  }

  const absolutePath = getUploadFilePath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = contentTypeMap[ext] ?? "application/octet-stream";
  const buffer = fs.readFileSync(absolutePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
