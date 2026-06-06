export type MatchStatus =
  | "待识别"
  | "待匹配"
  | "匹配成功"
  | "疑似匹配"
  | "核对异常"
  | "已确认"
  | "已作废";

export type PaymentStatus = "未支付" | "部分支付" | "已支付" | "暂缓支付";

export type InvoiceStatus = "未开票" | "已开票" | "部分开票" | "无需发票";

export type UploadStatus = "待处理" | "处理中" | "已完成" | "失败";

export type OcrStatus =
  | "待识别"
  | "识别中"
  | "待审核"
  | "已审核"
  | "识别失败";

/** 入库单审核状态 */
export type InboundReviewStatus = "待审核" | "已审核";

/** 审核来源：AI 自动核对 / 人工确认 */
export type ReviewSource = "ai" | "manual";

export interface UploadedFileRecord {
  id: string;
  name: string;
  type: "image" | "inbound-image" | "excel";
  size: number;
  status: UploadStatus;
  progress: number;
  uploadTime: string;
  storedPath: string;
  errorMessage?: string;
  resultCount?: number;
  /** OCR / 解析开始时间（ISO） */
  recognizeStartedAt?: string;
  /** 识别完成耗时（毫秒），含模型推理与写库 */
  recognizeDurationMs?: number;
}

export interface MeasureTicket {
  id: string;
  uploadId: string;
  ticketNo: string;
  supplierName: string;
  plateNo: string;
  driverName: string;
  materialName: string;
  materialType: string;
  sourceArea: string;
  unloadPlace: string;
  location: string;
  grossWeight: number;
  tareWeight: number;
  netWeight: number;
  deductWeight: number;
  actualWeight: number;
  grossTime: string;
  tareTime: string;
  imagePath: string;
  ocrStatus: OcrStatus;
  confidence: number;
  rawOcrText?: string;
  reviewSource?: ReviewSource;
  reviewHint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboundRecord {
  id: string;
  uploadId: string;
  ticketNo: string;
  outboundDate: string;
  inboundDate: string;
  inboundTime: string;
  supplierName: string;
  plateNo: string;
  driverName: string;
  materialType: string;
  regionName: string;
  /** Excel「付原件」等标记，如 X / 是 */
  originalAttached?: string;
  deductWeight: number;
  deductReason: string;
  netWeight: number;
  moisturePercent: number;
  settlementWeight: number;
  dryWeight: number;
  basePrice: number;
  purchaseAmount: number;
  factoryName: string;
  areaName: string;
  sourceFile: string;
  reviewStatus: InboundReviewStatus;
  reviewSource?: ReviewSource;
  reviewHint?: string;
  /** 截图 OCR 识别置信度 0-100，Excel 导入通常无此字段 */
  ocrConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMatch {
  id: string;
  measureTicketId: string;
  inboundRecordId: string;
  ticketNo: string;
  matchStatus: MatchStatus;
  matchScore: number;
  exceptionTypes: string[];
  exceptionDetail: string;
  confirmedBy: string;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetail {
  id: string;
  matchId: string;
  businessDate: string;
  ticketNo: string;
  supplierName: string;
  payeeName: string;
  plateNo: string;
  driverName: string;
  basePrice: number;
  priceDeduction: number;
  settlementPrice: number;
  netWeight: number;
  moisturePercent: number;
  settlementWeight: number;
  dryWeight: number;
  receivableAmount: number;
  payableAmount: number;
  grossProfit: number;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  paidDate: string;
  invoiceStatus: InvoiceStatus;
  invoiceAmount: number;
  invoiceDate: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

/** 车辆结算档案：车牌+司机 → 收款人、结算基础、截留、结算价 */
export interface VehicleSettlementRule {
  id: string;
  plateNo: string;
  driverName: string;
  payeeName: string;
  basePrice: number;
  priceDeduction: number;
  settlementPrice: number;
  remark?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataStore {
  uploads: UploadedFileRecord[];
  measureTickets: MeasureTicket[];
  inboundRecords: InboundRecord[];
  ticketMatches: TicketMatch[];
  paymentDetails: PaymentDetail[];
  vehicleSettlementRules: VehicleSettlementRule[];
}
