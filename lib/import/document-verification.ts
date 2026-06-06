import type { InboundRecord, MeasureTicket, TicketMatch } from "@/lib/types";
import { normalizeTicketNo } from "@/lib/import/ticket-uniqueness";
import { getMeasureCoreFields } from "@/lib/import/measure-fields";
import {
  formatPurchaseCoreValue,
  getPurchaseCoreFields,
} from "@/lib/import/inbound-fields";

export type FieldCheck = {
  pass: boolean;
  measureValue: string;
  purchaseValue: string;
};

export type DocumentVerificationResult = {
  checks: {
    ticketNo: FieldCheck;
    plate: FieldCheck;
    driver: FieldCheck;
    materialType: FieldCheck;
    dryWeight: FieldCheck & {
      settleWeight: number;
      moisturePercent: number;
      dryWeight: number;
      calculatedDry: number;
    };
    settleVsActual: FieldCheck & {
      settleWeightTon: number;
      actualWeightKg: number;
      actualWeightTon: number;
    };
  };
  measureCore: ReturnType<typeof getMeasureCoreFields>;
  purchaseCore: ReturnType<typeof getPurchaseCoreFields> | null;
  overallPass: boolean;
  markdown: string;
};

function normText(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function textEqual(a: string, b: string) {
  return normText(a) === normText(b);
}

function numClose(a: number, b: number, tolerance: number) {
  return Math.abs(a - b) <= tolerance;
}

export function verifyMeasureAndInbound(
  measure: MeasureTicket,
  inbound?: InboundRecord | null
): DocumentVerificationResult {
  const m = getMeasureCoreFields(measure);

  const cWb = inbound?.ticketNo?.trim() ?? "";
  const cVeh = inbound?.plateNo?.trim() ?? "";
  const cDriver = inbound?.driverName?.trim() ?? "";
  const cMat = inbound?.materialType?.trim() ?? "";
  const settleTon = inbound?.settlementWeight ?? 0;
  const dryTon = inbound?.dryWeight ?? 0;
  const moisture = inbound?.moisturePercent ?? 0;
  const actualKg = m.J_A_Weight;
  const actualTon = actualKg > 0 ? actualKg / 1000 : 0;

  const ticketNoPass =
    Boolean(inbound) &&
    normalizeTicketNo(m.J_WB_No) === normalizeTicketNo(cWb) &&
    m.J_WB_No !== "-";

  const platePass = Boolean(inbound) && textEqual(m.J_Veh_No, cVeh);
  const driverPass = Boolean(inbound) && textEqual(m.J_Driver, cDriver);
  const materialPass = Boolean(inbound) && textEqual(m.J_Mat_Type, cMat);

  const calculatedDry =
    settleTon > 0 && moisture > 0 && moisture < 100
      ? settleTon * (1 - moisture / 100)
      : 0;
  const dryPass =
    Boolean(inbound) &&
    settleTon > 0 &&
    dryTon > 0 &&
    calculatedDry > 0 &&
    numClose(calculatedDry, dryTon, Math.max(0.05, dryTon * 0.02));

  const settlePass =
    Boolean(inbound) &&
    settleTon > 0 &&
    actualTon > 0 &&
    numClose(settleTon, actualTon, Math.max(0.02, actualTon * 0.02));

  const checks = {
    ticketNo: {
      pass: ticketNoPass,
      measureValue: m.J_WB_No,
      purchaseValue: cWb || "-",
    },
    plate: {
      pass: platePass,
      measureValue: m.J_Veh_No,
      purchaseValue: cVeh || "-",
    },
    driver: {
      pass: driverPass,
      measureValue: m.J_Driver,
      purchaseValue: cDriver || "-",
    },
    materialType: {
      pass: materialPass,
      measureValue: m.J_Mat_Type,
      purchaseValue: cMat || "-",
    },
    dryWeight: {
      pass: dryPass,
      measureValue: "-",
      purchaseValue: dryTon > 0 ? dryTon.toFixed(3) : "-",
      settleWeight: settleTon,
      moisturePercent: moisture,
      dryWeight: dryTon,
      calculatedDry,
    },
    settleVsActual: {
      pass: settlePass,
      measureValue: actualKg > 0 ? `${actualKg.toLocaleString()} KG（${actualTon.toFixed(3)} 吨）` : "-",
      purchaseValue: settleTon > 0 ? `${settleTon.toFixed(3)} 吨` : "-",
      settleWeightTon: settleTon,
      actualWeightKg: actualKg,
      actualWeightTon: actualTon,
    },
  };

  const overallPass =
    ticketNoPass &&
    platePass &&
    driverPass &&
    materialPass &&
    dryPass &&
    settlePass;

  const purchaseCore = inbound ? getPurchaseCoreFields(inbound) : null;
  const markdown = formatVerificationMarkdown(m, purchaseCore, checks, overallPass);

  return { checks, measureCore: m, purchaseCore, overallPass, markdown };
}

/** 人工确认后视为校验通过（不再卡付款与列表展示） */
export function isMatchVerificationSatisfied(
  matchStatus: string,
  verification: DocumentVerificationResult | null | undefined
): boolean {
  if (matchStatus === "已确认") return true;
  return Boolean(verification?.overallPass);
}

/** 是否为 AI 自动确认（非用户点击确认） */
export function isAiConfirmedBy(confirmedBy: string | undefined | null): boolean {
  const v = (confirmedBy ?? "").trim().toLowerCase();
  return v === "ai" || v === "系统自动" || v.startsWith("ai ");
}

/** 核对渠道：AI / 系统规则 / 人工 */
export type MatchConfirmChannel = "ai" | "system" | "manual";

export function getMatchConfirmChannel(
  confirmedBy?: string | null,
  matchStatus?: string,
  verification?: DocumentVerificationResult | null
): MatchConfirmChannel {
  if (matchStatus === "已确认") {
    const v = (confirmedBy ?? "").trim();
    const lower = v.toLowerCase();
    if (!v) {
      return verification?.overallPass ? "system" : "manual";
    }
    if (lower === "ai" || lower.startsWith("ai ")) return "ai";
    if (
      v === "系统自动" ||
      v === "系统" ||
      v === "系统核对" ||
      lower === "system"
    ) {
      return "system";
    }
    return "manual";
  }
  if (verification?.overallPass) return "system";
  return "manual";
}

export function getMatchConfirmChannelLabel(channel: MatchConfirmChannel): string {
  switch (channel) {
    case "ai":
      return "AI核对";
    case "system":
      return "系统核对";
    case "manual":
      return "人工核对";
  }
}

export function getMatchConfirmChannelClassName(
  channel: MatchConfirmChannel
): string {
  switch (channel) {
    case "ai":
      return "border-sky-500/55 bg-sky-500/15 text-sky-800 dark:text-sky-200";
    case "system":
      return "border-emerald-500/55 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
    case "manual":
      return "border-amber-500/55 bg-amber-500/15 text-amber-900 dark:text-amber-200";
  }
}

/** 校验时间展示：已确认用确认时间，仅系统六项通过用最近更新时间 */
export function formatMatchVerificationTime(
  match: Pick<TicketMatch, "matchStatus" | "confirmedAt" | "updatedAt">,
  verification: DocumentVerificationResult | null | undefined
): string {
  if (match.matchStatus === "已确认") {
    const at = match.confirmedAt?.trim();
    return at ? formatVerificationDateTime(at) : "-";
  }
  if (
    verification?.overallPass &&
    match.matchStatus !== "已作废"
  ) {
    const at = match.updatedAt?.trim();
    return at ? formatVerificationDateTime(at) : "-";
  }
  return "-";
}

function formatVerificationDateTime(value: string): string {
  const normalized = value.replace(/\//g, "-");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export type MatchVerificationBadgeKind =
  | "ai"
  | "manual"
  | "auto-pass"
  | "fail"
  | "none";

export function getMatchVerificationBadgeKind(
  matchStatus: string,
  verification: DocumentVerificationResult | null | undefined,
  confirmedBy?: string | null
): MatchVerificationBadgeKind {
  if (matchStatus === "已确认") {
    if (isAiConfirmedBy(confirmedBy)) return "ai";
    const by = (confirmedBy ?? "").trim();
    if (!by && verification?.overallPass) return "auto-pass";
    return "manual";
  }
  if (!verification) return "none";
  return verification.overallPass ? "auto-pass" : "fail";
}

export function getVerificationBadgeClassName(
  kind: MatchVerificationBadgeKind
): string {
  switch (kind) {
    case "ai":
      return "bg-sky-500/15 text-sky-800 border-sky-500/45 dark:text-sky-300";
    case "manual":
      return "bg-amber-500/15 text-amber-900 border-amber-500/45 dark:text-amber-200";
    case "auto-pass":
      return "bg-emerald-500/15 text-emerald-800 border-emerald-500/40 dark:text-emerald-300";
    case "fail":
      return "bg-destructive/10 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function getMatchVerificationLabel(
  matchStatus: string,
  verification: DocumentVerificationResult | null | undefined,
  confirmedBy?: string | null
): string {
  if (matchStatus === "已确认") {
    if (isAiConfirmedBy(confirmedBy)) {
      return verification?.overallPass ? "✓ AI校验通过" : "✓ AI已确认";
    }
    const by = (confirmedBy ?? "").trim();
    if (!by && verification?.overallPass) return "✓ 6/6 通过";
    return "✓ 人工通过";
  }
  if (!verification) return "-";
  return verification.overallPass ? "✓ 6/6 通过" : "✗ 未通过";
}

/** 六项校验未通过时，生成可读原因列表 */
export function getVerificationFailureReasons(
  result: DocumentVerificationResult
): string[] {
  if (result.overallPass) return [];
  const c = result.checks;
  const reasons: string[] = [];
  if (!c.ticketNo.pass) {
    reasons.push(
      `磅单编号不一致：计量「${c.ticketNo.measureValue}」≠ 采购「${c.ticketNo.purchaseValue}」`
    );
  }
  if (!c.plate.pass) {
    reasons.push(
      `车牌不一致：计量「${c.plate.measureValue}」≠ 采购「${c.plate.purchaseValue}」`
    );
  }
  if (!c.driver.pass) {
    reasons.push(
      `司机不一致：计量「${c.driver.measureValue}」≠ 采购「${c.driver.purchaseValue}」`
    );
  }
  if (!c.materialType.pass) {
    reasons.push(
      `物料类别不一致：计量「${c.materialType.measureValue}」≠ 采购「${c.materialType.purchaseValue}」`
    );
  }
  if (!c.dryWeight.pass) {
    reasons.push(
      `绝干重量校验未通过：结算 ${c.dryWeight.settleWeight.toFixed(3)} 吨 × (1−${c.dryWeight.moisturePercent}%) ≠ 登记绝干 ${c.dryWeight.dryWeight.toFixed(3)} 吨`
    );
  }
  if (!c.settleVsActual.pass) {
    reasons.push(
      `结算重量与实际重量不一致：采购结算 ${c.settleVsActual.settleWeightTon.toFixed(3)} 吨 ≠ 计量实际 ${c.settleVsActual.actualWeightTon.toFixed(3)} 吨`
    );
  }
  if (!result.purchaseCore) {
    reasons.push("未关联采购入库单，无法完成六项比对");
  }
  return reasons;
}

function passLabel(pass: boolean) {
  return pass ? "通过" : "未通过";
}

function formatPurchaseCoreMarkdown(
  purchase: ReturnType<typeof getPurchaseCoreFields>
): string {
  return `### 采购单核心信息
- **C_WB_No（磅单编号）**：${purchase.C_WB_No}
- **C_Veh_No（车牌）**：${purchase.C_Veh_No}
- **C_Driver（司机）**：${purchase.C_Driver}
- **C_Settle_Weight（结算重量）**：${formatPurchaseCoreValue("C_Settle_Weight", purchase)} 吨
- **C_Dry_Weight（绝干重量）**：${formatPurchaseCoreValue("C_Dry_Weight", purchase)} 吨
- **C_Percentage（水分百分比）**：${formatPurchaseCoreValue("C_Percentage", purchase)}
- **C_Base_Price（结算基础）**：${formatPurchaseCoreValue("C_Base_Price", purchase)}
- **Total_Amount（采购总金额）**：${purchase.Total_Amount > 0 ? `¥${formatPurchaseCoreValue("Total_Amount", purchase)}` : "-"}
- **C_Mat_Type（物料类型）**：${purchase.C_Mat_Type}`;
}

export function formatVerificationMarkdown(
  measureCore: ReturnType<typeof getMeasureCoreFields>,
  purchaseCore: ReturnType<typeof getPurchaseCoreFields> | null,
  checks: DocumentVerificationResult["checks"],
  overallPass: boolean
): string {
  const purchaseSection = purchaseCore
    ? `\n\n${formatPurchaseCoreMarkdown(purchaseCore)}`
    : `\n\n### 采购单核心信息\n（未关联采购入库单）`;

  const summaryTable = [
    ["磅单编号", passLabel(checks.ticketNo.pass)],
    ["车牌号", passLabel(checks.plate.pass)],
    ["司机", passLabel(checks.driver.pass)],
    ["物料类别", passLabel(checks.materialType.pass)],
    ["绝干重量", passLabel(checks.dryWeight.pass)],
    ["结算重量 vs 实际重量", passLabel(checks.settleVsActual.pass)],
  ]
    .map(([name, result]) => `| ${name} | ${result} |`)
    .join("\n");

  return `## 校验规则与公式说明

### 一、文本字段校验
磅单编号、车牌、司机、物料类别：计量单与采购入库单对应字段须**完全相等**。

### 二、绝干重量校验（采购单内部）
- **公式**：\`绝干重量 = 结算重量 ×（1 − 水分百分比）\`（水分按百分数，如 15 表示 15%）
- **逻辑**：理论绝干重量应与采购单登记的绝干重量一致，验证水分扣减是否合理。

### 三、结算重量 vs 实际重量（跨单据）
- **公式**：\`结算重量（吨）= 实际重量（KG）÷ 1000\`
- **逻辑**：采购入库单结算重量应与原料净重计量单实际重量（换算吨）一致。

> 任一项未通过，整体 **Result** 为「不通过」。

---

## 整体校验结果

**Result：${overallPass ? "通过" : "不通过"}**

| 校验项 | 结果 |
| --- | --- |
${summaryTable}

---

## 校验明细

- **磅单编号校验**：
    - 计量单磅单号：${checks.ticketNo.measureValue}
    - 采购单磅单号：${checks.ticketNo.purchaseValue}
    - 对比结果：${passLabel(checks.ticketNo.pass)}
- **车牌号校验**：
    - 计量单车牌号：${checks.plate.measureValue}
    - 采购单车牌号：${checks.plate.purchaseValue}
    - 对比结果：${passLabel(checks.plate.pass)}
- **司机校验**：
    - 计量单司机姓名：${checks.driver.measureValue}
    - 采购单司机姓名：${checks.driver.purchaseValue}
    - 对比结果：${passLabel(checks.driver.pass)}
- **物料类别校验**：
    - 计量单物料类别：${checks.materialType.measureValue}
    - 采购单物料类别：${checks.materialType.purchaseValue}
    - 对比结果：${passLabel(checks.materialType.pass)}
- **绝干重量校验**：
    - （计算公式）绝干重量 = 结算重量 ×（1 − 水分百分比）
    - （采购入库单）绝干重量：${checks.dryWeight.dryWeight > 0 ? checks.dryWeight.dryWeight.toFixed(3) : "-"} 吨
    - （采购入库单）结算重量：${checks.dryWeight.settleWeight > 0 ? checks.dryWeight.settleWeight.toFixed(3) : "-"} 吨
    - （采购入库单）水分百分比：${checks.dryWeight.moisturePercent > 0 ? `${checks.dryWeight.moisturePercent}%` : "-"}
    - 计算值：${checks.dryWeight.settleWeight.toFixed(3)} ×（1 − ${checks.dryWeight.moisturePercent}%）= ${checks.dryWeight.calculatedDry > 0 ? checks.dryWeight.calculatedDry.toFixed(3) : "-"} 吨
    - 对比逻辑：结算重量乘以（1 − 水分百分比）应等于绝干重量。
    - 对比结果：${passLabel(checks.dryWeight.pass)}
- **结算重量与实际重量校验**：
    - （计算公式）结算重量（吨）= 实际重量（KG）÷ 1000
    - （采购入库单）结算重量：${checks.settleVsActual.settleWeightTon > 0 ? `${checks.settleVsActual.settleWeightTon.toFixed(3)} 吨` : "-"}
    - （原料净重计量单）实际重量：${checks.settleVsActual.actualWeightKg > 0 ? `${checks.settleVsActual.actualWeightKg.toLocaleString()} KG（${checks.settleVsActual.actualWeightTon.toFixed(3)} 吨）` : "-"}
    - 对比逻辑：采购入库单结算重量应与计量单实际重量（换算吨）一致。
    - 对比结果：${passLabel(checks.settleVsActual.pass)}

---

## 参与校验的原始数据

### 计量单核心信息
- **检重时间**：${measureCore.DATE}
- **磅单号**：${measureCore.J_WB_No}
- **车号**：${measureCore.J_Veh_No}
- **司机**：${measureCore.J_Driver}
- **净重**：${measureCore.J_N_Weight > 0 ? `${measureCore.J_N_Weight.toLocaleString()} KG` : "-"}
- **实际重量**：${measureCore.J_A_Weight > 0 ? `${measureCore.J_A_Weight.toLocaleString()} KG` : "-"}
- **物料类型**：${measureCore.J_Mat_Type}${purchaseSection}`;
}
