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

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

const TYPE_COLORS: Record<NoteSection["type"], string> = {
  definition: "bg-blue-100 text-blue-800",
  equation: "bg-purple-100 text-purple-800",
  step: "bg-green-100 text-green-800",
  note: "bg-stone-100 text-stone-700",
  diagram: "bg-teal-100 text-teal-800",
};

function highlightBg(count: number): string {
  if (count >= 6) return "bg-yellow-500/40";
  if (count >= 3) return "bg-yellow-300/40";
  if (count >= 1) return "bg-yellow-100/60";
  return "bg-white";
}

export default function StudentPage() {
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/notes`);
      if (res.ok) {
        const data: NoteSection[] = await res.json();
        setNotes(data);
      }
    } catch {
      // backend not available yet
    }
  }, []);

  useEffect(() => {
    fetchNotes();

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">Lecture Notes</h1>
        <p className="mt-1 text-sm text-stone-500">
          Tap a section to highlight it or leave a question
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 py-20 text-stone-400">
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
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <div
              key={note.section_id}
              onClick={() => handleHighlight(note.section_id)}
              className={`cursor-pointer rounded-xl border border-stone-200 p-4 shadow-sm transition-colors duration-300 hover:shadow-md ${highlightBg(note.highlight_count)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <span
                    className={`mb-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[note.type]}`}
                  >
                    {note.type}
                  </span>

                  {note.type === "diagram" ? (
                    <div className="mt-2">
                      {note.image_url ? (
                        <div className="mx-auto max-w-lg">
                          <img
                            src={`${BACKEND_URL}${note.image_url}`}
                            alt={note.caption || "Generated diagram"}
                            className="w-full rounded-lg border border-stone-200 bg-white"
                          />
                        </div>
                      ) : (
                        <div
                          className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-6 text-stone-800 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: note.content }}
                        />
                      )}
                      {note.caption && (
                        <p className="mt-2 text-center text-sm italic text-stone-500">
                          {note.caption}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 text-stone-800">
                      <LatexContent text={note.content} />
                    </div>
                  )}
                </div>
                {note.highlight_count > 0 && (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-yellow-400 text-xs font-bold text-stone-900">
                    {note.highlight_count}
                  </span>
                )}
              </div>

              {expandedId === note.section_id && (
                <div
                  className="mt-3 flex gap-2 border-t border-stone-200 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a question (optional)..."
                    className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleHighlight(note.section_id);
                    }}
                  />
                  <button
                    onClick={() => handleHighlight(note.section_id)}
                    disabled={sending}
                    className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-semibold text-stone-900 transition-colors hover:bg-yellow-500"
                  >
                    {commentText.trim() ? "Send" : "Highlight"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
