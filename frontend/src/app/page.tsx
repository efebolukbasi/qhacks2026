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
        // Track initial IDs so we don't animate them
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
        // Clear the "newly added" animation after it plays
        setTimeout(() => setNewSectionIds(new Set()), 1200);
        // Scroll new content into view
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
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 py-24 text-stone-400">
          <svg
            className="mb-3 h-10 w-10"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
            />
          </svg>
          <p className="text-lg font-medium">Waiting for lecture to begin...</p>
          <p className="text-sm">Notes will appear here in real time</p>
        </div>
      ) : (
        <div className="rounded-xl border border-stone-200 bg-white px-8 py-10 shadow-sm sm:px-12 sm:py-12">
          {/* Document header */}
          <header className="mb-8 text-center">
            <h1
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
            >
              Lecture Notes
            </h1>
            <div className="mx-auto mt-2 h-px w-32 bg-stone-300" />
            <p className="mt-3 text-xs text-stone-400 uppercase tracking-widest">
              Live &middot; {new Date().toLocaleDateString("en-US", {
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
                  {/* Subtle divider between sections (not before first) */}
                  {idx > 0 && shouldShowDivider(notes[idx - 1], note) && (
                    <div className="section-divider" />
                  )}

                  <div
                    onClick={() => handleSectionClick(note.section_id)}
                    className={`section-block cursor-pointer relative group ${
                      isHighlighted ? "highlighted" : ""
                    } ${isNew ? "newly-added" : ""}`}
                  >
                    {/* Highlight badge — floats to the right */}
                    {note.highlight_count > 0 && (
                      <span className="absolute -right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 text-[10px] font-bold text-stone-900 opacity-0 group-hover:opacity-100 transition-opacity">
                        {note.highlight_count}
                      </span>
                    )}

                    {/* Render content based on type */}
                    {note.type === "diagram" ? (
                      <figure className="my-4">
                        {note.image_url ? (
                          <div className="mx-auto max-w-md">
                            <img
                              src={`${BACKEND_URL}${note.image_url}`}
                              alt={note.caption || "Generated diagram"}
                              className="w-full rounded border border-stone-200 bg-white"
                            />
                          </div>
                        ) : (
                          <div
                            className="mx-auto max-w-md rounded border border-stone-200 bg-white p-6 text-stone-800 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full"
                            dangerouslySetInnerHTML={{ __html: note.content }}
                          />
                        )}
                        {note.caption && (
                          <figcaption className="mt-2 text-center text-sm italic text-stone-500">
                            {note.caption}
                          </figcaption>
                        )}
                      </figure>
                    ) : note.type === "definition" ? (
                      <div className="my-3 rounded-lg border-l-4 border-blue-400 bg-blue-50/50 py-2 pl-4 pr-2">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                          Definition
                        </p>
                        <LatexContent text={note.content} />
                      </div>
                    ) : note.type === "equation" ? (
                      <div className="my-3">
                        <LatexContent text={note.content} />
                      </div>
                    ) : (
                      <div className="my-1">
                        <LatexContent text={note.content} />
                      </div>
                    )}

                    {/* Expand: comment / highlight bar */}
                    {isExpanded && (
                      <div
                        className="mt-2 mb-1 flex gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Leave a question (optional)..."
                          className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                          style={{ fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              handleHighlight(note.section_id);
                            if (e.key === "Escape") setExpandedId(null);
                          }}
                        />
                        <button
                          onClick={() => handleHighlight(note.section_id)}
                          disabled={sending}
                          className="rounded-md bg-yellow-400 px-3 py-1.5 text-xs font-semibold text-stone-900 transition-colors hover:bg-yellow-500"
                          style={{ fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}
                        >
                          {commentText.trim() ? "Send" : "Highlight"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </article>

          {/* Tip at the bottom */}
          <p
            className="mt-8 border-t border-stone-100 pt-4 text-center text-xs text-stone-400"
            style={{ fontFamily: "var(--font-geist-sans), Arial, sans-serif" }}
          >
            Click any section to highlight it or leave a question for your professor
          </p>
        </div>
      )}
    </div>
  );
}

/** Show a divider when the section type changes, or between unrelated blocks */
function shouldShowDivider(prev: NoteSection, curr: NoteSection): boolean {
  if (prev.type !== curr.type) return true;
  // Always separate diagrams
  if (prev.type === "diagram" || curr.type === "diagram") return true;
  return false;
}
