import { getConfidenceThreshold } from "@/lib/import/auto-review";
import type { MeasureTicket } from "@/lib/types";

export type MeasureConfidenceLevel = "high" | "medium" | "low" | "failed";

export type MeasureConfidenceDisplay = {
  level: MeasureConfidenceLevel;
  /** 列表/标签短文案 */
  label: string;
  /** 一句话说明 */
  summary: string;
  /** 详细说明（弹窗） */
  description: string;
  percent: number;
  autoPassEligible: boolean;
  threshold: number;
};

/**
 * 计量单 AI 识别可信度（0–100）。
 * 由 OCR/视觉模型根据磅单号、车牌、重量等关键字段完整度评估，非人工主观打分。
 */
export function getMeasureConfidenceDisplay(
  ticket: Pick<MeasureTicket, "confidence" | "ocrStatus" | "reviewSource" | "reviewHint">
): MeasureConfidenceDisplay {
  const threshold = getConfidenceThreshold();
  const percent = Math.min(100, Math.max(0, Math.round(ticket.confidence ?? 0)));

  if (ticket.ocrStatus === "识别失败") {
    return {
      level: "failed",
      label: "识别失败",
      summary: "关键信息缺失，请重新上传或手工录入",
      description:
        "图片识别未能提取足够的关键字段（磅单号、车牌、重量等），无法评估可信度。请对照原图修改或重新拍照上传。",
      percent,
      autoPassEligible: false,
      threshold,
    };
  }

  if (ticket.reviewSource === "manual") {
    return {
      level: "high",
      label: "人工已确认",
      summary: "已由人工核对确认，以当前内容为准",
      description:
        "本条记录已经人工保存或确认，系统不再仅依据 AI 可信度自动通过，以您核对后的数据参与后续匹配。",
      percent,
      autoPassEligible: true,
      threshold,
    };
  }

  if (percent >= threshold) {
    return {
      level: "high",
      label: "高可信",
      summary: `AI 识别完整度 ${percent}%，满足自动审核条件`,
      description: `AI 根据磅单号、车牌、毛/皮/净重等字段计算的识别完整度为 ${percent}%。达到 ${threshold}% 时，可在「一键核对」流程中自动审核通过（仍需与采购单匹配一致）。`,
      percent,
      autoPassEligible: true,
      threshold,
    };
  }

  if (percent >= 80) {
    return {
      level: "medium",
      label: "建议核对",
      summary: `AI 识别完整度 ${percent}%，未达自动通过线（需 ${threshold}%）`,
      description: `当前可信度 ${percent}%，表示部分字段可能不完整或存疑。系统要求 ${threshold}% 才自动审核通过，请对照左侧原图核对磅单号、车牌、重量后再保存或确认。${
        ticket.reviewHint ? ` 原因：${ticket.reviewHint}` : ""
      }`,
      percent,
      autoPassEligible: false,
      threshold,
    };
  }

  return {
    level: "low",
    label: "偏低",
    summary: `AI 识别完整度仅 ${percent}%，请重点核对`,
    description: `可信度 ${percent}% 较低，关键字段可能缺失或识别偏差较大。请逐字段对照原图修改；确认无误后可人工提交审核。${
      ticket.reviewHint ? ` 系统提示：${ticket.reviewHint}` : ""
    }`,
    percent,
    autoPassEligible: false,
    threshold,
  };
}

export function getMeasureConfidenceBarClass(level: MeasureConfidenceLevel): string {
  switch (level) {
    case "high":
      return "bg-success";
    case "medium":
      return "bg-warning";
    case "low":
      return "bg-destructive";
    case "failed":
      return "bg-muted-foreground/40";
  }
}

export function getMeasureConfidenceBadgeClass(level: MeasureConfidenceLevel): string {
  switch (level) {
    case "high":
      return "border-success/40 bg-success/10 text-success";
    case "medium":
      return "border-warning/40 bg-warning/10 text-warning";
    case "low":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "failed":
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
}
