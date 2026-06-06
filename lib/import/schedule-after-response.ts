import { after } from "next/server";

/**
 * Vercel Serverless 在 HTTP 响应结束后会冻结实例，setImmediate 后台任务不会执行。
 * 使用 Next.js after() 在响应返回后继续跑 OCR 等耗时任务。
 */
export function scheduleAfterResponse(task: () => Promise<void>) {
  after(task);
}
