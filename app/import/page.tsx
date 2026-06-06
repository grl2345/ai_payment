import { Suspense } from "react";
import { DocumentCenter } from "@/components/operations/document-center";
import { Loader2 } from "lucide-react";

export default function ImportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中…
        </div>
      }
    >
      <DocumentCenter />
    </Suspense>
  );
}
