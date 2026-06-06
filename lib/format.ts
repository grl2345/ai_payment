import type { InvoiceStatus, MatchStatus, PaymentStatus } from "@/lib/types";

export type { MatchStatus, PaymentStatus, InvoiceStatus } from "@/lib/types";

export function formatAmount(amount: number): string {
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatWeight(weight: number, unit: "kg" | "ton" = "ton"): string {
  if (unit === "kg") {
    return `${weight.toLocaleString("zh-CN")} KG`;
  }
  return (
    weight.toLocaleString("zh-CN", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }) + " 吨"
  );
}

export function getStatusColor(
  status: MatchStatus | PaymentStatus | InvoiceStatus | string
): string {
  const colors: Record<string, string> = {
    待识别: "bg-muted text-muted-foreground",
    待审核: "bg-warning/20 text-warning-foreground",
    已审核: "bg-success/20 text-success",
    识别失败: "bg-destructive/20 text-destructive",
    待匹配: "bg-warning/20 text-warning-foreground",
    匹配成功: "bg-success/20 text-success",
    疑似匹配: "bg-warning/20 text-warning-foreground",
    核对异常: "bg-destructive/20 text-destructive",
    已确认: "bg-primary/20 text-primary",
    已作废: "bg-muted text-muted-foreground",
    未支付: "bg-destructive/20 text-destructive",
    部分支付: "bg-warning/20 text-warning-foreground",
    已支付: "bg-success/20 text-success",
    暂缓支付: "bg-muted text-muted-foreground",
    未开票: "bg-muted text-muted-foreground",
    已开票: "bg-success/20 text-success",
    部分开票: "bg-warning/20 text-warning-foreground",
    无需发票: "bg-muted text-muted-foreground",
  };
  return colors[status] || "bg-muted text-muted-foreground";
}
