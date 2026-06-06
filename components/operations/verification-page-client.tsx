"use client";

import { useSearchParams } from "next/navigation";
import { AiReviewPanel } from "@/components/operations/ai-review-panel";

export function VerificationPageClient() {
  const searchParams = useSearchParams();
  const ticketNo = searchParams.get("ticketNo")?.trim() || undefined;
  const matchId = searchParams.get("matchId")?.trim() || undefined;

  return (
    <AiReviewPanel
      embedded
      highlightTicketNo={ticketNo}
      highlightMatchId={matchId}
    />
  );
}
