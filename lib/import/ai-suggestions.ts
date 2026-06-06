import {
  getMatchConfirmChannel,
  getVerificationFailureReasons,
  verifyMeasureAndInbound,
  type MatchConfirmChannel,
} from "@/lib/import/document-verification";
import { findVehicleSettlementRule } from "@/lib/import/vehicle-settlement";
import { normalizeTicketNo } from "@/lib/import/ticket-uniqueness";
import type {
  InboundRecord,
  MeasureTicket,
  PaymentDetail,
  TicketMatch,
  UploadedFileRecord,
  VehicleSettlementRule,
} from "@/lib/types";

/**
 * AI 建议引擎（确定性规则）。
 * 把每条核对异常升级为「差异对比 + AI 判断 + 推荐值 + 一键动作」，
 * 并按「AI 可一键处理 / 待确认 / 必须人工」分类，供 AI 工作台与 AI 核对页消费。
 */

export type AiTodoStatus =
  | "auto-passed" // AI 已自动通过（已确认）
  | "ai-fixable" // AI 可一键修正（字段疑似 OCR 错字）
  | "manual"; // 必须人工处理

export type AdoptableField =
  | "plateNo"
  | "driverName"
  | "supplierName"
  | "materialType";

export type AiSuggestionAction =
  | { type: "confirm" }
  | {
      type: "adoptField";
      target: "inbound" | "measure";
      field: AdoptableField;
      value: string;
      thenConfirm: boolean;
    }
  | { type: "addVehicleArchive"; plateNo: string; driverName: string }
  | { type: "navigate"; tab: "measure" | "inbound" | "payment"; ticketNo?: string }
  | { type: "openDetail" }
  | { type: "verify"; measureId: string }
  | { type: "manual" };

/** 列表展示用：单行建议（不换行） */
export function getAiTodoDisplayLine(item: AiTodoItem): string {
  const line = item.recommendation?.trim() || item.title?.trim();
  if (!line) return item.judgment?.trim() || "—";
  return line;
}

function splitRecommendation(item: AiTodoItem): { cause: string; action: string } | null {
  const rec = item.recommendation?.trim();
  if (!rec) return null;
  const arrow = rec.indexOf("→");
  if (arrow < 0) return null;
  return {
    cause: rec.slice(0, arrow).trim(),
    action: rec.slice(arrow + 1).trim(),
  };
}

/** 表格「原因」列 */
export function getAiTodoReason(item: AiTodoItem): string {
  if (item.status === "auto-passed") {
    return "核对通过";
  }
  const parts = splitRecommendation(item);
  if (parts?.cause) return parts.cause;

  const judgment = item.judgment?.trim();
  const title = item.title?.trim();
  if (judgment && judgment !== title) return judgment;
  if (title) return title;
  if (judgment) return judgment;
  const reason = item.reasons?.find((r) => r.trim());
  return reason?.trim() || "—";
}

/** 表格「建议」列 */
export function getAiTodoSuggestion(item: AiTodoItem): string {
  if (item.status === "auto-passed") {
    return "查看对比明细";
  }
  const parts = splitRecommendation(item);
  if (parts?.action) return parts.action;

  if (item.actionLabel?.trim()) return item.actionLabel.trim();

  const rec = item.recommendation?.trim();
  if (rec) return rec;

  const judgment = item.judgment?.trim();
  if (judgment && judgment !== item.title) return judgment;

  return "—";
}

export type AiFieldDiff = {
  field: string;
  label: string;
  measureValue: string;
  purchaseValue: string;
  conflict: boolean;
};

export type AiTodoItem = {
  id: string;
  matchId?: string;
  measureId?: string;
  inboundId?: string;
  ticketNo: string;
  plateNo: string;
  driverName: string;
  supplierName: string;
  status: AiTodoStatus;
  meta?: {
    canGeneratePayment?: boolean;
    /** 核对完成时间（已确认用 confirmedAt） */
    confirmedAt?: string;
    confirmedBy?: string;
    /** AI / 系统 / 人工 */
    confirmChannel?: MatchConfirmChannel;
  };
  /** 一句话：AI 发现了什么 */
  title: string;
  /** AI 判断 */
  judgment: string;
  /** 推荐动作的人类可读描述 */
  recommendation: string;
  /** 一键按钮文案（无一键动作时为空） */
  actionLabel?: string;
  action: AiSuggestionAction;
  diffs: AiFieldDiff[];
  reasons: string[];
};

export type AiTodoSummary = {
  /** AI 已自动通过 */
  autoPassed: number;
  /** AI 可一键修正 */
  aiFixable: number;
  /** 必须人工处理 */
  manual: number;
  /** 缺车辆结算档案 */
  missingArchive: number;
  /** 已可生成付款明细（已确认且满足生成条件、尚未生成） */
  canGeneratePayment: number;
  /** 正在识别中 */
  pendingRecognition: number;
  /** 识别失败 */
  recognizeFailed: number;
};

export type AiTodoResult = {
  summary: AiTodoSummary;
  items: AiTodoItem[];
};

export type AiTodoInput = {
  measureTickets: MeasureTicket[];
  inboundRecords: InboundRecord[];
  ticketMatches: TicketMatch[];
  paymentDetails: PaymentDetail[];
  uploads: UploadedFileRecord[];
  rules: VehicleSettlementRule[];
};

function normText(value: string | undefined | null): string {
  return (value ?? "").trim().replace(/\s+/g, "").toUpperCase();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/** 中国车牌常见长度：普通 7 位，新能源 8 位 */
function isPlausiblePlateLength(plate: string): boolean {
  const len = normText(plate).length;
  return len === 7 || len === 8;
}

type TextAnalysis = {
  /** 是否疑似 OCR 近似错字（差异小、可一键采用） */
  nearMiss: boolean;
  /** 推荐采用哪一侧的值 */
  recommendSource: "measure" | "inbound";
  recommendedValue: string;
  judgment: string;
};

/**
 * 车牌差异分析：
 * - 一侧为空 → 采用非空侧
 * - 长度差 1 且编辑距离 1 → 疑似漏识别一位，采用长度合法（7/8 位）的一侧
 * - 同长度单字替换 → 疑似 OCR 错字，默认采用计量单（地磅原始单据）
 */
function analyzePlate(measurePlate: string, inboundPlate: string): TextAnalysis | null {
  const m = normText(measurePlate);
  const c = normText(inboundPlate);
  if (!m && !c) return null;
  if (m === c) return null;

  if (!c && m) {
    return {
      nearMiss: true,
      recommendSource: "measure",
      recommendedValue: measurePlate.trim(),
      judgment: "采购单车牌缺失，计量单已识别",
    };
  }
  if (!m && c) {
    return {
      nearMiss: true,
      recommendSource: "inbound",
      recommendedValue: inboundPlate.trim(),
      judgment: "计量单车牌缺失，采购单已识别",
    };
  }

  const dist = levenshtein(m, c);
  const lenDiff = Math.abs(m.length - c.length);

  if (dist === 1 && lenDiff === 1) {
    const measurePlausible = isPlausiblePlateLength(m);
    const inboundPlausible = isPlausiblePlateLength(c);
    if (measurePlausible && !inboundPlausible) {
      return {
        nearMiss: true,
        recommendSource: "measure",
        recommendedValue: measurePlate.trim(),
        judgment: `采购单车牌疑似漏识别 1 位（${c} → ${m}）`,
      };
    }
    if (inboundPlausible && !measurePlausible) {
      return {
        nearMiss: true,
        recommendSource: "inbound",
        recommendedValue: inboundPlate.trim(),
        judgment: `计量单车牌疑似漏识别 1 位（${m} → ${c}）`,
      };
    }
    return {
      nearMiss: true,
      recommendSource: "measure",
      recommendedValue: measurePlate.trim(),
      judgment: `两单车牌相差 1 位，建议采用计量单（${m}）`,
    };
  }

  if (dist === 1 && lenDiff === 0) {
    return {
      nearMiss: true,
      recommendSource: "measure",
      recommendedValue: measurePlate.trim(),
      judgment: `车牌单字疑似 OCR 错字（${c} → ${m}），建议采用计量单`,
    };
  }

  return {
    nearMiss: false,
    recommendSource: "measure",
    recommendedValue: measurePlate.trim(),
    judgment: `车牌差异较大（计量 ${m} ≠ 采购 ${c}），建议人工核对`,
  };
}

/**
 * 文本字段近似分析（司机/供应商/物料）。
 * 默认推荐侧：司机→计量单；供应商/物料→采购单（业务单据更权威）。
 */
function analyzeTextField(
  measureValue: string,
  inboundValue: string,
  defaultSource: "measure" | "inbound",
  fieldLabel: string
): TextAnalysis | null {
  const m = normText(measureValue);
  const c = normText(inboundValue);
  if (!m && !c) return null;
  if (m === c) return null;

  const measureRaw = measureValue.trim();
  const inboundRaw = inboundValue.trim();

  if (!c && m) {
    return {
      nearMiss: true,
      recommendSource: "measure",
      recommendedValue: measureRaw,
      judgment: `采购单${fieldLabel}缺失，采用计量单`,
    };
  }
  if (!m && c) {
    return {
      nearMiss: true,
      recommendSource: "inbound",
      recommendedValue: inboundRaw,
      judgment: `计量单${fieldLabel}缺失，采用采购单`,
    };
  }

  const dist = levenshtein(m, c);
  const maxLen = Math.max(m.length, c.length);
  const contained = m.includes(c) || c.includes(m);
  // 短字段（≤4）允许 1 字差异；较长字段允许 2 字差异或包含关系
  const threshold = maxLen <= 4 ? 1 : 2;

  if (dist <= threshold || contained) {
    const recommendSource = defaultSource;
    const recommendedValue =
      recommendSource === "measure" ? measureRaw : inboundRaw;
    return {
      nearMiss: true,
      recommendSource,
      recommendedValue,
      judgment: `${fieldLabel}疑似 OCR 差异（${m} / ${c}），建议采用${
        recommendSource === "measure" ? "计量单" : "采购单"
      }`,
    };
  }

  return {
    nearMiss: false,
    recommendSource: defaultSource,
    recommendedValue: defaultSource === "measure" ? measureRaw : inboundRaw,
    judgment: `${fieldLabel}差异较大（${m} ≠ ${c}），建议人工核对`,
  };
}

const ADOPT_FIELD_LABEL: Record<AdoptableField, string> = {
  plateNo: "车牌",
  driverName: "司机",
  supplierName: "供应商",
  materialType: "物料类型",
};

function diffValuesForField(
  diffs: AiFieldDiff[],
  field: AdoptableField
): { measureValue: string; purchaseValue: string } {
  const key =
    field === "plateNo"
      ? "plate"
      : field === "driverName"
        ? "driver"
        : field === "supplierName"
          ? "supplier"
          : "material";
  const row = diffs.find((d) => d.field === key);
  return {
    measureValue: row?.measureValue?.trim() || "—",
    purchaseValue: row?.purchaseValue?.trim() || "—",
  };
}

function buildAdoptItem(
  match: TicketMatch,
  measure: MeasureTicket,
  inbound: InboundRecord,
  field: AdoptableField,
  analysis: TextAnalysis,
  diffs: AiFieldDiff[]
): AiTodoItem {
  const label = ADOPT_FIELD_LABEL[field];
  const { measureValue, purchaseValue } = diffValuesForField(diffs, field);
  const side = analysis.recommendSource === "measure" ? "计量单" : "采购单";
  const val = analysis.recommendedValue;
  // 把推荐值写到“另一侧”，使两侧一致
  const target: "inbound" | "measure" =
    analysis.recommendSource === "measure" ? "inbound" : "measure";

  return {
    id: match.id,
    matchId: match.id,
    measureId: measure.id,
    inboundId: inbound.id,
    ticketNo: match.ticketNo || measure.ticketNo,
    plateNo: measure.plateNo,
    driverName: measure.driverName,
    supplierName: measure.supplierName,
    status: "ai-fixable",
    title: `${label}不一致`,
    judgment: analysis.judgment,
    recommendation: `${label}不一致（计量 ${measureValue} / 采购 ${purchaseValue}）→ 采用${side}「${val}」并确认`,
    actionLabel: `采用 ${val}`,
    action: {
      type: "adoptField",
      target,
      field,
      value: analysis.recommendedValue,
      thenConfirm: true,
    },
    diffs,
    reasons: [analysis.judgment],
  };
}

export function computeAiTodos(input: AiTodoInput): AiTodoResult {
  const { measureTickets, inboundRecords, ticketMatches, paymentDetails, uploads, rules } =
    input;

  const measureById = new Map(measureTickets.map((m) => [m.id, m]));
  const inboundById = new Map(inboundRecords.map((r) => [r.id, r]));
  const paymentByMatchId = new Map(paymentDetails.map((p) => [p.matchId, p]));
  const matchedMeasureIds = new Set(ticketMatches.map((m) => m.measureTicketId));

  const items: AiTodoItem[] = [];
  const summary: AiTodoSummary = {
    autoPassed: 0,
    aiFixable: 0,
    manual: 0,
    missingArchive: 0,
    canGeneratePayment: 0,
    pendingRecognition: uploads.filter((u) => u.status === "处理中").length,
    recognizeFailed: 0,
  };

  for (const match of ticketMatches) {
    const measure = measureById.get(match.measureTicketId);
    if (!measure) continue;
    const inbound = match.inboundRecordId
      ? inboundById.get(match.inboundRecordId)
      : undefined;

    if (match.matchStatus === "已确认") {
      summary.autoPassed += 1;
      const payment = paymentByMatchId.get(match.id);
      let canGeneratePayment = !payment;
      if (!payment) {
        const rule = findVehicleSettlementRule(
          rules,
          measure.plateNo || inbound?.plateNo || "",
          measure.driverName || inbound?.driverName || ""
        );
        if (rule) {
          summary.canGeneratePayment += 1;
        } else {
          // 没档案的话不算“可生成付款”
          canGeneratePayment = false;
        }
      }

      // 已通过也需要可查看明细（计量单/采购单/核对记录）
      if (inbound) {
        const verification = verifyMeasureAndInbound(measure, inbound);
        const c = verification.checks;
        const diffs: AiFieldDiff[] = [
          {
            field: "plate",
            label: "车牌",
            measureValue: c.plate.measureValue,
            purchaseValue: c.plate.purchaseValue,
            conflict: !c.plate.pass,
          },
          {
            field: "driver",
            label: "司机",
            measureValue: c.driver.measureValue,
            purchaseValue: c.driver.purchaseValue,
            conflict: !c.driver.pass,
          },
          {
            field: "supplier",
            label: "供应商",
            measureValue: measure.supplierName || "-",
            purchaseValue: inbound.supplierName || "-",
            conflict:
              normText(measure.supplierName) !== normText(inbound.supplierName),
          },
          {
            field: "material",
            label: "物料类型",
            measureValue: c.materialType.measureValue,
            purchaseValue: c.materialType.purchaseValue,
            conflict: !c.materialType.pass,
          },
          {
            field: "dryWeight",
            label: "绝干重量",
            measureValue:
              c.dryWeight.calculatedDry > 0
                ? `${c.dryWeight.calculatedDry.toFixed(3)} 吨`
                : "-",
            purchaseValue:
              c.dryWeight.dryWeight > 0
                ? `${c.dryWeight.dryWeight.toFixed(3)} 吨`
                : "-",
            conflict: !c.dryWeight.pass,
          },
          {
            field: "settleVsActual",
            label: "结算/实际重量",
            measureValue: c.settleVsActual.measureValue,
            purchaseValue: c.settleVsActual.purchaseValue,
            conflict: !c.settleVsActual.pass,
          },
        ];

        items.push({
          id: match.id,
          matchId: match.id,
          measureId: measure.id,
          inboundId: inbound.id,
          ticketNo: match.ticketNo || measure.ticketNo,
          plateNo: measure.plateNo,
          driverName: measure.driverName,
          supplierName: measure.supplierName,
          status: "auto-passed",
          meta: {
            canGeneratePayment,
            confirmedAt: match.confirmedAt?.trim() || match.updatedAt,
            confirmedBy: match.confirmedBy,
            confirmChannel: getMatchConfirmChannel(
              match.confirmedBy,
              match.matchStatus,
              verification
            ),
          },
          title: "核对通过",
          judgment: "六项一致",
          recommendation: "查看对比明细",
          actionLabel: "查看付款单",
          action: {
            type: "navigate",
            tab: "payment",
            ticketNo: match.ticketNo || measure.ticketNo,
          },
          diffs,
          reasons: [],
        });
      } else {
        items.push({
          id: match.id,
          matchId: match.id,
          measureId: measure.id,
          ticketNo: match.ticketNo || measure.ticketNo,
          plateNo: measure.plateNo,
          driverName: measure.driverName,
          supplierName: measure.supplierName,
          status: "auto-passed",
          meta: {
            canGeneratePayment: false,
            confirmedAt: match.confirmedAt?.trim() || match.updatedAt,
            confirmedBy: match.confirmedBy,
            confirmChannel: getMatchConfirmChannel(
              match.confirmedBy,
              match.matchStatus,
              null
            ),
          },
          title: "计量单已确认",
          judgment: "核对记录已确认，尚未绑定采购入库单",
          recommendation: "可上传对应采购单后重新核对，或查看计量单明细",
          action: { type: "manual" },
          diffs: [],
          reasons: [match.exceptionDetail || "未关联采购入库单"],
        });
      }
      continue;
    }
    if (match.matchStatus === "已作废") {
      summary.manual += 1;
      items.push({
        id: match.id,
        matchId: match.id,
        measureId: measure.id,
        inboundId: inbound?.id,
        ticketNo: match.ticketNo || measure.ticketNo,
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        status: "manual",
        title: "核对已作废",
        judgment: match.exceptionDetail || "该计量单核对记录已作废",
        recommendation: "如需重新核对，请上传采购单或重新匹配",
        action: { type: "manual" },
        diffs: [],
        reasons: [match.exceptionDetail || "已作废"],
      });
      continue;
    }

    // 缺采购入库单 → 人工
    if (!match.inboundRecordId || !inbound) {
      summary.manual += 1;
      items.push({
        id: match.id,
        matchId: match.id,
        measureId: measure.id,
        ticketNo: match.ticketNo || measure.ticketNo,
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        status: "manual",
        title: "缺少采购入库单",
        judgment: "仅有计量单，未找到相同磅单号的采购入库单",
        recommendation: `缺采购入库单（磅单 ${match.ticketNo || measure.ticketNo}）→ 上传同号采购单 Excel/截图`,
        actionLabel: "上传采购单",
        action: { type: "navigate", tab: "inbound" },
        diffs: [],
        reasons: [match.exceptionDetail || "未关联采购入库单"],
      });
      continue;
    }

    const verification = verifyMeasureAndInbound(measure, inbound);
    const c = verification.checks;
    const diffs: AiFieldDiff[] = [
      {
        field: "plate",
        label: "车牌",
        measureValue: c.plate.measureValue,
        purchaseValue: c.plate.purchaseValue,
        conflict: !c.plate.pass,
      },
      {
        field: "driver",
        label: "司机",
        measureValue: c.driver.measureValue,
        purchaseValue: c.driver.purchaseValue,
        conflict: !c.driver.pass,
      },
      {
        field: "supplier",
        label: "供应商",
        measureValue: measure.supplierName || "-",
        purchaseValue: inbound.supplierName || "-",
        conflict:
          normText(measure.supplierName) !== normText(inbound.supplierName),
      },
      {
        field: "material",
        label: "物料类型",
        measureValue: c.materialType.measureValue,
        purchaseValue: c.materialType.purchaseValue,
        conflict: !c.materialType.pass,
      },
      {
        field: "dryWeight",
        label: "绝干重量",
        measureValue: c.dryWeight.calculatedDry > 0 ? `${c.dryWeight.calculatedDry.toFixed(3)} 吨` : "-",
        purchaseValue: c.dryWeight.dryWeight > 0 ? `${c.dryWeight.dryWeight.toFixed(3)} 吨` : "-",
        conflict: !c.dryWeight.pass,
      },
      {
        field: "settleVsActual",
        label: "结算/实际重量",
        measureValue: c.settleVsActual.measureValue,
        purchaseValue: c.settleVsActual.purchaseValue,
        conflict: !c.settleVsActual.pass,
      },
    ];

    // 六项校验通过：由 prepareForAiTodos 自动确认；缺档案仍须人工补录
    if (verification.overallPass) {
      const rule = findVehicleSettlementRule(
        rules,
        measure.plateNo || inbound.plateNo,
        measure.driverName || inbound.driverName
      );
      if (!rule) {
        summary.manual += 1;
        summary.missingArchive += 1;
        items.push({
          id: match.id,
          matchId: match.id,
          measureId: measure.id,
          inboundId: inbound.id,
          ticketNo: match.ticketNo,
          plateNo: measure.plateNo,
          driverName: measure.driverName,
          supplierName: measure.supplierName,
          status: "manual",
          title: "缺车辆结算档案",
          judgment: "六项校验通过，但该车牌/司机没有结算档案，无法生成付款",
          recommendation: `六项已通过，缺结算档案（${measure.plateNo || inbound.plateNo} · ${measure.driverName || inbound.driverName}）→ 补录收款人/基础价/截留`,
          actionLabel: "补录档案",
          action: {
            type: "addVehicleArchive",
            plateNo: measure.plateNo || inbound.plateNo,
            driverName: measure.driverName || inbound.driverName,
          },
          diffs,
          reasons: [`缺少车辆结算档案（${measure.plateNo} / ${measure.driverName}）`],
        });
      }
      continue;
    }

    // 校验未通过：判断是否单字段近似（可一键修正）
    const numericConflict = !c.dryWeight.pass || !c.settleVsActual.pass;
    const conflictFields: AdoptableField[] = [];
    if (!c.plate.pass) conflictFields.push("plateNo");
    if (!c.driver.pass) conflictFields.push("driverName");
    if (normText(measure.supplierName) !== normText(inbound.supplierName)) {
      conflictFields.push("supplierName");
    }
    if (!c.materialType.pass) conflictFields.push("materialType");

    if (!numericConflict && conflictFields.length === 1) {
      const field = conflictFields[0];
      let analysis: TextAnalysis | null = null;
      if (field === "plateNo") {
        analysis = analyzePlate(measure.plateNo, inbound.plateNo);
      } else if (field === "driverName") {
        analysis = analyzeTextField(
          measure.driverName,
          inbound.driverName,
          "measure",
          "司机"
        );
      } else if (field === "supplierName") {
        analysis = analyzeTextField(
          measure.supplierName,
          inbound.supplierName,
          "inbound",
          "供应商"
        );
      } else if (field === "materialType") {
        analysis = analyzeTextField(
          measure.materialType,
          inbound.materialType,
          "inbound",
          "物料类型"
        );
      }

      if (analysis && analysis.nearMiss) {
        summary.aiFixable += 1;
        items.push(buildAdoptItem(match, measure, inbound, field, analysis, diffs));
        continue;
      }
    }

    // 其余（数值差异 / 多字段冲突 / 差异过大）→ 人工
    summary.manual += 1;
    const reasons = getVerificationFailureReasons(verification);
    items.push({
      id: match.id,
      matchId: match.id,
      measureId: measure.id,
      inboundId: inbound.id,
      ticketNo: match.ticketNo,
      plateNo: measure.plateNo,
      driverName: measure.driverName,
      supplierName: measure.supplierName,
      status: "manual",
      title: numericConflict ? "重量/金额存在差异" : "多处字段不一致",
      judgment: numericConflict
        ? "涉及重量或金额差异，需人工核对原单"
        : "多个字段同时不一致，AI 无法确定正确值",
      recommendation: numericConflict
        ? `重量/金额不一致（${reasons.slice(0, 2).join("；") || "见六项报告"}）→ 打开明细核对后确认或作废`
        : `多字段不一致（${reasons.slice(0, 2).join("、") || "见六项报告"}）→ 打开明细人工裁定`,
      actionLabel: "去核对",
      action: { type: "openDetail" },
      diffs,
      reasons: reasons.length > 0 ? reasons : [match.exceptionDetail || "校验未通过"],
    });
  }

  // 未进入匹配的计量单（识别失败 / 缺磅单号 / 待复核）
  for (const measure of measureTickets) {
    if (matchedMeasureIds.has(measure.id)) continue;

    if (measure.ocrStatus === "识别失败") {
      summary.recognizeFailed += 1;
      summary.manual += 1;
      items.push({
        id: measure.id,
        measureId: measure.id,
        ticketNo: measure.ticketNo || "(无磅单号)",
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        status: "manual",
        title: "计量单识别失败",
        judgment: "OCR 未能识别该计量单",
        recommendation: "计量单识别失败 → 在「计量单」Tab 重新上传清晰图片或人工录入",
        actionLabel: "去处理",
        action: { type: "navigate", tab: "measure" },
        diffs: [],
        reasons: ["计量单识别失败"],
      });
      continue;
    }

    if (!measure.ticketNo?.trim()) {
      summary.manual += 1;
      items.push({
        id: measure.id,
        measureId: measure.id,
        ticketNo: "(无磅单号)",
        plateNo: measure.plateNo,
        driverName: measure.driverName,
        supplierName: measure.supplierName,
        status: "manual",
        title: "缺少磅单号",
        judgment: "计量单缺少磅单号，无法与采购单关联",
        recommendation: "缺磅单号 → 在「计量单」Tab 补录磅单号后再匹配采购单",
        actionLabel: "去补录",
        action: { type: "navigate", tab: "measure" },
        diffs: [],
        reasons: ["缺少磅单号，无法与采购单关联"],
      });
      continue;
    }

    // 有磅单号但暂未匹配到采购单
    summary.manual += 1;
    items.push({
      id: measure.id,
      measureId: measure.id,
      ticketNo: measure.ticketNo,
      plateNo: measure.plateNo,
      driverName: measure.driverName,
      supplierName: measure.supplierName,
      status: "manual",
      title: "等待匹配采购单",
      judgment: "计量单已识别，但还没有相同磅单号的采购入库单",
      recommendation: `待匹配采购单（磅单 ${measure.ticketNo}）→ 上传同号采购入库单`,
      actionLabel: "上传采购单",
      action: { type: "navigate", tab: "inbound" },
      diffs: [],
      reasons: [measure.reviewHint || "暂无对应采购入库单"],
    });
  }

  // 排序：可一键处理优先，其次待确认，最后人工；同组按磅单号
  const order: Record<AiTodoStatus, number> = {
    "ai-fixable": 0,
    manual: 1,
    "auto-passed": 2,
  };
  items.sort((a, b) => {
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return a.ticketNo.localeCompare(b.ticketNo, "zh-CN");
  });

  return { summary, items };
}

const REVIEW_SKIP_OCR: MeasureTicket["ocrStatus"][] = ["识别中", "待识别"];

/** AI 核对列表以计量单为主：每张可核对计量单对应一行 */
export function buildMeasureCentricReviewItems(
  measureTickets: MeasureTicket[],
  items: AiTodoItem[]
): AiTodoItem[] {
  const byMeasure = new Map<string, AiTodoItem>();
  for (const item of items) {
    if (!item.measureId) continue;
    const prev = byMeasure.get(item.measureId);
    if (!prev || (!prev.matchId && item.matchId)) {
      byMeasure.set(item.measureId, item);
    }
  }

  const rows: AiTodoItem[] = [];
  for (const measure of measureTickets) {
    if (REVIEW_SKIP_OCR.includes(measure.ocrStatus)) continue;

    const row = byMeasure.get(measure.id);
    if (row) {
      rows.push(row);
      continue;
    }

    rows.push({
      id: measure.id,
      measureId: measure.id,
      ticketNo: measure.ticketNo || "(无磅单号)",
      plateNo: measure.plateNo,
      driverName: measure.driverName,
      supplierName: measure.supplierName,
      status: "manual",
      title:
        measure.ocrStatus === "待审核"
          ? "计量单待审核"
          : "等待进入核对",
      judgment:
        measure.reviewHint ||
        (measure.ocrStatus === "待审核"
          ? "请先完成计量单识别审核"
          : "尚未生成核对记录，请刷新或重新上传"),
      recommendation:
        measure.ocrStatus === "待审核"
          ? `计量单待审核（${measure.ticketNo || "无单号"}）→ 在「计量单」Tab 确认 OCR 字段`
          : `待生成核对（${measure.ticketNo || "无单号"}）→ 上传采购单或点击「一键核对」`,
      actionLabel:
        measure.ocrStatus === "待审核" ? "去审核" : "一键核对",
      action:
        measure.ocrStatus === "待审核"
          ? { type: "navigate", tab: "measure" }
          : { type: "verify", measureId: measure.id },
      diffs: [],
      reasons: [measure.reviewHint || measure.ocrStatus],
    });
  }

  const order: Record<AiTodoStatus, number> = {
    "ai-fixable": 0,
    manual: 1,
    "auto-passed": 2,
  };
  rows.sort((a, b) => {
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    return a.ticketNo.localeCompare(b.ticketNo, "zh-CN");
  });

  return rows;
}
