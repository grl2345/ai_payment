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

/** 安全解析 fetch 响应，避免 Vercel 超时/413 等纯文本导致 JSON 解析报错 */
export async function parseFetchJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (/request exceeded|timeout|timed out/i.test(text)) {
      throw new Error(
        "服务器处理超时，请稍后刷新重试（若频繁出现需升级 Vercel Pro 以支持更长执行时间）"
      );
    }
    if (/request entity too large|payload too large|413/i.test(text)) {
      throw new Error("上传文件过大，请压缩图片后重试");
    }
    const snippet = text.trim().slice(0, 60);
    throw new Error(
      snippet ? `服务器响应异常：${snippet}` : "服务器响应异常，请刷新后重试"
    );
  }
}
