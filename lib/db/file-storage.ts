import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/db/data-files";
import {
  assertRemoteStorageConfigured,
  getSupabaseAdmin,
  isSupabaseEnabled,
  SUPABASE_UPLOAD_BUCKET,
} from "@/lib/db/supabase";

export function normalizeStoragePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}

function localAbsolutePath(relativePath: string): string {
  return path.join(DATA_DIR, normalizeStoragePath(relativePath));
}

export async function saveUploadFile(
  relativePath: string,
  buffer: Buffer
): Promise<void> {
  const normalized = normalizeStoragePath(relativePath);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from(SUPABASE_UPLOAD_BUCKET)
      .upload(normalized, buffer, { upsert: true, contentType: guessContentType(normalized) });
    if (error) {
      const msg = error.message;
      if (msg.includes("fetch failed")) {
        throw new Error(
          "文件上传失败：无法连接 Supabase，请打开 Supabase 控制台确认项目未暂停（Paused），点击 Restore project 后重试"
        );
      }
      if (msg === "Not Found" || msg.includes("Bucket not found")) {
        throw new Error(
          `文件上传失败：Supabase Storage 中找不到 bucket「${SUPABASE_UPLOAD_BUCKET}」，请在 Supabase → Storage 创建同名 Private bucket（须与 API URL 同一项目）`
        );
      }
      throw new Error(`文件上传失败: ${msg}`);
    }
    return;
  }
  assertRemoteStorageConfigured("保存上传文件");
  const absolute = localAbsolutePath(normalized);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);
}

export async function readUploadFile(
  relativePath: string
): Promise<Buffer | null> {
  const normalized = normalizeStoragePath(relativePath);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(SUPABASE_UPLOAD_BUCKET)
      .download(normalized);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  const absolute = localAbsolutePath(normalized);
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute);
}

export async function deleteUploadFile(relativePath: string): Promise<void> {
  const normalized = normalizeStoragePath(relativePath);
  if (isSupabaseEnabled()) {
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(SUPABASE_UPLOAD_BUCKET).remove([normalized]);
    return;
  }
  const absolute = localAbsolutePath(normalized);
  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
}

export async function uploadFileExists(relativePath: string): Promise<boolean> {
  const normalized = normalizeStoragePath(relativePath);
  if (isSupabaseEnabled()) {
    const buffer = await readUploadFile(normalized);
    return buffer !== null;
  }
  return fs.existsSync(localAbsolutePath(normalized));
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".csv": "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}
