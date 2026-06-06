"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImagePanViewer } from "@/components/image-pan-viewer";
import { ImageZoomToolbar } from "@/components/image-zoom-toolbar";

export type ImagePreviewItem = {
  title: string;
  src: string;
};

const MIN_ZOOM = 50;
const MAX_ZOOM = 300;
const ZOOM_STEP = 25;

export function ImagePreviewDialog({
  preview,
  onClose,
  showRotate = true,
}: {
  preview: ImagePreviewItem | null;
  onClose: () => void;
  showRotate?: boolean;
}) {
  const open = preview !== null;
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [panResetKey, setPanResetKey] = useState(0);

  useEffect(() => {
    if (open) {
      setZoom(100);
      setRotation(0);
      setPanResetKey((k) => k + 1);
    }
  }, [open, preview?.src]);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex w-[95vw] max-h-[92vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle>{preview?.title ?? "单据图片"}</DialogTitle>
            <ImageZoomToolbar
              zoom={zoom}
              showRotate={showRotate}
              onZoomIn={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
              onZoomOut={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
              onRotate={
                showRotate ? () => setRotation((r) => (r + 90) % 360) : undefined
              }
              onResetPan={() => setPanResetKey((k) => k + 1)}
            />
          </div>
        </DialogHeader>
        {preview ? (
          <div className="min-h-0 flex-1 rounded-lg border bg-muted/20 p-2">
            <ImagePanViewer
              src={preview.src}
              alt={preview.title}
              zoom={zoom}
              rotation={rotation}
              resetKey={panResetKey}
              heightClass="h-[calc(92vh-140px)] min-h-[320px]"
              onWheelZoom={(delta) =>
                setZoom((z) => clampZoom(z + (delta > 0 ? -ZOOM_STEP : ZOOM_STEP)))
              }
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
