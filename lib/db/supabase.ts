import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_UPLOAD_BUCKET = "uploads";

let adminClient: SupabaseClient | null = null;

/** Vercel / Lambda 等无本地磁盘的环境 */
export function isServerlessEnv(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.VERCEL_ENV
  );
}

export function getSupabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
}

/** 服务端密钥：legacy service_role 或新版 secret key，不能用 publishable */
export function getSupabaseServiceRoleKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim()
  );
}

export function isSupabaseEnabled(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function assertRemoteStorageConfigured(action = "读写数据"): void {
  if (!isServerlessEnv() || isSupabaseEnabled()) return;
  throw new Error(
    `线上环境无法${action}：请在 Vercel 配置 SUPABASE_URL（或 NEXT_PUBLIC_SUPABASE_URL）和 SUPABASE_SERVICE_ROLE_KEY（或 SUPABASE_SECRET_KEY），保存后重新部署。`
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseEnabled()) {
    throw new Error(
      "Supabase 未配置，请设置 SUPABASE_URL（或 NEXT_PUBLIC_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY（或 SUPABASE_SECRET_KEY）"
    );
  }
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl()!, getSupabaseServiceRoleKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
