import type { VehicleSettlementRule } from "@/lib/types";

/** 车辆结算档案初始数据（与 Excel 主数据表一致，可通过「基础资料」页维护） */
export const DEFAULT_VEHICLE_SETTLEMENT_RULES: Omit<
  VehicleSettlementRule,
  "id" | "createdAt" | "updatedAt" | "settlementPrice" | "enabled"
>[] = [
  { plateNo: "川L81021", driverName: "车澎", payeeName: "刘坤贵", basePrice: 1290, priceDeduction: 35 },
  { plateNo: "川AJ595", driverName: "吴斌", payeeName: "吴斌", basePrice: 1290, priceDeduction: 40 },
  { plateNo: "川AJR738", driverName: "蒙进全", payeeName: "刘坤贵", basePrice: 1290, priceDeduction: 35 },
  { plateNo: "川L80327", driverName: "王明华", payeeName: "胡琼芳", basePrice: 1290, priceDeduction: 30 },
  { plateNo: "", driverName: "曹志兵", payeeName: "胡琼芳", basePrice: 1290, priceDeduction: 30 },
  { plateNo: "川LD1522", driverName: "何冬", payeeName: "胡琼芳", basePrice: 1310, priceDeduction: 30 },
  { plateNo: "川LC9015", driverName: "王军", payeeName: "吴绪洪", basePrice: 1310, priceDeduction: 40 },
  { plateNo: "川JA115", driverName: "赵世元", payeeName: "胡琼芳", basePrice: 1290, priceDeduction: 30 },
  { plateNo: "川L81728", driverName: "彭崇林", payeeName: "吴绪洪", basePrice: 1310, priceDeduction: 40 },
  { plateNo: "川LD6512", driverName: "张科", payeeName: "刘坤贵", basePrice: 1290, priceDeduction: 35 },
  { plateNo: "川L97677", driverName: "漆友谊", payeeName: "胡琼芳", basePrice: 1290, priceDeduction: 30 },
  { plateNo: "川T09758", driverName: "唐守伟", payeeName: "刘坤贵", basePrice: 1290, priceDeduction: 35 },
  { plateNo: "川L82588", driverName: "熊明江", payeeName: "胡琼芳", basePrice: 1310, priceDeduction: 30 },
  { plateNo: "川C32831", driverName: "雷冬", payeeName: "刘坤贵", basePrice: 1310, priceDeduction: 35 },
  { plateNo: "川LC0877", driverName: "秦兴伦", payeeName: "刘坤贵", basePrice: 1310, priceDeduction: 35 },
];
