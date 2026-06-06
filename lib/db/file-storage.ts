import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/db/data-files";

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
  const absolute = localAbsolutePath(normalizeStoragePath(relativePath));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, buffer);
}

export async function readUploadFile(
  relativePath: string
): Promise<Buffer | null> {
  const absolute = localAbsolutePath(normalizeStoragePath(relativePath));
  if (!fs.existsSync(absolute)) return null;
  return fs.readFileSync(absolute);
}

export async function deleteUploadFile(relativePath: string): Promise<void> {
  const absolute = localAbsolutePath(normalizeStoragePath(relativePath));
  if (fs.existsSync(absolute)) {
    fs.unlinkSync(absolute);
  }
}

export async function uploadFileExists(relativePath: string): Promise<boolean> {
  return fs.existsSync(localAbsolutePath(normalizeStoragePath(relativePath)));
}
