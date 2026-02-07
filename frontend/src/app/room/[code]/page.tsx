"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { getSupabase, BACKEND_URL } from "@/lib/supabase";
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

interface SelectionInfo {
  sectionId: string;
  text: string;
  rect: { top: number; left: number; width: number };
}

interface Comment {
  id: number;
  section_id: string;
  comment: string;
  highlighted_text?: string;
  created_at: string;
}

export default function StudentRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const prevNoteIdsRef = useRef<Set<string>>(new Set());
  const notesRef = useRef<NoteSection[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);

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

    // Fetch notes, highlights, and comments
    const [notesRes, hlRes, commentsRes] = await Promise.all([
      sb.from("lecture_notes").select("*").eq("room_id", room.id).order("id"),
      sb.from("highlights").select("section_id, highlight_count").eq("room_id", room.id),
      sb.from("comments").select("*").eq("room_id", room.id).order("created_at"),
    ]);

    if (commentsRes.data) {
      setComments(commentsRes.data as Comment[]);
    }

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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `room_id=eq.${room.id}`,
        },
        () => fetchNotes()
      )
      .subscribe();

    // Track student presence so professors can see the count
    const presenceChannel = sb.channel(`presence-${room.id}`);
    presenceChannel
      .on("presence", { event: "sync" }, () => {})
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({ joined_at: new Date().toISOString() });
        }
      });

    return () => {
      sb.removeChannel(channel);
      presenceChannel.untrack();
      sb.removeChannel(presenceChannel);
    };
  }, [room, fetchNotes]);

  // Listen for text selection inside the notes article
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        return;
      }

      const selectedText = sel.toString().trim();
      if (!selectedText) return;

      // Walk up from the selection anchor to find the section-block wrapper
      let node: Node | null = sel.anchorNode;
      let sectionEl: HTMLElement | null = null;
      while (node) {
        if (node instanceof HTMLElement && node.dataset.sectionId) {
          sectionEl = node;
          break;
        }
        node = node.parentNode;
      }
      if (!sectionEl) return;

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const articleEl = articleRef.current;
      const articleRect = articleEl?.getBoundingClientRect();

      setSelection({
        sectionId: sectionEl.dataset.sectionId!,
        text: selectedText,
        rect: {
          top: rect.bottom - (articleRect?.top ?? 0) + 8,
          left:
            rect.left -
            (articleRect?.left ?? 0) +
            rect.width / 2,
          width: rect.width,
        },
      });
      setCommentText("");
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setSelection(null);
          setCommentText("");
        }
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSubmitComment = async () => {
    if (!selection || flagging) return;
    setSending(true);
    setFlagging(true);

    try {
      await fetch(`${BACKEND_URL}/rooms/${code}/highlight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: selection.sectionId,
          highlighted_text: selection.text,
          comment: commentText.trim() || undefined,
        }),
      });

      setCommentText("");
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      fetchNotes();
    } finally {
      setSending(false);
      setFlagging(false);
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
          <article className="latex-document relative" ref={articleRef}>
            {notes.map((note, idx) => {
              const isHighlighted = note.highlight_count > 0;
              const sectionComments = comments.filter(
                (c) => c.section_id === note.section_id
              );

              return (
                <div key={note.section_id}>
                  {idx > 0 && shouldShowDivider(notes[idx - 1], note) && (
                    <div className="section-divider" />
                  )}

                  <div
                    data-section-id={note.section_id}
                    className={`section-block group ${
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

                    {/* Inline comments for this section */}
                    {sectionComments.length > 0 && (
                      <div className="mt-2 flex flex-col gap-1.5 border-t border-ink/5 pt-2">
                        {sectionComments.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-start gap-2 rounded bg-ink/[0.03] px-2.5 py-1.5"
                          >
                            <span className="mt-0.5 text-[10px] text-cinnabar">💬</span>
                            <div className="min-w-0 flex-1">
                              {c.highlighted_text && (
                                <p className="mb-0.5 text-[11px] font-medium text-lamplight/80">
                                  &ldquo;{c.highlighted_text.length > 60
                                    ? c.highlighted_text.slice(0, 60) + "…"
                                    : c.highlighted_text}&rdquo;
                                </p>
                              )}
                              {c.comment && (
                                <p className="text-xs text-ink-mid">
                                  {c.comment}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 font-mono text-[8px] text-ink-mid/40">
                              {new Date(c.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Selection popover — positioned relative to the article */}
            {selection && (
              <div
                ref={popoverRef}
                className="absolute z-50 w-72 rounded-lg border border-ink/15 bg-cream shadow-xl"
                style={{
                  top: selection.rect.top,
                  left: Math.max(
                    0,
                    Math.min(
                      selection.rect.left - 144,
                      (articleRef.current?.clientWidth ?? 600) - 288
                    )
                  ),
                }}
              >
                {/* Arrow */}
                <div
                  className="absolute -top-1.5 h-3 w-3 rotate-45 border-l border-t border-ink/15 bg-cream"
                  style={{
                    left: Math.min(
                      Math.max(16, selection.rect.left - Math.max(
                        0,
                        Math.min(
                          selection.rect.left - 144,
                          (articleRef.current?.clientWidth ?? 600) - 288
                        )
                      )),
                      256
                    ),
                  }}
                />
                <div className="p-3">
                  {/* Show highlighted excerpt */}
                  <p className="mb-2 rounded bg-lamplight/15 px-2 py-1 text-xs italic text-ink-mid line-clamp-2">
                    &ldquo;{selection.text.length > 80
                      ? selection.text.slice(0, 80) + "…"
                      : selection.text}&rdquo;
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Ask a question…"
                      className="annotation-field flex-1 rounded border border-ink/10 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-cinnabar/40"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSubmitComment();
                        if (e.key === "Escape") {
                          setSelection(null);
                          setCommentText("");
                          window.getSelection()?.removeAllRanges();
                        }
                      }}
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={sending || flagging}
                      className="rounded bg-cinnabar px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-cream transition-colors hover:bg-cinnabar/90 disabled:opacity-40"
                    >
                      {flagging ? "…" : commentText.trim() ? "Send" : "Flag"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </article>

          <p className="mt-8 border-t border-ink/5 pt-4 text-center font-mono text-[9px] text-ink-mid/60">
            Select text to highlight it or ask a question
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
