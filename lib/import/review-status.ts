import type { InboundReviewStatus, OcrStatus } from "@/lib/types";

export function getReviewStatusBadgeClass(
  status: OcrStatus | InboundReviewStatus
) {
  switch (status) {
    case "已审核":
      return "bg-success/20 text-success";
    case "识别失败":
      return "bg-destructive/20 text-destructive";
    case "待审核":
      return "bg-warning/20 text-warning-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function isInboundSourcePreviewable(sourceFile: string) {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(sourceFile);
}

export function isInboundExcelSource(sourceFile: string) {
  return /\.(xlsx|xls|csv)(\?|$)/i.test(sourceFile);
}
