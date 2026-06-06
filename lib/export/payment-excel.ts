import * as XLSX from "xlsx";
import type { PaymentDetail } from "@/lib/types";

export type PaymentExcelRow = {
  时间: string;
  磅单号: string;
  车牌: string;
  司机: string;
  收款人: string;
  供应商: string;
  结算基础: number;
  单价截留: number;
  结算价: number;
  绝干重量: number;
  永丰应支付: number;
  精竹支付: number;
  毛利润: number;
  是否支付: string;
  已付金额: number;
  发票状态: string;
  备注: string;
};

export function paymentToExcelRow(payment: PaymentDetail): PaymentExcelRow {
  return {
    时间: payment.businessDate,
    磅单号: payment.ticketNo,
    车牌: payment.plateNo,
    司机: payment.driverName,
    收款人: payment.payeeName,
    供应商: payment.supplierName,
    结算基础: payment.basePrice,
    单价截留: payment.priceDeduction,
    结算价: payment.settlementPrice,
    绝干重量: Number(payment.dryWeight.toFixed(3)),
    永丰应支付: Number(payment.receivableAmount.toFixed(2)),
    精竹支付: Number(payment.payableAmount.toFixed(2)),
    毛利润: Number(payment.grossProfit.toFixed(2)),
    是否支付: payment.paymentStatus,
    已付金额: Number(payment.paidAmount.toFixed(2)),
    发票状态: payment.invoiceStatus,
    备注: payment.remark ?? "",
  };
}

function defaultExportFileName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `付款明细_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}

/** 在浏览器中下载付款明细 Excel（仅导出传入列表，通常为当前筛选结果） */
export function downloadPaymentDetailsExcel(
  payments: PaymentDetail[],
  fileName = defaultExportFileName()
) {
  const rows = payments.map(paymentToExcelRow);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "付款明细");

  const colWidths = [
    { wch: 12 },
    { wch: 18 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
  ];
  worksheet["!cols"] = colWidths;

  XLSX.writeFile(workbook, fileName);
}
