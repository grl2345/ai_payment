import {
  confirmMeasureTicket,
  getStore,
  updateMeasureTicket,
} from "@/lib/db/store";
import { getMeasureDuplicateMessage } from "@/lib/import/ticket-uniqueness";
import type { MeasureTicket } from "@/lib/types";

const EDITABLE_FIELDS: (keyof MeasureTicket)[] = [
  "ticketNo",
  "supplierName",
  "plateNo",
  "driverName",
  "materialName",
  "materialType",
  "sourceArea",
  "unloadPlace",
  "location",
  "grossWeight",
  "tareWeight",
  "netWeight",
  "deductWeight",
  "actualWeight",
  "grossTime",
  "tareTime",
];

export function pickEditableFields(body: Record<string, unknown>) {
  const patch: Partial<MeasureTicket> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      patch[field] = body[field] as never;
    }
  }
  return patch;
}

export function getMeasureTicketById(id: string) {
  return getStore().measureTickets.find((item) => item.id === id) ?? null;
}

export function patchMeasureTicket(
  id: string,
  body: Record<string, unknown>
) {
  const patch = pickEditableFields(body);
  const confirm = body.confirm === true;

  const existing = getMeasureTicketById(id);
  if (!existing) {
    return { error: "计量单不存在", status: 404 as const };
  }

  const nextTicketNo =
    typeof patch.ticketNo === "string" ? patch.ticketNo : existing.ticketNo;
  const duplicateMsg = getMeasureDuplicateMessage(
    getStore(),
    nextTicketNo,
    id
  );
  if (duplicateMsg) {
    return { error: duplicateMsg, status: 409 as const };
  }

  const ticket = confirm
    ? confirmMeasureTicket(id, patch)
    : updateMeasureTicket(id, {
        ...patch,
        ocrStatus:
          existing.ocrStatus === "已审核" ? "已审核" : "待审核",
      });

  if (!ticket) {
    return { error: "计量单不存在", status: 404 as const };
  }

  return { ticket, status: 200 as const };
}
