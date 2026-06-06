"use client";

import { useEffect, useRef, useState } from "react";

export function ImagePanViewer({
  src,
  alt = "单据图片",
  zoom,
  rotation,
  resetKey = 0,
  heightClass = "h-[calc(94vh-200px)]",
  onWheelZoom,
}: {
  src: string;
  alt?: string;
  zoom: number;
  rotation: number;
  resetKey?: number;
  heightClass?: string;
  /** 滚轮缩放：deltaY > 0 为缩小方向 */
  onWheelZoom?: (deltaY: number) => void;
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [src, rotation, resetKey]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    viewportRef.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + e.clientX - dragStart.current.x,
      y: dragStart.current.panY + e.clientY - dragStart.current.y,
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (viewportRef.current?.hasPointerCapture(e.pointerId)) {
      viewportRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!onWheelZoom) return;
    e.preventDefault();
    onWheelZoom(e.deltaY);
  };

  return (
    <div
      ref={viewportRef}
      className={`relative w-full ${heightClass} overflow-hidden touch-none select-none ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onWheel={handleWheel}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full h-full w-auto object-contain pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.05s ease-out",
          }}
        />
      </div>
      <p className="absolute bottom-2 left-2 text-[11px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded pointer-events-none">
        {onWheelZoom ? "滚轮缩放 · 按住拖动查看" : "按住图片拖动查看"}
      </p>
    </div>
  );
}
