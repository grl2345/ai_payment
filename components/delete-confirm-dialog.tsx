"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, Trash2 } from "lucide-react";

export type DeleteConfirmKind = "measure" | "inbound";

const KIND_META: Record<
  DeleteConfirmKind,
  { title: string; noun: string }
> = {
  measure: { title: "删除计量单", noun: "计量单" },
  inbound: { title: "删除入库单", noun: "入库单" },
};

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DeleteConfirmKind | null;
  label: string;
  /** 次要说明，如车牌、供应商 */
  subtitle?: string;
  deleting?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  kind,
  label,
  subtitle,
  deleting = false,
  onConfirm,
}: DeleteConfirmDialogProps) {
  if (!kind) return null;

  const meta = KIND_META[kind];

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader className="text-left">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <AlertDialogTitle>{meta.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    即将永久删除以下{meta.noun}，相关匹配关系也会一并移除：
                  </p>
                  <p className="rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm text-foreground">
                    {label}
                  </p>
                  {subtitle ? (
                    <p className="text-xs">{subtitle}</p>
                  ) : null}
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>此操作不可恢复，请确认后再删除。</span>
                  </p>
                </div>
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-end">
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
          >
            {deleting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" />
                删除中…
              </>
            ) : (
              "确认删除"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
