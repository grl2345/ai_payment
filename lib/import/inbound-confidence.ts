import { scoreInboundImageRecord } from "@/lib/import/auto-review";
import type { InboundRecord } from "@/lib/types";

/** 列表展示用置信度：优先 OCR 返回值，否则按字段完整度推算 */
export function getInboundDisplayConfidence(record: InboundRecord): number | null {
  if (record.ocrConfidence != null && record.ocrConfidence > 0) {
    return Math.round(record.ocrConfidence);
  }
  if (record.reviewSource === "ai" && record.reviewStatus === "已审核") {
    return 100;
  }
  const { score } = scoreInboundImageRecord(record);
  return score > 0 ? score : null;
}
