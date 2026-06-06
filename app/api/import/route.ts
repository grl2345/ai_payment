import { NextResponse } from "next/server";
import {
  applyAiSuggestion,
  clearBusinessData,
  clearCompletedUploads,
  confirmTicketMatch,
  deleteUpload,
  getStore,
  rebuildMatches,
  voidTicketMatch,
} from "@/lib/db/store";
import type { DataStore } from "@/lib/types";
import { computeAiTodos } from "@/lib/import/ai-suggestions";
import {
  deleteVehicleSettlementRule,
  listVehicleSettlementRules,
  upsertVehicleSettlementRule,
} from "@/lib/db/vehicle-settlement-store";
import {
  countNeedsReview,
  getConfidenceThreshold,
  isAutoReviewEnabled,
  isExcelInboundAutoReviewEnabled,
  isInboundImageAutoReviewEnabled,
} from "@/lib/import/auto-review";
import { runAutoReview } from "@/lib/import/run-auto-review";
import { isVolcengineOcrEnabled } from "@/lib/parsers/measure-ocr";
import { autoConfirmEligibleMatches } from "@/lib/import/auto-confirm";
import { runAiPipeline } from "@/lib/import/ai-pipeline";
import {
  buildAiBatchVerifySnapshot,
  runAiBatchVerify,
} from "@/lib/import/ai-batch-verify";
import { computeDashboardStats } from "@/lib/import/dashboard-stats";
import { syncAllVerifiedPayments } from "@/lib/import/payment-generation";
import { prepareForAiTodos } from "@/lib/import/prepare-ai-todos";
import { verifyMeasureTicketOneClick } from "@/lib/import/verify-measure-ticket";

async function buildAiTodos(_store?: DataStore) {
  await prepareForAiTodos();
  const fresh = await getStore();
  return computeAiTodos({
    measureTickets: fresh.measureTickets,
    inboundRecords: fresh.inboundRecords,
    ticketMatches: fresh.ticketMatches,
    paymentDetails: fresh.paymentDetails ?? [],
    uploads: fresh.uploads,
    rules: await listVehicleSettlementRules(),
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const syncMatches = searchParams.get("syncMatches") === "true";
  const aiSnapshot = searchParams.get("aiSnapshot") === "true";

  if (syncMatches) {
    await rebuildMatches();
  }

  if (aiSnapshot) {
    const batch = await buildAiBatchVerifySnapshot();
    const store = await getStore();
    return NextResponse.json({
      batch,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
      ticketMatches: store.ticketMatches,
      paymentDetails: store.paymentDetails ?? [],
    });
  }

  const store = await getStore();
  const reviewStats = countNeedsReview(
    store.measureTickets,
    store.inboundRecords
  );
  return NextResponse.json({
    uploads: store.uploads,
    measureTickets: store.measureTickets,
    inboundRecords: store.inboundRecords,
    ticketMatches: store.ticketMatches,
    vehicleSettlementRules: await listVehicleSettlementRules(),
    paymentDetails: store.paymentDetails ?? [],
    dashboardStats: computeDashboardStats(store),
    aiTodos: await buildAiTodos(store),
    ocrProvider: isVolcengineOcrEnabled() ? "volcengine" : "tesseract",
    autoReview: {
      enabled: isAutoReviewEnabled(),
      confidenceThreshold: getConfidenceThreshold(),
      excelInboundAuto: isExcelInboundAutoReviewEnabled(),
      inboundImageAuto: isInboundImageAutoReviewEnabled(),
      ...reviewStats,
    },
  });
}

/** POST /api/import?autoReview=true | ?rebuildMatches=true */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const autoReview = searchParams.get("autoReview") === "true";
  const rebuildMatchesOnly = searchParams.get("rebuildMatches") === "true";
  const generatePayments = searchParams.get("generatePayments") === "true";
  const autoConfirm = searchParams.get("autoConfirm") === "true";
  const pipeline = searchParams.get("pipeline") === "true";
  const aiVerify = searchParams.get("aiVerify") === "true";
  const applySuggestion = searchParams.get("applySuggestion") === "true";
  const verifyMeasure = searchParams.get("verifyMeasure") === "true";

  if (verifyMeasure) {
    const body = await request.json().catch(() => ({}));
    const measureId =
      typeof body.measureId === "string" ? body.measureId.trim() : "";
    if (!measureId) {
      return NextResponse.json({ error: "缺少计量单 ID" }, { status: 400 });
    }
    const result = await verifyMeasureTicketOneClick(measureId);
    const store = await getStore();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      match: result.match,
      paymentCreated: result.paymentCreated,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
      ticketMatches: store.ticketMatches,
      paymentDetails: store.paymentDetails,
      aiTodos: await buildAiTodos(store),
      dashboardStats: computeDashboardStats(store),
    });
  }

  if (applySuggestion) {
    const body = await request.json().catch(() => ({}));
    const result = await applyAiSuggestion(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const store = await getStore();
    return NextResponse.json({
      success: true,
      ticketMatches: store.ticketMatches,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
      paymentDetails: store.paymentDetails,
      aiTodos: await buildAiTodos(store),
      dashboardStats: computeDashboardStats(store),
    });
  }

  if (aiVerify) {
    const batch = await runAiBatchVerify();
    const store = await getStore();
    if (!batch.ok) {
      return NextResponse.json({ error: batch.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      batch,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
      ticketMatches: store.ticketMatches,
      paymentDetails: store.paymentDetails,
      dashboardStats: computeDashboardStats(store),
    });
  }

  if (pipeline) {
    const result = await runAiPipeline();
    const store = await getStore();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      pipeline: result,
      ...store,
      ticketMatches: store.ticketMatches,
      paymentDetails: store.paymentDetails,
      dashboardStats: computeDashboardStats(store),
    });
  }

  if (autoConfirm) {
    const confirmResult = await autoConfirmEligibleMatches(undefined, "AI");
    const paymentSync = await syncAllVerifiedPayments();
    const store = await getStore();
    return NextResponse.json({
      success: true,
      autoConfirm: confirmResult,
      paymentSync,
      paymentDetails: store.paymentDetails,
      ticketMatches: store.ticketMatches,
    });
  }

  if (generatePayments) {
    const paymentSync = await syncAllVerifiedPayments();
    const store = await getStore();
    return NextResponse.json({
      success: true,
      paymentSync,
      paymentDetails: store.paymentDetails,
    });
  }

  if (rebuildMatchesOnly) {
    await rebuildMatches();
    const store = await getStore();
    const ticketMatches = store.ticketMatches;
    return NextResponse.json({
      success: true,
      total: ticketMatches.length,
      matched: ticketMatches.filter((m) => m.matchStatus === "匹配成功").length,
      linked: ticketMatches.filter((m) => m.inboundRecordId).length,
      exception: ticketMatches.filter(
        (m) =>
          m.matchStatus === "核对异常" ||
          m.matchStatus === "待匹配" ||
          m.matchStatus === "疑似匹配"
      ).length,
      ticketMatches,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
    });
  }

  if (!autoReview) {
    return NextResponse.json({ error: "无效请求" }, { status: 400 });
  }

  const result = await runAutoReview();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    measureApproved: result.measureApproved,
    inboundApproved: result.inboundApproved,
    inboundReopened: result.inboundReopened,
    measurePending: result.measurePending,
    inboundPending: result.inboundPending,
    measureAi: result.measureAi,
    inboundAi: result.inboundAi,
  });
}

/** PATCH /api/import — 单据核对：确认/作废匹配 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();

    if (body.resource === "vehicleSettlement") {
      const action = body.action;
      if (action === "upsert") {
        const rule = await upsertVehicleSettlementRule(body.item ?? body);
        return NextResponse.json({ success: true, rule });
      }
      if (action === "delete") {
        const ruleId = typeof body.id === "string" ? body.id : "";
        if (!ruleId) {
          return NextResponse.json({ error: "缺少档案 ID" }, { status: 400 });
        }
        const ok = await deleteVehicleSettlementRule(ruleId);
        if (!ok) {
          return NextResponse.json({ error: "记录不存在" }, { status: 404 });
        }
        return NextResponse.json({ success: true });
      }
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    const id = typeof body.id === "string" ? body.id : "";
    const action = body.action;

    if (!id) {
      return NextResponse.json({ error: "缺少匹配记录 ID" }, { status: 400 });
    }

    if (action === "confirm") {
      const match = await confirmTicketMatch(id, body.confirmedBy ?? "用户");
      if (!match) {
        return NextResponse.json({ error: "记录不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true, match });
    }

    if (action === "void") {
      const match = await voidTicketMatch(id);
      if (!match) {
        return NextResponse.json({ error: "记录不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true, match });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clearCompleted = searchParams.get("completed") === "true";
  const reset = searchParams.get("reset") === "true";

  if (reset) {
    await clearBusinessData();
    const store = await getStore();
    return NextResponse.json({
      success: true,
      uploads: store.uploads,
      measureTickets: store.measureTickets,
      inboundRecords: store.inboundRecords,
      ticketMatches: store.ticketMatches,
      paymentDetails: store.paymentDetails ?? [],
      dashboardStats: computeDashboardStats(store),
      aiTodos: await buildAiTodos(store),
    });
  }

  if (clearCompleted) {
    const count = await clearCompletedUploads();
    return NextResponse.json({ success: true, cleared: count });
  }

  if (!id) {
    return NextResponse.json({ error: "缺少上传记录 ID" }, { status: 400 });
  }

  const success = await deleteUpload(id);
  if (!success) {
    return NextResponse.json({ error: "上传记录不存在" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
