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

const TYPE_COLORS: Record<NoteSection["type"], string> = {
  definition: "bg-blue-100 text-blue-800",
  equation: "bg-purple-100 text-purple-800",
  step: "bg-green-100 text-green-800",
  note: "bg-stone-100 text-stone-700",
  diagram: "bg-teal-100 text-teal-800",
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

  const noteMap = new Map(notes.map((n) => [n.section_id, n]));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-800">
          Professor Dashboard
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          See what students are engaging with most
        </p>
      </div>

      {/* Most Highlighted Section */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-stone-700">
          Most Highlighted
        </h2>
        {sortedByHighlights.length === 0 ? (
          <p className="text-sm text-stone-400">No notes yet</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedByHighlights.map((note, i) => (
              <div
                key={note.section_id}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-500">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span
                    className={`mr-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[note.type]}`}
                  >
                    {note.type}
                  </span>
                  {note.type === "diagram" ? (
                    <span className="text-sm italic text-stone-500">
                      {note.caption || "Diagram"}
                    </span>
                  ) : (
                    <div className="text-sm text-stone-700">
                      <LatexContent text={
                        note.content.length > 120
                          ? note.content.slice(0, 120) + "..."
                          : note.content
                      } />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full text-sm font-bold ${
                      note.highlight_count > 0
                        ? "bg-yellow-400 text-stone-900"
                        : "bg-stone-100 text-stone-400"
                    }`}
                  >
                    {note.highlight_count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Questions */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-stone-700">
          Recent Questions
        </h2>
        {comments.length === 0 ? (
          <p className="text-sm text-stone-400">
            No student questions yet
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {comments.map((c) => {
              const relatedNote = noteMap.get(c.section_id);
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <p className="text-sm font-medium text-stone-800">
                    &ldquo;{c.comment}&rdquo;
                  </p>
                  {relatedNote && (
                    <p className="mt-1.5 text-xs text-stone-400">
                      <span
                        className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${TYPE_COLORS[relatedNote.type]}`}
                      >
                        {relatedNote.type}
                      </span>
                      {relatedNote.type === "diagram"
                        ? (relatedNote.caption || "Diagram")
                        : relatedNote.content.length > 80
                          ? relatedNote.content.slice(0, 80) + "..."
                          : relatedNote.content}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-stone-300">
                    {new Date(c.created_at).toLocaleTimeString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
