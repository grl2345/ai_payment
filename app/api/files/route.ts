import path from "path";
import { NextResponse } from "next/server";
import { readUploadFile } from "@/lib/db/file-storage";

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

  const buffer = await readUploadFile(relativePath);
  if (!buffer) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  const ext = path.extname(relativePath).toLowerCase();
  const contentType = contentTypeMap[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
