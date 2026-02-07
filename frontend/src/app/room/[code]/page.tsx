"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, BACKEND_URL } from "@/lib/supabase";
import LatexContent from "@/components/LatexContent";

interface NoteSection {
  section_id: string;
  type: "definition" | "equation" | "step" | "note" | "diagram";
  content: string;
  caption?: string;
  image_url?: string;
  highlight_count: number;
}

interface Room {
  id: string;
  code: string;
  name: string | null;
}

export default function StudentRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [newSectionIds, setNewSectionIds] = useState<Set<string>>(new Set());
  const prevNoteIdsRef = useRef<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch room info
  useEffect(() => {
    async function loadRoom() {
      try {
        const res = await fetch(`${BACKEND_URL}/rooms/${code}`);
        if (!res.ok) {
          router.push("/");
          return;
        }
        const data = await res.json();
        setRoom(data);
      } catch {
        router.push("/");
      }
    }
    loadRoom();
  }, [code, router]);

  // Fetch notes from Supabase
  const fetchNotes = useCallback(async () => {
    if (!room) return;
    const { data } = await supabase
      .from("lecture_notes")
      .select("*, highlights(highlight_count)")
      .eq("room_id", room.id)
      .order("id");

    if (data) {
      const mapped: NoteSection[] = data.map((row: Record<string, unknown>) => {
        const hl = row.highlights as Record<string, unknown>[] | Record<string, unknown> | null;
        let count = 0;
        if (Array.isArray(hl) && hl.length > 0) count = (hl[0].highlight_count as number) || 0;
        else if (hl && typeof hl === "object" && !Array.isArray(hl)) count = (hl.highlight_count as number) || 0;
        return {
          section_id: row.section_id as string,
          type: row.type as NoteSection["type"],
          content: row.content as string,
          caption: row.caption as string | undefined,
          image_url: row.image_url as string | undefined,
          highlight_count: count,
        };
      });
      setNotes(mapped);
      prevNoteIdsRef.current = new Set(mapped.map((n) => n.section_id));
    }
  }, [room]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lecture_notes",
          filter: `room_id=eq.${room.id}`,
        },
        () => {
          // Refetch all notes on any change
          fetchNotes().then(() => {
            // Detect new sections for animation
            const currentIds = new Set(
              notes.map((n) => n.section_id)
            );
            // Scroll to bottom when new content arrives
            setTimeout(() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 200);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "highlights",
          filter: `room_id=eq.${room.id}`,
        },
        () => fetchNotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, fetchNotes]);

  const handleHighlight = async (sectionId: string) => {
    if (expandedId === sectionId && commentText.trim()) {
      setSending(true);
      await fetch(`${BACKEND_URL}/rooms/${code}/highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          comment: commentText.trim(),
        }),
      });
      setCommentText("");
      setExpandedId(null);
      setSending(false);
      fetchNotes();
    } else if (expandedId === sectionId) {
      await fetch(`${BACKEND_URL}/rooms/${code}/highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: sectionId }),
      });
      setExpandedId(null);
      fetchNotes();
    } else {
      setExpandedId(sectionId);
      setCommentText("");
    }
  };

  if (!room) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-on-dark-dim">
        Connecting to room...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Room header */}
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-on-dark-dim">
            Room {room.code}
          </p>
          {room.name && (
            <h1 className="mt-1 font-display text-2xl italic text-cream">
              {room.name}
            </h1>
          )}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-copper">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-copper animate-pulse" />
          live
        </span>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-rule bg-bg-surface py-20 text-on-dark-dim">
          <p className="font-display text-xl italic text-on-dark-dim/60">
            Waiting for lecture to begin...
          </p>
          <p className="mt-2 font-mono text-[10px] tracking-wide text-on-dark-dim/40">
            Notes will appear here in real time
          </p>
        </div>
      ) : (
        <div className="paper-page rounded-lg px-8 py-10 shadow-lg sm:px-12 sm:py-12">
          {/* Document header */}
          <header className="mb-8 text-center">
            <h2 className="font-display text-2xl font-semibold italic text-ink sm:text-3xl">
              Lecture Notes
            </h2>
            <div className="mx-auto mt-3 h-px w-24 bg-ink/10" />
            <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-mid">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </header>

          {/* Flowing document */}
          <article className="latex-document">
            {notes.map((note, idx) => {
              const isHighlighted = note.highlight_count > 0;
              const isExpanded = expandedId === note.section_id;

              return (
                <div key={note.section_id}>
                  {idx > 0 && shouldShowDivider(notes[idx - 1], note) && (
                    <div className="section-divider" />
                  )}

                  <div
                    onClick={() =>
                      expandedId === note.section_id
                        ? setExpandedId(null)
                        : (setExpandedId(note.section_id), setCommentText(""))
                    }
                    className={`section-block cursor-pointer group ${
                      isHighlighted ? "highlighted" : ""
                    }`}
                  >
                    {note.highlight_count > 0 && (
                      <span className="absolute -right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-cinnabar font-mono text-[9px] font-bold text-cream opacity-0 group-hover:opacity-100 transition-opacity">
                        {note.highlight_count}
                      </span>
                    )}

                    {note.type === "diagram" ? (
                      <figure className="my-4">
                        {note.image_url ? (
                          <div className="mx-auto max-w-md">
                            <img
                              src={`${BACKEND_URL}${note.image_url}`}
                              alt={note.caption || "Diagram"}
                              className="w-full rounded border border-ink/10"
                            />
                          </div>
                        ) : (
                          <div
                            className="mx-auto max-w-md rounded border border-ink/10 p-6"
                            dangerouslySetInnerHTML={{ __html: note.content }}
                          />
                        )}
                        {note.caption && (
                          <figcaption className="mt-2 text-center font-mono text-[10px] italic text-ink-mid">
                            {note.caption}
                          </figcaption>
                        )}
                      </figure>
                    ) : note.type === "definition" ? (
                      <div className="def-callout my-3 rounded-r">
                        <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-copper">
                          Definition
                        </p>
                        <LatexContent text={note.content} />
                      </div>
                    ) : note.type === "equation" ? (
                      <div className="eq-display my-3">
                        <LatexContent text={note.content} />
                      </div>
                    ) : (
                      <div className="my-1">
                        <LatexContent text={note.content} />
                      </div>
                    )}

                    {isExpanded && (
                      <div
                        className="mt-2 mb-1 flex gap-2 rounded border border-ink/10 bg-cream-dim/50 p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Leave a question..."
                          className="annotation-field flex-1 rounded border border-ink/10 bg-cream px-3 py-1.5 text-sm text-ink outline-none focus:border-cinnabar/40"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleHighlight(note.section_id);
                            if (e.key === "Escape") setExpandedId(null);
                          }}
                        />
                        <button
                          onClick={() => handleHighlight(note.section_id)}
                          disabled={sending}
                          className="rounded bg-cinnabar px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-cream transition-colors hover:bg-cinnabar/90 disabled:opacity-40"
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

          <p className="mt-8 border-t border-ink/5 pt-4 text-center font-mono text-[9px] text-ink-mid/60">
            Click any section to highlight it or leave a question
          </p>
        </div>
      )}
    </div>
  );
}

function shouldShowDivider(prev: NoteSection, curr: NoteSection): boolean {
  if (prev.type !== curr.type) return true;
  if (prev.type === "diagram" || curr.type === "diagram") return true;
  return false;
}
