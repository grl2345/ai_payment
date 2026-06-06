import * as XLSX from "xlsx";
import type { InboundRecord } from "@/lib/types";
import { generateId, nowString } from "@/lib/db/store";
import {
  roundInboundBasePrice,
  roundInboundDeductWeight,
  roundInboundDryWeight,
  roundInboundSettlementWeight,
} from "@/lib/import/inbound-display";

const HEADER_ALIASES: Record<string, keyof InboundRecord> = {
  磅单编号: "ticketNo",
  磅单号: "ticketNo",
  单据编号: "ticketNo",
  出库日期: "outboundDate",
  出厂过磅日期: "outboundDate",
  入库日期: "inboundDate",
  进厂过磅日期: "inboundDate",
  入库时间: "inboundTime",
  过磅时间: "inboundTime",
  进厂过磅时间: "inboundTime",
  供应商: "supplierName",
  供应商名称: "supplierName",
  供货单位: "supplierName",
  车牌: "plateNo",
  车牌号: "plateNo",
  车号: "plateNo",
  司机: "driverName",
  司机姓名: "driverName",
  驾驶员: "driverName",
  物料类别: "materialType",
  物料类型: "materialType",
  物料名称: "materialType",
  区域: "regionName",
  产地: "regionName",
  区域名称: "regionName",
  付原件: "originalAttached",
  原件: "originalAttached",
  扣重: "deductWeight",
  "扣重(kg)": "deductWeight",
  "扣重(KG)": "deductWeight",
  扣重原因: "deductReason",
  过磅净重: "netWeight",
  净重: "netWeight",
  "净重(kg)": "netWeight",
  "净重(KG)": "netWeight",
  水分: "moisturePercent",
  "水分(%)": "moisturePercent",
  水分百分比: "moisturePercent",
  含水率: "moisturePercent",
  结算重量: "settlementWeight",
  "结算重量(吨)": "settlementWeight",
  绝干重量: "dryWeight",
  "绝干重量(吨)": "dryWeight",
  绝干重: "dryWeight",
  绝干吨: "dryWeight",
  干重: "dryWeight",
  基准价: "basePrice",
  结算基础: "basePrice",
  结算基价: "basePrice",
  采购单价: "basePrice",
  采购金额: "purchaseAmount",
  采购总金额: "purchaseAmount",
  金额: "purchaseAmount",
  工厂: "factoryName",
  工厂名称: "factoryName",
  收货工厂: "factoryName",
  区内外: "areaName",
  内外区: "areaName",
  大区名称: "areaName",
  大区: "areaName",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[¥￥]/g, "")
    .trim();
  if (!text) return 0;
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, "0");
      const day = String(parsed.d).padStart(2, "0");
      return `${parsed.y}-${month}-${day}`;
    }
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return text;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    return text.replace(/\//g, "-");
  }
  return text;
}

function parseTime(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const hour = String(parsed.H).padStart(2, "0");
      const minute = String(parsed.M).padStart(2, "0");
      const second = String(parsed.S).padStart(2, "0");
      return `${hour}:${minute}:${second}`;
    }
  }
  return String(value).trim();
}

function findHeaderRow(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
  });

  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const row = rows[i] ?? [];
    const normalized = row.map(normalizeHeader);
    const hitCount = normalized.filter((cell) =>
      Object.keys(HEADER_ALIASES).some(
        (alias) => normalizeHeader(alias) === cell
      )
    ).length;
    if (hitCount >= 3) {
      return { headerRowIndex: i, rows };
    }
  }

  return { headerRowIndex: 0, rows };
}

function resolveField(header: string) {
  const normalized = normalizeHeader(header);
  const alias = Object.keys(HEADER_ALIASES).find(
    (key) => normalizeHeader(key) === normalized
  );
  return alias ? HEADER_ALIASES[alias] : undefined;
}

function mapRow(
  headers: string[],
  row: (string | number | null)[],
  uploadId: string,
  sourceFile: string
): InboundRecord | null {
  const mapped: Partial<InboundRecord> = {
    uploadId,
    sourceFile,
    deductReason: "",
    factoryName: "",
    areaName: "",
    originalAttached: "",
  };

  headers.forEach((header, index) => {
    const field = resolveField(header);
    if (!field) return;
    const value = row[index];
    if (field === "ticketNo") mapped.ticketNo = String(value ?? "").trim();
    else if (field === "outboundDate") mapped.outboundDate = parseDate(value);
    else if (field === "inboundDate") mapped.inboundDate = parseDate(value);
    else if (field === "inboundTime") mapped.inboundTime = parseTime(value);
    else if (
      field === "supplierName" ||
      field === "plateNo" ||
      field === "driverName" ||
      field === "materialType" ||
      field === "regionName" ||
      field === "originalAttached" ||
      field === "deductReason" ||
      field === "factoryName" ||
      field === "areaName"
    ) {
      mapped[field] = String(value ?? "").trim();
    } else if (field === "deductWeight") {
      mapped.deductWeight = roundInboundDeductWeight(parseNumber(value));
    } else if (field === "basePrice") {
      mapped.basePrice = roundInboundBasePrice(parseNumber(value));
    } else if (field === "dryWeight") {
      mapped.dryWeight = roundInboundDryWeight(parseNumber(value));
    } else if (field === "settlementWeight") {
      mapped.settlementWeight = roundInboundSettlementWeight(parseNumber(value));
    } else {
      mapped[field] = parseNumber(value) as never;
    }
  });

  if (!mapped.ticketNo) return null;

  const now = nowString();
  return {
    id: generateId("IR"),
    uploadId,
    ticketNo: mapped.ticketNo,
    outboundDate: mapped.outboundDate ?? "",
    inboundDate: mapped.inboundDate ?? "",
    inboundTime: mapped.inboundTime ?? "",
    supplierName: mapped.supplierName ?? "",
    plateNo: mapped.plateNo ?? "",
    driverName: mapped.driverName ?? "",
    materialType: mapped.materialType ?? "",
    regionName: mapped.regionName ?? "",
    originalAttached: mapped.originalAttached ?? "",
    deductWeight: mapped.deductWeight ?? 0,
    deductReason: mapped.deductReason ?? "",
    netWeight: mapped.netWeight ?? 0,
    moisturePercent: mapped.moisturePercent ?? 0,
    settlementWeight: mapped.settlementWeight ?? 0,
    dryWeight: mapped.dryWeight ?? 0,
    basePrice: mapped.basePrice ?? 0,
    purchaseAmount: mapped.purchaseAmount ?? 0,
    factoryName: mapped.factoryName ?? "",
    areaName: mapped.areaName ?? "",
    sourceFile,
    reviewStatus: "待审核" as const,
    ocrConfidence: 100,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseInboundExcel(
  buffer: Buffer,
  uploadId: string,
  sourceFile: string
) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel 文件中没有可用的工作表");
  }

  const sheet = workbook.Sheets[sheetName];
  const { headerRowIndex, rows } = findHeaderRow(sheet);
  const headerCells = rows[headerRowIndex] ?? [];
  const headers = headerCells.map((cell) => String(cell ?? "").trim());

  const records: InboundRecord[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const hasContent = row.some((cell) => String(cell ?? "").trim() !== "");
    if (!hasContent) continue;
    const record = mapRow(headers, row, uploadId, sourceFile);
    if (record) records.push(record);
  }

  if (records.length === 0) {
    throw new Error("未解析到有效入库单数据，请检查表头是否包含「磅单编号」等字段");
  }

  return records;
}

export type InboundSheetPreviewRow = {
  /** Excel 中的行号（1-based，便于对照原表） */
  sheetRowIndex: number;
  cells: string[];
  ticketNo: string;
  isDataRow: boolean;
};

export type InboundSheetPreview = {
  headers: string[];
  headerRowIndex: number;
  rows: InboundSheetPreviewRow[];
};

function formatCellForDisplay(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    const ss = String(value.getSeconds()).padStart(2, "0");
    return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y > 1900) {
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      if (parsed.H === 0 && parsed.M === 0 && parsed.S === 0) {
        return `${parsed.y}/${m}/${d}`;
      }
      const hh = String(parsed.H).padStart(2, "0");
      const mm = String(parsed.M).padStart(2, "0");
      const ss = String(parsed.S).padStart(2, "0");
      return `${parsed.y}/${m}/${d} ${hh}:${mm}:${ss}`;
    }
    return String(value);
  }
  return String(value).trim();
}

function isSummaryRow(cells: string[]): boolean {
  const text = cells.join("");
  return /总计|合计|小计/.test(text);
}

/** 解析 Excel 为可预览的表格（保留全部行，用于查看时定位高亮） */
export function parseInboundExcelSheetPreview(buffer: Buffer): InboundSheetPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel 文件中没有可用的工作表");
  }

  const sheet = workbook.Sheets[sheetName];
  const { headerRowIndex, rows } = findHeaderRow(sheet);
  const headerCells = rows[headerRowIndex] ?? [];
  const headers = headerCells.map((cell) => String(cell ?? "").trim());
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));

  const previewRows: InboundSheetPreviewRow[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const raw = rows[i] ?? [];
    const cells = Array.from({ length: colCount }, (_, col) =>
      formatCellForDisplay(raw[col])
    );
    const hasContent = cells.some((c) => c !== "");
    if (!hasContent) continue;

    let ticketNo = "";
    headers.forEach((header, col) => {
      if (resolveField(header) === "ticketNo" && !ticketNo) {
        ticketNo = cells[col] ?? "";
      }
    });

    const summary = isSummaryRow(cells);
    previewRows.push({
      sheetRowIndex: i + 1,
      cells,
      ticketNo,
      isDataRow: Boolean(ticketNo) && !summary,
    });
  }

  return {
    headers,
    headerRowIndex: headerRowIndex + 1,
    rows: previewRows,
  };
}
