import type { MeasureTicket } from "@/lib/types";
import { generateId, nowString } from "@/lib/db/store";
import { applyMeasureAutoReview } from "@/lib/import/auto-review";
import { normalizeWeighTime, roundWeightKg } from "@/lib/import/list-display";
import {
  isVolcengineOcrEnabled,
  recognizeMeasureWithVolcengine,
} from "@/lib/parsers/volcengine-vision";

interface ParsedMeasureFields {
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
  confidence: number;
  ocrStatus: MeasureTicket["ocrStatus"];
}

function extractByPatterns(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
    if (match?.[0] && !match[1]) return match[0].trim();
  }
  return "";
}

function extractNumber(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[:：\\s]*([\\d,]+(?:\\.\\d+)?)`, "i");
    const match = text.match(pattern);
    if (match?.[1]) {
      return Number(match[1].replace(/,/g, ""));
    }
  }
  return 0;
}

function extractDateTime(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(
      `${label}[:：\\s]*(\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}\\s+\\d{1,2}:\\d{2}:\\d{2})`,
      "i"
    );
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\//g, "-");
  }
  return "";
}

function scoreFields(fields: Omit<ParsedMeasureFields, "ocrStatus">) {
  let score = 0;
  if (fields.ticketNo) score += 25;
  if (fields.plateNo) score += 15;
  if (fields.supplierName) score += 10;
  if (fields.driverName) score += 10;
  if (fields.netWeight > 0 || fields.actualWeight > 0) score += 20;
  if (fields.grossWeight > 0) score += 10;
  if (fields.tareWeight > 0) score += 10;
  return Math.min(score, 100);
}

export function parseMeasureText(rawText: string): ParsedMeasureFields {
  const text = rawText.replace(/\r/g, "\n");

  const ticketNo = extractByPatterns(text, [
    /(MJZYL\d{8,})/i,
    /磅单(?:编号|号)[:：\s]*([A-Z0-9]{8,})/i,
    /编号[:：\s]*([A-Z0-9]{8,})/i,
  ]);

  const plateNo = extractByPatterns(text, [
    /([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]?)/,
    /车牌[:：\s]*([^\s\n]{5,10})/,
  ]);

  const supplierName = extractByPatterns(text, [
    /供应商[:：\s]*([^\n]{2,30})/,
    /供货单位[:：\s]*([^\n]{2,30})/,
    /(四川[\u4e00-\u9fa5]{2,20}(?:有限公司|公司|加工厂|竹业))/,
  ]);

  const driverName = extractByPatterns(text, [
    /司机[:：\s]*([\u4e00-\u9fa5]{2,4})/,
    /驾驶员[:：\s]*([\u4e00-\u9fa5]{2,4})/,
  ]);

  const materialName = extractByPatterns(text, [
    /物料名称[:：\s]*([^\n]{2,20})/,
    /((?:原竹|竹片)[^\n]{0,20})/,
  ]);

  const materialType =
    extractByPatterns(text, [
      /物料(?:类别|类型)[:：\s]*([^\n]{2,20})/,
      /((?:原竹|竹片)-[\u4e00-\u9fa5\d#]+)/,
    ]) || materialName;

  const sourceArea = extractByPatterns(text, [
    /(?:来料区域|产地|区域)[:：\s]*([^\n]{2,10})/,
  ]);

  const unloadPlace = extractByPatterns(text, [
    /卸货地点[:：\s]*([^\n]{2,20})/,
    /料场[:：\s]*([^\n]{2,20})/,
  ]);

  const location = extractByPatterns(text, [
    /(?:区位|堆位)[:：\s]*([^\n]{2,20})/,
    /(厂[内外]\d#堆)/,
  ]);

  const grossWeight = extractNumber(text, ["毛重", " gross"]);
  const tareWeight = extractNumber(text, ["皮重", " tare"]);
  const netWeight = extractNumber(text, ["净重", "过磅净重"]);
  const deductWeight = extractNumber(text, ["扣重", "扣减"]);
  const actualWeight =
    extractNumber(text, ["实重", "实际重量", "结算重量"]) ||
    (netWeight > 0 ? netWeight - deductWeight : 0);

  const grossTime = extractDateTime(text, ["检重时间", "毛重时间", "进厂时间", "一次过磅"]);
  const tareTime = extractDateTime(text, ["检轻时间", "皮重时间", "出厂时间", "二次过磅"]);

  const confidence = scoreFields({
    ticketNo,
    supplierName,
    plateNo,
    driverName,
    materialName,
    materialType,
    sourceArea,
    unloadPlace,
    location,
    grossWeight,
    tareWeight,
    netWeight,
    deductWeight,
    actualWeight,
    grossTime,
    tareTime,
    confidence: 0,
  });

  return {
    ticketNo,
    supplierName,
    plateNo,
    driverName,
    materialName,
    materialType,
    sourceArea,
    unloadPlace,
    location,
    grossWeight,
    tareWeight,
    netWeight,
    deductWeight,
    actualWeight,
    grossTime,
    tareTime,
    confidence,
    ocrStatus: confidence < 15 ? "识别失败" : "待审核",
  };
}

async function recognizeWithTesseract(buffer: Buffer) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("chi_sim+eng");
  const {
    data: { text },
  } = await worker.recognize(buffer);
  await worker.terminate();
  return parseMeasureText(text);
}

function resolveOcrStatus(
  confidence: number
): MeasureTicket["ocrStatus"] {
  if (confidence < 15) return "识别失败";
  return "待审核";
}

function buildTicket(
  parsed: ParsedMeasureFields,
  uploadId: string,
  imagePath: string,
  rawOcrText: string
): MeasureTicket {
  const now = nowString();
  return {
    id: generateId("MT"),
    uploadId,
    ticketNo: parsed.ticketNo,
    supplierName: parsed.supplierName,
    plateNo: parsed.plateNo,
    driverName: parsed.driverName,
    materialName: parsed.materialName,
    materialType: parsed.materialType,
    sourceArea: parsed.sourceArea,
    unloadPlace: parsed.unloadPlace,
    location: parsed.location,
    grossWeight: roundWeightKg(parsed.grossWeight),
    tareWeight: roundWeightKg(parsed.tareWeight),
    netWeight: roundWeightKg(parsed.netWeight),
    deductWeight: roundWeightKg(parsed.deductWeight),
    actualWeight: roundWeightKg(parsed.actualWeight || parsed.netWeight),
    grossTime: normalizeWeighTime(parsed.grossTime) || parsed.grossTime,
    tareTime: normalizeWeighTime(parsed.tareTime) || parsed.tareTime,
    imagePath,
    ocrStatus: parsed.ocrStatus ?? resolveOcrStatus(parsed.confidence),
    confidence: parsed.confidence,
    rawOcrText: rawOcrText.slice(0, 5000),
    createdAt: now,
    updatedAt: now,
  };
}

export async function recognizeMeasureImage(
  buffer: Buffer,
  uploadId: string,
  imagePath: string,
  mimeType = "image/jpeg"
): Promise<MeasureTicket> {
  if (isVolcengineOcrEnabled()) {
    const vision = await recognizeMeasureWithVolcengine(buffer, mimeType);
    const parsed: ParsedMeasureFields = {
      ...vision,
      ocrStatus: resolveOcrStatus(vision.confidence),
    };
    return applyMeasureAutoReview(
      buildTicket(parsed, uploadId, imagePath, vision.rawText)
    );
  }

  const parsed = await recognizeWithTesseract(buffer);
  return applyMeasureAutoReview(
    buildTicket(parsed, uploadId, imagePath, parsed.ticketNo)
  );
}

export { isVolcengineOcrEnabled };
