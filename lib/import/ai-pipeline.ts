import { autoConfirmEligibleMatches } from "@/lib/import/auto-confirm";
import { runAutoReviewOnStore } from "@/lib/import/run-auto-review";
import { syncAllVerifiedPayments } from "@/lib/import/payment-generation";
import { getStore } from "@/lib/db/store";

export type AiPipelineResult = {
  ok: boolean;
  error?: string;
  measureApproved?: number;
  inboundApproved?: number;
  autoConfirmed?: number;
  paymentsCreated?: number;
  measurePending?: number;
  inboundPending?: number;
  paymentSync?: { created: number; updated: number; removed: number };
};

/** 上传后一键：AI 审核 → 重建匹配 → 自动确认 → 付款明细 */
export async function runAiPipeline(): Promise<AiPipelineResult> {
  const review = await runAutoReviewOnStore(await getStore());
  if (!review.ok) {
    return { ok: false, error: review.error };
  }

  const autoConfirm = await autoConfirmEligibleMatches(await getStore(), "AI");
  const paymentSync = await syncAllVerifiedPayments();

  return {
    ok: true,
    measureApproved: review.measureApproved,
    inboundApproved: review.inboundApproved,
    autoConfirmed: autoConfirm.confirmed,
    paymentsCreated: autoConfirm.paymentsCreated,
    measurePending: review.measurePending,
    inboundPending: review.inboundPending,
    paymentSync: {
      created: paymentSync.created,
      updated: paymentSync.updated,
      removed: paymentSync.removed,
    },
  };
}
