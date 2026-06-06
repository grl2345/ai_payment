import { redirect } from "next/navigation";

/** 旧「业务办理」入口 → 单据中心 AI 核对 */
export default function OperationsPage() {
  redirect("/import?tab=passed");
}
