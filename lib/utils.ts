import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildFileUrl(storedPath: string) {
  const normalized = storedPath.replace(/\\/g, "/");
  return `/api/files?path=${encodeURIComponent(normalized)}`;
}

export function normalizeFileUrl(fileUrl: string) {
  if (fileUrl.startsWith("/api/files?path=")) {
    return fileUrl;
  }
  const legacyMatch = fileUrl.match(/^\/api\/files\/(.+)$/);
  if (legacyMatch) {
    return buildFileUrl(decodeURIComponent(legacyMatch[1]));
  }
  return fileUrl;
}
