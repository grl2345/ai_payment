import { NextResponse } from "next/server";
import {
  getSupabaseAdmin,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isServerlessEnv,
  isSupabaseEnabled,
  SUPABASE_UPLOAD_BUCKET,
} from "@/lib/db/supabase";

/** 检查存储配置（不暴露密钥内容） */
export async function GET() {
  const url = getSupabaseUrl();
  const key = getSupabaseServiceRoleKey();

  const base = {
    serverless: isServerlessEnv(),
    supabaseReady: isSupabaseEnabled(),
    bucketName: SUPABASE_UPLOAD_BUCKET,
    checks: {
      hasSupabaseUrl: Boolean(url),
      hasServiceRoleKey: Boolean(key),
      urlHost: url ? new URL(url).host : null,
      keyLength: key?.length ?? 0,
      bucketExists: false as boolean,
      databaseOk: false as boolean,
    },
  };

  if (!isSupabaseEnabled()) {
    return NextResponse.json({
      ...base,
      hint: "请在 Vercel 配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，勾选 Production 后 Redeploy",
    });
  }

  const supabase = getSupabaseAdmin();

  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  const bucketExists =
    !bucketError &&
    (buckets ?? []).some((b) => b.name === SUPABASE_UPLOAD_BUCKET);

  const { error: dbError } = await supabase
    .from("app_data")
    .select("key", { count: "exact", head: true });

  return NextResponse.json({
    ...base,
    checks: {
      ...base.checks,
      bucketExists,
      databaseOk: !dbError,
      bucketError: bucketError?.message ?? null,
      databaseError: dbError?.message ?? null,
      availableBuckets: (buckets ?? []).map((b) => b.name),
    },
    hint: !bucketExists
      ? `请在 Supabase → Storage 创建名为「${SUPABASE_UPLOAD_BUCKET}」的 Private bucket（与 API URL 同一项目）`
      : dbError
        ? "请在 Supabase SQL Editor 执行 supabase/schema.sql 创建 app_data 表"
        : "配置正常，可尝试上传文件",
  });
}
