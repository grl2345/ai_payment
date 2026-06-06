import { NextResponse } from "next/server";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isServerlessEnv,
  isSupabaseEnabled,
} from "@/lib/db/supabase";

/** 检查存储配置（不暴露密钥内容） */
export async function GET() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  return NextResponse.json({
    serverless: isServerlessEnv(),
    supabaseReady: isSupabaseEnabled(),
    checks: {
      hasSupabaseUrl: Boolean(url),
      hasServiceRoleKey: Boolean(key),
      urlHost: url ? new URL(url).host : null,
      keyLength: key?.length ?? 0,
    },
    hint: isSupabaseEnabled()
      ? "配置正常，可尝试上传文件"
      : "请在 Vercel → Settings → Environment Variables 添加 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，勾选 Production 后 Redeploy",
  });
}
