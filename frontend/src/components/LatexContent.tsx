"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renders text with LaTeX math, Overleaf-style.
 * Supports:
 *   $$...$$ → display math (block, centered)
 *   $...$  → inline math
 *   \[...\] → display math (block)
 *   \(...\) → inline math
 *   Newlines → preserved
 */
export default function LatexContent({ text }: { text: string }) {
  const parts = useMemo(() => {
    // Match $$ (display), $ (inline), \[...\] (display), \(...\) (inline)
    const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
    const segments: { type: "text" | "display" | "inline"; value: string }[] =
      [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({
          type: "text",
          value: text.slice(lastIndex, match.index),
        });
      }
      const raw = match[1];
      if (raw.startsWith("$$")) {
        segments.push({ type: "display", value: raw.slice(2, -2).trim() });
      } else if (raw.startsWith("$")) {
        segments.push({ type: "inline", value: raw.slice(1, -1).trim() });
      } else if (raw.startsWith("\\[")) {
        segments.push({ type: "display", value: raw.slice(2, -2).trim() });
      } else {
        segments.push({ type: "inline", value: raw.slice(2, -2).trim() });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }
    return segments;
  }, [text]);

  return (
    <div className="latex-content leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === "display") {
          try {
            const html = katex.renderToString(part.value, {
              displayMode: true,
              throwOnError: false,
            });
            return (
              <div
                key={i}
                className="my-3 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <div key={i} className="my-3 font-mono text-sm text-red-500">
                {part.value}
              </div>
            );
          }
        }
        if (part.type === "inline") {
          try {
            const html = katex.renderToString(part.value, {
              displayMode: false,
              throwOnError: false,
            });
            return (
              <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
            );
          } catch {
            return (
              <code key={i} className="text-red-500">
                {part.value}
              </code>
            );
          }
        }
        // Plain text — preserve newlines
        return (
          <span key={i}>
            {part.value.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}
