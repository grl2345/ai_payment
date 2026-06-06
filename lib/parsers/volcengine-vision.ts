import OpenAI from "openai";
import { normalizeWeighTime, roundWeightKg } from "@/lib/import/list-display";

export interface VisionMeasureResult {
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
  rawText: string;
}

const MEASURE_EXTRACTION_PROMPT = `你是竹木贸易计量单（磅单）识别助手。请仔细识别图片中的文字，提取以下字段。

要求：
1. 只返回 JSON，不要 markdown 代码块，不要额外说明
2. 数字字段只返回数值，不含单位
3. 重量单位统一为 KG（千克）
4. 无法识别的字段：字符串用 ""，数字用 0

JSON 格式：
{
  "ticketNo": "磅单编号",
  "supplierName": "供应商/供货单位",
  "plateNo": "车牌号",
  "driverName": "司机姓名",
  "materialName": "物料名称",
  "materialType": "物料类别",
  "sourceArea": "来料区域",
  "unloadPlace": "卸货地点/料场",
  "location": "区位",
  "grossWeight": 0,
  "tareWeight": 0,
  "netWeight": 0,
  "deductWeight": 0,
  "actualWeight": 0,
  "grossTime": "检重时间（毛重过磅时间，YYYY-MM-DD HH:mm:ss）",
  "tareTime": "检轻时间（皮重过磅时间，YYYY-MM-DD HH:mm:ss）",
  "confidence": 0
}

confidence 为 0-100 的识别置信度，根据关键字段（磅单号、车牌、净重）完整度评估。`;

const DEFAULT_MODEL = "doubao-seed-2-0-pro-260215";

/** 计量单截图默认可输出 token（单条 JSON，原 2048 易够用但留余量） */
export const DEFAULT_MEASURE_MAX_OUTPUT_TOKENS = 4096;
/** 入库单截图默认可输出 token（多行 records，原 4096 易在 ~9k 字符处截断） */
export const DEFAULT_INBOUND_MAX_OUTPUT_TOKENS = 16384;

const MAX_OUTPUT_TOKENS_CEILING = 32768;
const MAX_OUTPUT_TOKENS_FLOOR = 1024;

function parseMaxOutputTokensFromEnv(
  envKey: string,
  fallback: number
): number {
  const raw = process.env[envKey]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < MAX_OUTPUT_TOKENS_FLOOR) return fallback;
  return Math.min(n, MAX_OUTPUT_TOKENS_CEILING);
}

export function getMeasureMaxOutputTokens() {
  return parseMaxOutputTokensFromEnv(
    "ARK_MAX_OUTPUT_TOKENS_MEASURE",
    DEFAULT_MEASURE_MAX_OUTPUT_TOKENS
  );
}

export function getInboundMaxOutputTokens() {
  return parseMaxOutputTokensFromEnv(
    "ARK_MAX_OUTPUT_TOKENS_INBOUND",
    DEFAULT_INBOUND_MAX_OUTPUT_TOKENS
  );
}

type ArkThinkingType = "disabled" | "enabled" | "auto";

function getThinkingType(): ArkThinkingType {
  const raw = process.env.ARK_THINKING_TYPE?.trim().toLowerCase();
  if (raw === "enabled" || raw === "auto") return raw;
  return "disabled";
}

function getArkConfig() {
  const apiKey = process.env.ARK_API_KEY;
  const baseURL =
    process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const model = process.env.ARK_VISION_MODEL ?? DEFAULT_MODEL;
  const thinkingType = getThinkingType();

  if (!apiKey) {
    return null;
  }

  return { apiKey, baseURL, model, thinkingType };
}

export function isVolcengineOcrEnabled() {
  return getArkConfig() !== null;
}

function toDataUri(buffer: Buffer, mimeType: string) {
  const base64 = buffer.toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

export function parseJsonFromContent(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const likelyTruncated =
      /unterminated string/i.test(msg) ||
      /unexpected end of json/i.test(msg) ||
      jsonText.length > 6000;
    if (likelyTruncated) {
      throw new Error(
        "模型返回的 JSON 不完整（可能输出过长被截断）。请减少截图行数、改用 Excel 上传，或在 .env 中提高 ARK_MAX_OUTPUT_TOKENS_INBOUND 后重试"
      );
    }
    throw new Error(`模型返回的 JSON 无法解析：${msg}`);
  }
}

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

function normalizeResult(
  parsed: Record<string, unknown>,
  rawText: string
): VisionMeasureResult {
  const netWeight = toNumberField(parsed.netWeight);
  const deductWeight = toNumberField(parsed.deductWeight);
  const actualWeight =
    toNumberField(parsed.actualWeight) || (netWeight > 0 ? netWeight - deductWeight : 0);

  return {
    ticketNo: toStringField(parsed.ticketNo),
    supplierName: toStringField(parsed.supplierName),
    plateNo: toStringField(parsed.plateNo),
    driverName: toStringField(parsed.driverName),
    materialName: toStringField(parsed.materialName),
    materialType: toStringField(parsed.materialType) || toStringField(parsed.materialName),
    sourceArea: toStringField(parsed.sourceArea),
    unloadPlace: toStringField(parsed.unloadPlace),
    location: toStringField(parsed.location),
    grossWeight: roundWeightKg(toNumberField(parsed.grossWeight)),
    tareWeight: roundWeightKg(toNumberField(parsed.tareWeight)),
    netWeight: roundWeightKg(netWeight),
    deductWeight: roundWeightKg(deductWeight),
    actualWeight: roundWeightKg(actualWeight),
    grossTime: normalizeWeighTime(toStringField(parsed.grossTime)) || toStringField(parsed.grossTime),
    tareTime: normalizeWeighTime(toStringField(parsed.tareTime)) || toStringField(parsed.tareTime),
    confidence: Math.min(Math.max(toNumberField(parsed.confidence), 0), 100),
    rawText,
  };
}

function extractResponseText(response: OpenAI.Responses.Response) {
  if (response.output_text?.trim()) {
    return response.output_text.trim();
  }

  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text?.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

/** 火山方舟图文识别（关闭深度思考，适合单据 OCR） */
export async function callArkVision(
  buffer: Buffer,
  mimeType: string,
  prompt: string,
  maxOutputTokens = DEFAULT_MEASURE_MAX_OUTPUT_TOKENS
): Promise<string> {
  const config = getArkConfig();
  if (!config) {
    throw new Error("未配置火山方舟 OCR：请设置 ARK_API_KEY");
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: maxOutputTokens >= 8192 ? 120_000 : 90_000,
    maxRetries: 1,
  });

  const response = await client.responses.create({
    model: config.model,
    reasoning: { effort: "minimal" },
    thinking: { type: config.thinkingType },
    max_output_tokens: maxOutputTokens,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_image",
            image_url: toDataUri(buffer, mimeType),
            detail: "low",
          },
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    ],
  } as OpenAI.Responses.ResponseCreateParamsNonStreaming & {
    thinking?: { type: ArkThinkingType };
  });

  const rawText = extractResponseText(response);
  if (!rawText) {
    throw new Error("火山方舟未返回识别结果");
  }
  return rawText;
}

export async function recognizeMeasureWithVolcengine(
  buffer: Buffer,
  mimeType: string
): Promise<VisionMeasureResult> {
  const rawText = await callArkVision(
    buffer,
    mimeType,
    MEASURE_EXTRACTION_PROMPT,
    getMeasureMaxOutputTokens()
  );
  const parsed = parseJsonFromContent(rawText);
  return normalizeResult(parsed, rawText);
}
