"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { getSupabase, BACKEND_URL } from "@/lib/supabase";
import LatexContent from "@/components/LatexContent";
import VoiceButton from "@/components/VoiceButton";

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
  const prevNoteIdsRef = useRef<Set<string>>(new Set());
  const notesRef = useRef<NoteSection[]>([]);
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
    const sb = getSupabase();

    // Fetch notes and highlights separately (no FK between tables)
    const [notesRes, hlRes] = await Promise.all([
      sb.from("lecture_notes").select("*").eq("room_id", room.id).order("id"),
      sb.from("highlights").select("section_id, highlight_count").eq("room_id", room.id),
    ]);

    if (notesRes.data) {
      const hlMap = new Map(
        (hlRes.data || []).map((h: Record<string, unknown>) => [h.section_id as string, (h.highlight_count as number) || 0])
      );
      const mapped: NoteSection[] = notesRes.data.map((row: Record<string, unknown>) => ({
        section_id: row.section_id as string,
        type: row.type as NoteSection["type"],
        content: row.content as string,
        caption: row.caption as string | undefined,
        image_url: row.image_url as string | undefined,
        highlight_count: hlMap.get(row.section_id as string) || 0,
      }));
      setNotes(mapped);
      notesRef.current = mapped;
      prevNoteIdsRef.current = new Set(mapped.map((n) => n.section_id));
    }
  }, [room]);

  // Initial fetch + Supabase Realtime subscription
  useEffect(() => {
    if (!room) return;

    const load = async () => {
      await fetchNotes();
    };
    load();

    const sb = getSupabase();
    const channel = sb
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
          fetchNotes().then(() => {
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
      sb.removeChannel(channel);
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
                    {/* Note content */}
                    {note.type === "diagram" ? (
                      <figure className="my-4">
                        {note.image_url ? (
                          <div className="relative mx-auto max-w-md aspect-video">
                            <Image
                              src={note.image_url || ""}
                              alt={note.caption || "Diagram"}
                              fill
                              className="rounded border border-ink/10 object-contain"
                              unoptimized
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

                    {/* Section toolbar — voice + highlight, revealed on hover */}
                    {note.type !== "diagram" && (
                      <div className="section-toolbar">
                        <VoiceButton text={note.content} />
                        {note.highlight_count > 0 && (
                          <span className="hl-count">
                            {note.highlight_count}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Diagram highlight badge only */}
                    {note.type === "diagram" && note.highlight_count > 0 && (
                      <div className="section-toolbar">
                        <span className="hl-count">
                          {note.highlight_count}
                        </span>
                      </div>
                    )}

                    {/* Expanded comment input */}
                    {isExpanded && (
                      <div
                        className="section-comment-row"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="Leave a question\u2026"
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
