import { getStore } from "@/lib/db/store";
import { autoConfirmEligibleMatches } from "@/lib/import/auto-confirm";
import { isAutoReviewEnabled } from "@/lib/import/auto-review";
import { syncAllVerifiedPayments } from "@/lib/import/payment-generation";
import { runAutoReviewOnStore } from "@/lib/import/run-auto-review";

/**
 * 构建 AI 待办前：自动审核 → 自动确认（六项通过且有档案）→ 付款明细对齐。
 */
export async function prepareForAiTodos() {
  if (isAutoReviewEnabled()) {
    await runAutoReviewOnStore(await getStore());
    return;
  }
  await autoConfirmEligibleMatches(undefined, "AI");
  await syncAllVerifiedPayments();
}
