import type { InboundRecord } from "@/lib/types";
import { generateId, nowString } from "@/lib/db/store";
import {
  roundInboundBasePrice,
  roundInboundDeductWeight,
  roundInboundDryWeight,
  roundInboundSettlementWeight,
} from "@/lib/import/inbound-display";
import {
  callArkVision,
  getInboundMaxOutputTokens,
  isVolcengineOcrEnabled,
  parseJsonFromContent,
} from "@/lib/parsers/volcengine-vision";

const INBOUND_EXTRACTION_PROMPT = `你是竹木贸易采购入库单识别助手。图片可能是 Excel 截图、表格照片或单据扫描件。

请识别图中所有入库明细行，提取字段并返回 JSON。

要求：
1. 只返回 JSON，不要 markdown 代码块，不要额外说明
2. 数字字段只返回数值，重量默认单位为 KG（千克），金额为元；扣重保留 4 位小数，结算基础保留 2 位小数
3. 无法识别的字符串用 ""，数字用 0
4. 若只有一行数据，records 数组仍只含 1 个对象
5. 磅单编号 ticketNo 为必填，没有有效行则 records 为空数组

JSON 格式：
{
  "records": [
    {
      "ticketNo": "磅单编号",
      "outboundDate": "出厂过磅日期 YYYY-MM-DD",
      "inboundDate": "进厂过磅日期 YYYY-MM-DD",
      "inboundTime": "进厂过磅时间 HH:mm:ss",
      "supplierName": "供应商名称",
      "plateNo": "车牌号",
      "driverName": "司机",
      "materialType": "物料类别/名称",
      "regionName": "区域名称",
      "originalAttached": "付原件标记，如 X",
      "deductWeight": 0,
      "deductReason": "扣重原因",
      "netWeight": 0,
      "moisturePercent": 0,
      "settlementWeight": 0,
      "dryWeight": 0,
      "basePrice": 0,
      "purchaseAmount": 0,
      "factoryName": "工厂",
      "areaName": "区内外",
      "confidence": 0
    }
  ]
}

每条记录增加 confidence（0-100），根据关键字段是否齐全、数字是否合理评估。`;

function toStringField(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function toNumberField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function mapVisionRow(
  row: Record<string, unknown>,
  uploadId: string,
  sourceFile: string
): InboundRecord | null {
  const ticketNo = toStringField(row.ticketNo);
  if (!ticketNo) return null;

  const now = nowString();
  return {
    id: generateId("IR"),
    uploadId,
    ticketNo,
    outboundDate: toStringField(row.outboundDate),
    inboundDate: toStringField(row.inboundDate),
    inboundTime: toStringField(row.inboundTime),
    supplierName: toStringField(row.supplierName),
    plateNo: toStringField(row.plateNo),
    driverName: toStringField(row.driverName),
    materialType: toStringField(row.materialType),
    regionName: toStringField(row.regionName),
    originalAttached: toStringField(row.originalAttached),
    deductWeight: roundInboundDeductWeight(toNumberField(row.deductWeight)),
    deductReason: toStringField(row.deductReason),
    netWeight: toNumberField(row.netWeight),
    moisturePercent: toNumberField(row.moisturePercent),
    settlementWeight: roundInboundSettlementWeight(
      toNumberField(row.settlementWeight)
    ),
    dryWeight: roundInboundDryWeight(toNumberField(row.dryWeight)),
    basePrice: roundInboundBasePrice(toNumberField(row.basePrice)),
    purchaseAmount: toNumberField(row.purchaseAmount),
    factoryName: toStringField(row.factoryName),
    areaName: toStringField(row.areaName),
    sourceFile,
    reviewStatus: "待审核",
    ocrConfidence: Math.min(
      100,
      Math.max(0, toNumberField(row.confidence))
    ),
    createdAt: now,
    updatedAt: now,
  };
}

export async function parseInboundImage(
  buffer: Buffer,
  mimeType: string,
  uploadId: string,
  sourceFile: string
): Promise<InboundRecord[]> {
  if (!isVolcengineOcrEnabled()) {
    throw new Error("截图识别需配置 ARK_API_KEY，或请上传 Excel 文件");
  }

  const rawText = await callArkVision(
    buffer,
    mimeType,
    INBOUND_EXTRACTION_PROMPT,
    getInboundMaxOutputTokens()
  );
  const parsed = parseJsonFromContent(rawText);
  const rows = Array.isArray(parsed.records)
    ? parsed.records
    : Array.isArray(parsed)
      ? parsed
      : [parsed];

  const records: InboundRecord[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const record = mapVisionRow(item as Record<string, unknown>, uploadId, sourceFile);
    if (record) records.push(record);
  }

  if (records.length === 0) {
    throw new Error("未从截图中识别到有效入库单数据，请确认包含磅单编号等字段");
  }

  return records;
}

export { isVolcengineOcrEnabled };
