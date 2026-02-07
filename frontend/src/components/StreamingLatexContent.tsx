"use client";

import { useEffect, useState, useRef } from "react";
import LatexContent from "./LatexContent";

/**
 * Typewriter wrapper around LatexContent.
 *
 * When `stream` is true the text is revealed character-by-character, then once
 * the animation finishes the full LatexContent (with KaTeX rendering) replaces
 * it. When `stream` is false it renders LatexContent immediately.
 *
 * The typing speed adapts to content length so short notes don't feel sluggish
 * and long ones don't take forever.
 */
export default function StreamingLatexContent({
  text,
  stream,
  onStreamComplete,
}: {
  text: string;
  stream: boolean;
  onStreamComplete?: () => void;
}) {
  const [visibleLen, setVisibleLen] = useState(stream ? 0 : text.length);
  const [done, setDone] = useState(!stream);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || done) return;

    // Adaptive speed: aim to finish in ~1.2–2.5 s regardless of length
    const totalChars = text.length;
    const durationMs = Math.min(2500, Math.max(1200, totalChars * 12));
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease-out curve so it starts fast and decelerates
      const eased = 1 - Math.pow(1 - progress, 2);
      const chars = Math.floor(eased * totalChars);
      setVisibleLen(chars);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setVisibleLen(totalChars);
        setDone(true);
        onStreamComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stream, text, done, onStreamComplete]);

  // Once done, render with full KaTeX support
  if (done) {
    return <LatexContent text={text} />;
  }

  // During streaming: show plain text with a blinking cursor
  // We slice carefully to avoid splitting in the middle of a $ or \( delimiter
  const visible = text.slice(0, visibleLen);

  return (
    <div className="latex-content leading-relaxed whitespace-pre-wrap">
      <span>{visible}</span>
      <span className="streaming-cursor" />
    </div>
  );
}
