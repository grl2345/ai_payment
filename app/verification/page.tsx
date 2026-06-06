import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 原 AI 核对页已并入单据中心「AI核对」Tab */
export default async function VerificationPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set("tab", "passed");

  const ticketNo = params.ticketNo;
  const matchId = params.matchId;
  const status = params.status;

  if (typeof ticketNo === "string" && ticketNo.trim()) {
    qs.set("ticketNo", ticketNo.trim());
  }
  if (typeof matchId === "string" && matchId.trim()) {
    qs.set("matchId", matchId.trim());
  }
  if (typeof status === "string" && status.trim()) {
    qs.set("status", status.trim());
  }

  redirect(`/import?${qs.toString()}`);
}
