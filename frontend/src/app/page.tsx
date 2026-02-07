"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function StudentPage() {
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [newSectionIds, setNewSectionIds] = useState<Set<string>>(new Set());
  const prevNoteIdsRef = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/notes`);
      if (res.ok) {
        const data: NoteSection[] = await res.json();
        setNotes(data);
        prevNoteIdsRef.current = new Set(data.map((n) => n.section_id));
      }
    } catch {
      // backend not available yet
    }
  }, []);

  useEffect(() => {
    fetchNotes();

    const socket = getSocket();

    socket.on("notes_update", (data: NoteSection[]) => {
      const incoming = new Set(data.map((n) => n.section_id));
      const added = new Set<string>();
      incoming.forEach((id) => {
        if (!prevNoteIdsRef.current.has(id)) added.add(id);
      });

      setNotes(data);
      prevNoteIdsRef.current = incoming;

      if (added.size > 0) {
        setNewSectionIds(added);
        setTimeout(() => setNewSectionIds(new Set()), 1200);
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
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
      }
    );

    return () => {
      socket.off("notes_update");
      socket.off("highlight_update");
    };
  }, [fetchNotes]);

  const handleHighlight = (sectionId: string) => {
    const socket = getSocket();

    if (expandedId === sectionId && commentText.trim()) {
      setSending(true);
      socket.emit("highlight_section", {
        section_id: sectionId,
        comment: commentText.trim(),
      });
      setCommentText("");
      setExpandedId(null);
      setSending(false);
    } else if (expandedId === sectionId) {
      socket.emit("highlight_section", { section_id: sectionId });
      setExpandedId(null);
    } else {
      setExpandedId(sectionId);
      setCommentText("");
    }
  };

  const handleSectionClick = (sectionId: string) => {
    if (expandedId === sectionId) {
      setExpandedId(null);
    } else {
      setExpandedId(sectionId);
      setCommentText("");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {notes.length === 0 ? (
        /* Empty state — minimal, warm */
        <div className="py-32 text-center">
          <p className="font-display text-3xl italic text-on-dark-dim/40">
            Awaiting lecture&hellip;
          </p>
          <p className="mt-4 font-mono text-[11px] text-graphite/50">
            Notes will appear as the professor writes on the board
          </p>
        </div>
      ) : (
        /* The paper page — cream document on dark desk */
        <div className="paper-page px-10 py-12 sm:px-14 sm:py-14">
          {/* Document header — centered, editorial */}
          <header className="mb-10 text-center">
            <h1 className="font-display text-[2rem] font-semibold italic tracking-tight text-ink sm:text-[2.5rem]">
              Lecture Notes
            </h1>
            <div className="mx-auto mt-3 h-px w-20 bg-ink/10" />
            <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-mid/60">
              Live &middot;{" "}
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </header>

          {/* Flowing document content */}
          <article className="latex-document">
            {notes.map((note, idx) => {
              const isHighlighted = note.highlight_count > 0;
              const isNew = newSectionIds.has(note.section_id);
              const isExpanded = expandedId === note.section_id;

              return (
                <div key={note.section_id}>
                  {idx > 0 && shouldShowDivider(notes[idx - 1], note) && (
                    <div className="section-divider" />
                  )}

                  <div
                    onClick={() => handleSectionClick(note.section_id)}
                    className={`section-block cursor-pointer relative group ${
                      isHighlighted ? "highlighted" : ""
                    } ${isNew ? "newly-added" : ""}`}
                  >
                    {/* Flag count — appears in margin on hover */}
                    {note.highlight_count > 0 && (
                      <span className="absolute -right-2 top-1.5 font-display text-sm font-semibold text-cinnabar opacity-0 transition-opacity group-hover:opacity-100">
                        {note.highlight_count}
                      </span>
                    )}

                    {/* Render by type */}
                    {note.type === "diagram" ? (
                      <figure className="my-4">
                        {note.image_url ? (
                          <div className="mx-auto max-w-md">
                            <img
                              src={`${BACKEND_URL}${note.image_url}`}
                              alt={note.caption || "Generated diagram"}
                              className="w-full border border-ink/5"
                            />
                          </div>
                        ) : (
                          <div
                            className="mx-auto max-w-md border border-ink/5 p-6 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: note.content }}
                          />
                        )}
                        {note.caption && (
                          <figcaption className="mt-2 text-center font-mono text-[11px] italic text-ink-mid">
                            {note.caption}
                          </figcaption>
                        )}
                      </figure>
                    ) : note.type === "definition" ? (
                      <div className="def-callout">
                        <p className="mb-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-copper">
                          Definition
                        </p>
                        <LatexContent text={note.content} />
                      </div>
                    ) : note.type === "equation" ? (
                      <div className="eq-display">
                        <LatexContent text={note.content} />
                      </div>
                    ) : (
                      <div className="my-1">
                        <LatexContent text={note.content} />
                      </div>
                    )}

                    {/* Annotation prompt — expands inline */}
                    {isExpanded && (
                      <div
                        className="mt-3 mb-1 border-t border-ink/8 pt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-display text-sm italic text-cinnabar/50 select-none">
                            annotate
                          </span>
                          <div className="flex-1 border-b border-ink/15">
                            <input
                              type="text"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              placeholder="leave a question (optional)"
                              className="annotation-field w-full bg-transparent py-1.5 text-[12px] text-ink outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  handleHighlight(note.section_id);
                                if (e.key === "Escape") setExpandedId(null);
                              }}
                            />
                          </div>
                          <button
                            onClick={() => handleHighlight(note.section_id)}
                            disabled={sending}
                            className="border border-cinnabar/25 px-3.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-cinnabar transition-all hover:border-cinnabar/50 hover:bg-cinnabar/5 disabled:opacity-30"
                          >
                            {commentText.trim() ? "submit" : "flag"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </article>

          {/* Footer hint */}
          <p className="mt-10 border-t border-ink/6 pt-4 text-center font-mono text-[10px] text-ink-mid/40">
            Click any section to flag confusion or annotate with a question
          </p>
        </div>
      )}
    </div>
  );
}

/** Show a divider when the section type changes, or between unrelated blocks */
function shouldShowDivider(prev: NoteSection, curr: NoteSection): boolean {
  if (prev.type !== curr.type) return true;
  if (prev.type === "diagram" || curr.type === "diagram") return true;
  return false;
}
