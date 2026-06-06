import {
  confirmInboundRecord,
  getStore,
  updateInboundRecord,
} from "@/lib/db/store";
import { normalizeInboundNumericFields } from "@/lib/import/inbound-display";
import { getInboundDuplicateMessage } from "@/lib/import/ticket-uniqueness";
import type { InboundRecord } from "@/lib/types";

const EDITABLE_FIELDS: (keyof InboundRecord)[] = [
  "ticketNo",
  "outboundDate",
  "inboundDate",
  "inboundTime",
  "supplierName",
  "plateNo",
  "driverName",
  "materialType",
  "regionName",
  "originalAttached",
  "deductWeight",
  "deductReason",
  "netWeight",
  "moisturePercent",
  "settlementWeight",
  "dryWeight",
  "basePrice",
  "purchaseAmount",
  "factoryName",
  "areaName",
];

export function pickInboundEditableFields(body: Record<string, unknown>) {
  const patch: Partial<InboundRecord> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      patch[field] = body[field] as never;
    }
  }
  return normalizeInboundNumericFields(patch);
}

export function getInboundRecordById(id: string) {
  return getStore().inboundRecords.find((item) => item.id === id) ?? null;
}

export function patchInboundRecord(id: string, body: Record<string, unknown>) {
  const patch = pickInboundEditableFields(body);
  const confirm = body.confirm === true;

  const existing = getInboundRecordById(id);
  if (!existing) {
    return { error: "入库单不存在", status: 404 as const };
  }

  const nextTicketNo =
    typeof patch.ticketNo === "string" ? patch.ticketNo : existing.ticketNo;
  const duplicateMsg = getInboundDuplicateMessage(
    getStore(),
    nextTicketNo,
    id
  );
  if (duplicateMsg) {
    return { error: duplicateMsg, status: 409 as const };
  }

  const record = confirm
    ? confirmInboundRecord(id, patch)
    : updateInboundRecord(id, {
        ...patch,
        reviewStatus:
          existing.reviewStatus === "已审核" ? "已审核" : "待审核",
      });

  if (!record) {
    return { error: "入库单不存在", status: 404 as const };
  }

  return { record, status: 200 as const };
}
