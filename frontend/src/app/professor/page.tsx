"use client";

import { useEffect, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import LatexContent from "@/components/LatexContent";

interface NoteSection {
  section_id: string;
  type: "definition" | "equation" | "step" | "note" | "diagram";
  content: string;
  caption?: string;
  image_url?: string;
  highlight_count: number;
}

interface Comment {
  id: number;
  section_id: string;
  comment: string;
  created_at: string;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const TYPE_META: Record<NoteSection["type"], { label: string; color: string }> =
  {
    definition: { label: "Def.", color: "text-copper" },
    equation: { label: "Eq.", color: "text-lamplight" },
    step: { label: "Step", color: "text-on-dark-dim" },
    note: { label: "Note", color: "text-graphite" },
    diagram: { label: "Fig.", color: "text-copper" },
  };

export default function ProfessorPage() {
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [notesRes, commentsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/notes`),
        fetch(`${BACKEND_URL}/comments`),
      ]);
      if (notesRes.ok) setNotes(await notesRes.json());
      if (commentsRes.ok) setComments(await commentsRes.json());
    } catch {
      // backend not available yet
    }
  }, []);

  useEffect(() => {
    fetchData();

    const socket = getSocket();

    socket.on("notes_update", (data: NoteSection[]) => {
      setNotes(data);
    });

    socket.on(
      "highlight_update",
      (data: { section_id: string; highlight_count: number }) => {
        setNotes((prev) =>
          prev.map((n) =>
            n.section_id === data.section_id
              ? { ...n, highlight_count: data.highlight_count }
              : n
          )
        );
        fetch(`${BACKEND_URL}/comments`)
          .then((r) => (r.ok ? r.json() : []))
          .then(setComments)
          .catch(() => {});
      }
    );

    return () => {
      socket.off("notes_update");
      socket.off("highlight_update");
    };
  }, [fetchData]);

  const sortedByHighlights = [...notes].sort(
    (a, b) => b.highlight_count - a.highlight_count
  );

  const maxHighlights = Math.max(...notes.map((n) => n.highlight_count), 1);
  const flaggedCount = notes.filter((n) => n.highlight_count > 0).length;
  const noteMap = new Map(notes.map((n) => [n.section_id, n]));

  return (
    <div>
      {/* Page header */}
      <div className="mb-10 border-b border-rule pb-6">
        <h1 className="font-display text-4xl italic text-on-dark">
          Dashboard
        </h1>
        <p className="mt-3 font-mono text-[11px] tracking-wide text-graphite">
          Real-time student engagement &amp; confusion metrics
        </p>
      </div>

      {/* ── Confusion Heatmap ── */}
      <section className="mb-14">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-xl italic text-on-dark">
            Confusion Heatmap
          </h2>
          <span className="font-mono text-[10px] tracking-wider text-graphite">
            {flaggedCount} of {notes.length} flagged
          </span>
        </div>

        {sortedByHighlights.length === 0 ? (
          <p className="font-display text-sm italic text-graphite/50">
            No data yet&hellip;
          </p>
        ) : (
          <div>
            {/* Table header */}
            <div className="flex items-center border-b border-on-dark/8 pb-2 font-mono text-[9px] font-medium uppercase tracking-[0.15em] text-graphite/50">
              <span className="w-10 pr-3 text-right">#</span>
              <span className="w-14">type</span>
              <span className="flex-1">section</span>
              <span className="w-36 text-center">distribution</span>
              <span className="w-12 text-right">n</span>
            </div>

            {sortedByHighlights.map((note, i) => {
              const meta = TYPE_META[note.type];
              const pct = (note.highlight_count / maxHighlights) * 100;
              const isHot = pct >= 60;
              const isWarm = pct >= 30 && pct < 60;

              return (
                <div
                  key={note.section_id}
                  className={`flex items-center border-b border-rule py-3.5 transition-colors hover:bg-white/[0.015] ${
                    note.highlight_count === 0 ? "opacity-25" : ""
                  }`}
                >
                  <span className="w-10 pr-3 text-right font-mono text-[11px] text-graphite/40">
                    {i + 1}
                  </span>

                  <span className="w-14">
                    <span
                      className={`font-mono text-[10px] font-medium uppercase tracking-wider ${meta.color}`}
                    >
                      {meta.label}
                    </span>
                  </span>

                  <div className="min-w-0 flex-1 pr-4">
                    {note.type === "diagram" ? (
                      <span className="font-body text-sm italic text-graphite">
                        {note.caption || "Diagram"}
                      </span>
                    ) : (
                      <div className="latex-truncate font-body text-sm text-on-dark/70">
                        <LatexContent
                          text={
                            note.content.length > 90
                              ? note.content.slice(0, 90) + "\u2026"
                              : note.content
                          }
                        />
                      </div>
                    )}
                  </div>

                  <div className="w-36 px-2">
                    <div className="relative h-[5px] w-full bg-white/[0.04]">
                      <div
                        className={`bar-animate absolute inset-y-0 left-0 ${
                          isHot
                            ? "bg-cinnabar"
                            : isWarm
                              ? "bg-lamplight"
                              : "bg-copper/50"
                        }`}
                        style={{
                          width: `${pct}%`,
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    </div>
                  </div>

                  <span
                    className={`w-12 text-right font-mono text-sm font-semibold ${
                      isHot
                        ? "text-cinnabar"
                        : note.highlight_count > 0
                          ? "text-on-dark/60"
                          : "text-graphite/30"
                    }`}
                  >
                    {note.highlight_count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Student Annotations ── */}
      <section>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-display text-xl italic text-on-dark">
            Student Annotations
          </h2>
          <span className="font-mono text-[10px] tracking-wider text-graphite">
            {comments.length} received
          </span>
        </div>

        {comments.length === 0 ? (
          <p className="font-display text-sm italic text-graphite/50">
            No annotations yet&hellip;
          </p>
        ) : (
          <div>
            {comments.map((c, i) => {
              const relatedNote = noteMap.get(c.section_id);
              return (
                <div
                  key={c.id}
                  className={`py-4 ${i > 0 ? "border-t border-rule" : ""}`}
                >
                  <div className="flex gap-4">
                    <span className="shrink-0 font-display text-2xl leading-none text-cinnabar/25 select-none">
                      &ldquo;
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-body text-[15px] leading-relaxed text-on-dark">
                        {c.comment}
                      </p>

                      {relatedNote && (
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={`font-mono text-[9px] font-medium uppercase tracking-wider ${TYPE_META[relatedNote.type].color}`}
                          >
                            {TYPE_META[relatedNote.type].label}
                          </span>
                          <div className="latex-truncate font-mono text-[11px] text-graphite/50">
                            {relatedNote.type === "diagram"
                              ? relatedNote.caption || "Diagram"
                              : <LatexContent text={
                                  relatedNote.content.length > 60
                                    ? relatedNote.content.slice(0, 60) + "\u2026"
                                    : relatedNote.content
                                } />}
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="shrink-0 pt-0.5 font-mono text-[10px] text-graphite/30">
                      {new Date(c.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
