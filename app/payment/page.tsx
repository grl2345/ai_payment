import { Suspense } from "react";
import { Header } from "@/components/header";
import { PaymentPanel } from "@/components/operations/payment-panel";
import { Loader2 } from "lucide-react";

export default function PaymentPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="付款台账"
        description="核对通过后的应付金额、待支付和毛利明细。"
        eyebrow="结算结果"
      />
      <div className="flex-1 overflow-auto bg-[#f7f8f6] p-3 sm:p-4 dark:bg-muted/15">
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          }
        >
          <PaymentPanel embedded />
        </Suspense>
      </div>
    </div>
  );
}
