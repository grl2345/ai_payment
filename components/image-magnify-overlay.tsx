"use client";

import { ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

/** 缩略图上的放大镜提示 */
export function ImageMagnifyOverlay({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100",
        className
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-md">
        <ZoomIn className="h-4 w-4" />
      </span>
    </span>
  );
}
