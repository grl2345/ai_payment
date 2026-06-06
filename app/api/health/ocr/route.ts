import { NextResponse } from "next/server";
import { isServerlessEnv } from "@/lib/db/supabase";
import {
  getMeasureMaxOutputTokens,
  isVolcengineOcrEnabled,
} from "@/lib/parsers/volcengine-vision";

const DEFAULT_MODEL = "doubao-seed-2-0-pro-260215";
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

/** 检查 OCR / 大模型配置（不暴露密钥内容） */
export async function GET() {
  const apiKey = process.env.ARK_API_KEY?.trim();
  const model = process.env.ARK_VISION_MODEL?.trim() || DEFAULT_MODEL;
  const baseURL = process.env.ARK_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const thinkingType = process.env.ARK_THINKING_TYPE?.trim() || "disabled";
  const volcengineReady = isVolcengineOcrEnabled();
  const ocrProvider = volcengineReady ? "volcengine" : "tesseract";

  let baseUrlHost: string | null = null;
  try {
    baseUrlHost = new URL(baseURL).host;
  } catch {
    baseUrlHost = null;
  }

  const hint = !apiKey
    ? "未配置 ARK_API_KEY，线上将使用 Tesseract（极慢且易超时）。请在 Vercel → Environment Variables 添加 ARK_API_KEY，勾选 Production 后 Redeploy"
    : !baseUrlHost
      ? "ARK_BASE_URL 格式无效，请使用 https://ark.cn-beijing.volces.com/api/v3"
      : ocrProvider === "volcengine"
        ? "火山方舟 OCR 已就绪。上传后界面应显示「火山识别」，单张约 20–60 秒"
        : "配置异常，请检查 ARK_API_KEY";

  return NextResponse.json({
    serverless: isServerlessEnv(),
    ocrProvider,
    volcengineReady,
    checks: {
      hasArkApiKey: Boolean(apiKey),
      apiKeyLength: apiKey?.length ?? 0,
      model,
      baseUrlHost,
      thinkingType,
      maxOutputTokensMeasure: getMeasureMaxOutputTokens(),
    },
    hint,
  });
}
