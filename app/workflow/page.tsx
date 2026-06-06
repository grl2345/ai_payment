import { redirect } from "next/navigation";

export default function WorkflowPage() {
  redirect("/operations?tab=outcome");
}
