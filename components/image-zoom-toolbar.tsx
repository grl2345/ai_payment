"use client";

import { Button } from "@/components/ui/button";
import { Move, RotateCw, ZoomIn, ZoomOut } from "lucide-react";

export function ImageZoomToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onRotate,
  onResetPan,
  showRotate = true,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate?: () => void;
  onResetPan?: () => void;
  showRotate?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        title="缩小"
        onClick={onZoomOut}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
        {zoom}%
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8"
        title="放大"
        onClick={onZoomIn}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      {showRotate && onRotate ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title="旋转"
          onClick={onRotate}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
      ) : null}
      {onResetPan ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title="重置位置"
          onClick={onResetPan}
        >
          <Move className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
