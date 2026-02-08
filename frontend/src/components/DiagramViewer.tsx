'use client'

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";

interface DiagramViewerProps {
  src: string;
  alt: string;
  caption?: string;
}

export default function DiagramViewer({ src, alt, caption }: DiagramViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [lightbox, setLightbox] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(z + 0.5, 4));
  }, []);

  const zoomOut = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => {
      const next = Math.max(z - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const openLightbox = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setLightbox(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const closeLightbox = useCallback(() => {
    setLightbox(false);
    resetZoom();
  }, [resetZoom]);

  const copyImage = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const pngBlob = blob.type === "image/png"
        ? blob
        : await new Promise<Blob>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((b) => resolve(b!), "image/png");
            };
            img.src = URL.createObjectURL(blob);
          });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy image:", err);
    }
  }, [src]);

  // Pan handlers for zoomed lightbox
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: pan.x, startPanY: pan.y };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ESC key and scroll-wheel zoom in lightbox
  useEffect(() => {
    if (!lightbox) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 4));
      if (e.key === "-") {
        setZoom((z) => {
          const next = Math.max(z - 0.5, 1);
          if (next === 1) setPan({ x: 0, y: 0 });
          return next;
        });
      }
    };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoom((z) => {
        const next = Math.min(Math.max(z + delta, 1), 4);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [lightbox, closeLightbox]);

  return (
    <>
      {/* Inline diagram with hover overlay */}
      <div className="diagram-frame group/diag" onClick={openLightbox}>
        <div className="diagram-img-wrap">
          <Image
            src={src}
            alt={alt}
            fill
            className="rounded object-contain transition-transform duration-500 ease-out group-hover/diag:scale-[1.03]"
            unoptimized
          />
        </div>

        {/* "Click to expand" hint — bottom center on hover */}
        <span className="diagram-expand-hint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
          Click to expand
        </span>

        {/* Hover toolbar — top-right */}
        <div className="diagram-toolbar">
          <button
            type="button"
            onClick={copyImage}
            title={copied ? "Copied!" : "Copy image"}
            className="diagram-tool-btn"
          >
            {copied ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>

        {caption && (
          <figcaption className="diagram-inline-caption">
            {caption}
          </figcaption>
        )}
      </div>

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          className="diagram-lightbox"
          onClick={closeLightbox}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Close hint */}
          <div className="diagram-lb-close">
            <span className="font-mono text-[10px] tracking-wider text-cream/50">
              ESC or click backdrop to close
            </span>
          </div>

          {/* Zoom controls */}
          <div className="diagram-lb-controls" onClick={(e) => e.stopPropagation()}>
            <button onClick={zoomOut} disabled={zoom <= 1} className="diagram-lb-btn" title="Zoom out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <span className="diagram-lb-zoom-label">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={zoomIn} disabled={zoom >= 4} className="diagram-lb-btn" title="Zoom in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <line x1="11" y1="8" x2="11" y2="14" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </button>
            <div className="diagram-lb-sep" />
            <button onClick={copyImage} className="diagram-lb-btn" title={copied ? "Copied!" : "Copy image"}>
              {copied ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
              className="diagram-lb-btn"
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Image */}
          <div
            ref={containerRef}
            className="diagram-lb-image-wrap"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            style={{
              cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
            }}
          >
            <img
              src={src}
              alt={alt}
              className="diagram-lb-image"
              draggable={false}
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              }}
            />
          </div>

          {caption && (
            <p className="diagram-lb-caption">{caption}</p>
          )}
        </div>
      )}
    </>
  );
}
