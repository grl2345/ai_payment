import {
  applyInboundAutoReview,
  applyMeasureAutoReview,
  countNeedsReview,
  evaluateInboundAutoReview,
  isAutoReviewEnabled,
} from "@/lib/import/auto-review";
import { autoConfirmEligibleMatches } from "@/lib/import/auto-confirm";
import { getStore, rebuildMatches, saveStore } from "@/lib/db/store";
import type { DataStore, InboundRecord, UploadedFileRecord } from "@/lib/types";

function resolveInboundSource(
  record: InboundRecord,
  uploads: UploadedFileRecord[]
): "excel" | "image" {
  const upload = uploads.find((item) => item.id === record.uploadId);
  if (upload?.type === "excel") return "excel";
  if (upload?.type === "inbound-image") return "image";
  if (record.sourceFile.match(/\.(xlsx|xls|csv)(\?|$)/i)) return "excel";
  return "image";
}

export function runAutoReviewOnStore(store: DataStore) {
  if (!isAutoReviewEnabled()) {
    return {
      ok: false as const,
      error: "自动核对未启用（AUTO_REVIEW_ENABLED=false）",
    };
  }

  let measureApproved = 0;
  let inboundApproved = 0;

  const measureCtx = {
    allMeasureTickets: store.measureTickets,
  };

  store.measureTickets = store.measureTickets.map((ticket) => {
    if (ticket.ocrStatus !== "待审核") return ticket;
    const next = applyMeasureAutoReview(ticket, {
      ...measureCtx,
      ticketId: ticket.id,
    });
    if (next.ocrStatus === "已审核" && next.reviewSource === "ai") {
      measureApproved += 1;
    }
    return next;
  });

  let inboundReopened = 0;

  const inboundCtx = {
    allInboundRecords: store.inboundRecords,
  };

  store.inboundRecords = store.inboundRecords.map((record) => {
    const source = resolveInboundSource(record, store.uploads);
    const reviewContext = {
      ...inboundCtx,
      recordId: record.id,
    };

    if (
      record.reviewStatus === "已审核" &&
      record.reviewSource === "ai"
    ) {
      const check = evaluateInboundAutoReview(record, source, reviewContext);
      if (!check.approved) {
        inboundReopened += 1;
        return {
          ...record,
          reviewStatus: "待审核" as const,
          reviewSource: undefined,
          reviewHint: check.hint || check.issues.join("；"),
        };
      }
      return record;
    }

    if (record.reviewStatus !== "待审核") return record;
    const next = applyInboundAutoReview(record, source, reviewContext);
    if (next.reviewStatus === "已审核" && next.reviewSource === "ai") {
      inboundApproved += 1;
    }
    return next;
  });

  saveStore(store);
  rebuildMatches();

  const autoConfirm = autoConfirmEligibleMatches(getStore(), "AI");

  const storeAfter = getStore();
  const stats = countNeedsReview(
    storeAfter.measureTickets,
    storeAfter.inboundRecords
  );

  return {
    ok: true as const,
    measureApproved,
    inboundApproved,
    inboundReopened,
    autoConfirmed: autoConfirm.confirmed,
    paymentsFromConfirm: autoConfirm.paymentsCreated,
    autoConfirmSkipped: autoConfirm.skipped,
    autoConfirmErrors: autoConfirm.errors,
    ...stats,
  };
}

export function runAutoReview() {
  return runAutoReviewOnStore(getStore());
}
