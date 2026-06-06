#!/usr/bin/env node
/**
 * 初始化 Supabase：检查连通性、创建 uploads bucket、校验 app_data 表。
 * 用法：pnpm setup:supabase
 * 需环境变量：SUPABASE_URL（或 NEXT_PUBLIC_SUPABASE_URL）+ SUPABASE_SERVICE_ROLE_KEY
 */
import dns from "node:dns/promises";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BUCKET = "uploads";
const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

if (!url || !key) {
  fail(
    "缺少 SUPABASE_URL（或 NEXT_PUBLIC_SUPABASE_URL）与 SUPABASE_SERVICE_ROLE_KEY（或 SUPABASE_SECRET_KEY）。\n" +
      "本地可先执行：npx vercel env pull .env.vercel --yes && set -a && source .env.vercel && set +a"
  );
}

let host;
try {
  host = new URL(url).host;
} catch {
  fail(`SUPABASE_URL 格式无效：${url}`);
}

console.log(`\n检查 Supabase 项目：${host}\n`);

try {
  await dns.lookup(host);
  ok(`DNS 解析正常：${host}`);
} catch {
  fail(
    `无法解析 ${host}。\n` +
      "请打开 https://supabase.com/dashboard ：\n" +
      "  1. 若项目显示 Paused → 点击 Restore project\n" +
      "  2. 若项目已删除 → 新建项目，并在 Vercel 更新 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 后重新部署"
  );
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: buckets, error: bucketListError } =
  await supabase.storage.listBuckets();
if (bucketListError) {
  if (bucketListError.message.includes("fetch failed")) {
    fail(
      "API 连接失败（fetch failed）。项目可能仍在恢复中，请等待 1～2 分钟后重试，或确认 URL/密钥来自同一 Supabase 项目。"
    );
  }
  fail(`列出 Storage bucket 失败：${bucketListError.message}`);
}

const hasBucket = (buckets ?? []).some((b) => b.name === BUCKET);
if (hasBucket) {
  ok(`Storage bucket「${BUCKET}」已存在`);
} else {
  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });
  if (createError) {
    fail(`创建 bucket「${BUCKET}」失败：${createError.message}`);
  }
  ok(`已创建 Storage bucket「${BUCKET}」（Private）`);
}

const { error: dbError } = await supabase
  .from("app_data")
  .select("key", { count: "exact", head: true });

if (dbError) {
  const schemaPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "supabase",
    "schema.sql"
  );
  console.log("\n⚠️  数据库表 app_data 尚未创建。");
  console.log("请在 Supabase Dashboard → SQL Editor 中执行以下文件内容：");
  console.log(`   ${schemaPath}\n`);
  console.log(readFileSync(schemaPath, "utf-8"));
  process.exit(1);
}

ok("数据库表 app_data 可访问");
console.log("\n🎉 Supabase 已就绪，可在 Vercel 重新部署后上传文件。\n");
