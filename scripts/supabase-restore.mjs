#!/usr/bin/env node
/**
 * 恢复已暂停的 Supabase 项目，并等待 API 域名可用。
 *
 * 用法：
 *   1. 打开 https://supabase.com/dashboard/account/tokens 创建 Access Token
 *   2. SUPABASE_ACCESS_TOKEN=xxx node scripts/supabase-restore.mjs
 *
 * 或在 Supabase 控制台手动点 Restore project 后，仅做连通性检测：
 *   node scripts/supabase-restore.mjs --check-only
 */

const PROJECT_REF = "vxwvfkyccuftdukupsrp";
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const HEALTH_URL = process.env.HEALTH_URL || "https://onetools.dev/api/health/storage";
const checkOnly = process.argv.includes("--check-only");

async function dnsReady() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(8000),
    });
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}

async function waitForDns(maxMinutes = 8) {
  const deadline = Date.now() + maxMinutes * 60 * 1000;
  process.stdout.write("等待 Supabase API 恢复");
  while (Date.now() < deadline) {
    if (await dnsReady()) {
      process.stdout.write("\n");
      return true;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  process.stdout.write("\n");
  return false;
}

async function resumeProject(token) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/resume`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`恢复请求失败 (${res.status}): ${body}`);
  }
  console.log("已发送 Restore 请求，等待项目启动…");
}

async function checkAppHealth() {
  const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  console.log("\n应用诊断结果:");
  console.log(JSON.stringify(data, null, 2));
  const ok =
    data.checks?.bucketExists === true && data.checks?.databaseOk === true;
  if (ok) {
    console.log("\n✅ 全部正常，可以上传单据了。");
    return 0;
  }
  if (data.checks?.bucketError?.includes?.("fetch failed")) {
    console.log("\n⚠️  仍无法连接 Supabase，请确认项目已 Restore 并等待 2～5 分钟。");
    return 1;
  }
  if (!data.checks?.databaseOk) {
    console.log(
      "\n⚠️  请在 Supabase SQL Editor 执行 supabase/schema.sql 创建 app_data 表。"
    );
    return 1;
  }
  if (!data.checks?.bucketExists) {
    console.log(
      "\n⚠️  请在 Supabase Storage 创建 Private bucket「uploads」。"
    );
    return 1;
  }
  return 1;
}

async function main() {
  if (!(await dnsReady())) {
    if (checkOnly) {
      console.error(
        `❌ ${SUPABASE_URL} 仍不可达（项目可能仍处于 Paused 状态）。`
      );
      console.error(
        "请打开 https://supabase.com/dashboard/project/" +
          PROJECT_REF +
          " 点击 Restore project。"
      );
      process.exit(1);
    }
    const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
    if (!token) {
      console.error("❌ Supabase 项目已暂停，API 域名不可解析。");
      console.error("");
      console.error("方式 A（推荐）：浏览器恢复");
      console.error(
        "  https://supabase.com/dashboard/project/" + PROJECT_REF
      );
      console.error("  登录后点击 Restore project，然后运行:");
      console.error("  node scripts/supabase-restore.mjs --check-only");
      console.error("");
      console.error("方式 B：命令行恢复");
      console.error(
        "  1. https://supabase.com/dashboard/account/tokens 创建 Access Token"
      );
      console.error(
        "  2. SUPABASE_ACCESS_TOKEN=xxx node scripts/supabase-restore.mjs"
      );
      process.exit(1);
    }
    await resumeProject(token);
  } else {
    console.log("✅ Supabase API 已可达。");
  }

  const ready = await waitForDns();
  if (!ready) {
    console.error("超时：DNS/API 仍未恢复，请稍后在控制台确认项目状态。");
    process.exit(1);
  }

  process.exit(await checkAppHealth());
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
