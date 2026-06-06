import { writeSplitStoreKey } from "@/lib/db/data-files";
import { getStore } from "@/lib/db/store";
import type { PaymentDetail, PaymentStatus } from "@/lib/types";

export async function listPaymentDetails(): Promise<PaymentDetail[]> {
  return (await getStore()).paymentDetails ?? [];
}

export async function updatePaymentStatus(
  id: string,
  patch: Partial<Pick<PaymentDetail, "paymentStatus" | "paidAmount" | "paidDate" | "invoiceStatus" | "invoiceAmount" | "invoiceDate">>
): Promise<PaymentDetail | null> {
  const store = await getStore();
  const idx = store.paymentDetails.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  store.paymentDetails[idx] = {
    ...store.paymentDetails[idx],
    ...patch,
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
  };
  await writeSplitStoreKey("paymentDetails", store.paymentDetails);
  return store.paymentDetails[idx];
}

export async function markPaymentPaid(id: string, paidAmount?: number) {
  const store = await getStore();
  const payment = store.paymentDetails.find((p) => p.id === id);
  if (!payment) return null;
  const amount = paidAmount ?? payment.payableAmount;
  return updatePaymentStatus(id, {
    paymentStatus: "已支付" as PaymentStatus,
    paidAmount: amount,
    paidDate: new Date().toLocaleString("zh-CN", { hour12: false }).split(" ")[0],
  });
}
