"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase, BACKEND_URL } from "@/lib/supabase";
import LatexContent from "@/components/LatexContent";

interface Room {
  id: string;
  code: string;
  name: string | null;
}

interface NoteSection {
  section_id: string;
  type: string;
  content: string;
  caption?: string;
  highlight_count: number;
}

interface Comment {
  id: number;
  section_id: string;
  comment: string;
  highlighted_text?: string;
  created_at: string;
}

export default function ProfessorRoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [notes, setNotes] = useState<NoteSection[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  // Webcam state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(30);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const [expandedEngagement, setExpandedEngagement] = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState(0);

  // Auth state
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [keyInput, setKeyInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Load room + verify professor key
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND_URL}/rooms/${code}`);
        if (!res.ok) {
          router.push("/professor");
          return;
        }
        setRoom(await res.json());

        // Check if we already have the key in sessionStorage
        const storedKey = sessionStorage.getItem(`prof_key_${code}`);
        if (storedKey) {
          const verifyRes = await fetch(
            `${BACKEND_URL}/rooms/${code}/verify-professor`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ key: storedKey }),
            }
          );
          if (verifyRes.ok) {
            setAuthenticated(true);
          }
        }
      } catch {
        router.push("/professor");
      } finally {
        setAuthChecking(false);
      }
    }
    load();
  }, [code, router]);

  // Fetch notes and comments
  const fetchData = useCallback(async () => {
    if (!room) return;

    const sb = getSupabase();
    const [notesRes, hlRes, commentsRes] = await Promise.all([
      sb.from("lecture_notes").select("*").eq("room_id", room.id).order("id"),
      sb.from("highlights").select("section_id, highlight_count").eq("room_id", room.id),
      sb.from("comments").select("*").eq("room_id", room.id).order("created_at"),
    ]);

    if (notesRes.data) {
      const hlMap = new Map(
        (hlRes.data || []).map((h: Record<string, unknown>) => [h.section_id as string, (h.highlight_count as number) || 0])
      );
      setNotes(
        notesRes.data.map((row: Record<string, unknown>) => ({
          section_id: row.section_id as string,
          type: row.type as string,
          content: row.content as string,
          caption: row.caption as string | undefined,
          highlight_count: hlMap.get(row.section_id as string) || 0,
        }))
      );
    }
    if (commentsRes.data) {
      setComments(commentsRes.data as Comment[]);
    }
  }, [room]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscriptions
  useEffect(() => {
    if (!room) return;

    const sb = getSupabase();
    const channel = sb
      .channel(`prof-${room.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lecture_notes", filter: `room_id=eq.${room.id}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "highlights", filter: `room_id=eq.${room.id}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `room_id=eq.${room.id}` },
        () => fetchData()
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [room, fetchData]);

  // Presence: track connected students
  useEffect(() => {
    if (!room) return;

    const sb = getSupabase();
    const presenceChannel = sb.channel(`presence-${room.id}`);

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const count = Object.keys(state).reduce(
          (sum, key) => sum + (state[key] as unknown[]).length,
          0
        );
        setStudentCount(count);
      })
      .subscribe();

    return () => {
      sb.removeChannel(presenceChannel);
    };
  }, [room]);

  // ---------------------------------------------------------------------------
  // Camera controls
  // ---------------------------------------------------------------------------

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      alert("Could not access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCameraActive(false);
    setCapturing(false);
  };

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !room) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Convert to JPEG blob
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return;

    setProcessing(true);
    setLastCapture(new Date().toLocaleTimeString());

    try {
      const formData = new FormData();
      formData.append("file", blob, `capture_${Date.now()}.jpg`);

      await fetch(`${BACKEND_URL}/rooms/${code}/upload-image`, {
        method: "POST",
        body: formData,
      });

      setCaptureCount((c) => c + 1);
    } catch (err) {
      console.error("Capture upload failed:", err);
    } finally {
      setProcessing(false);
    }
  }, [room, code]);

  const startCapturing = () => {
    setCapturing(true);
    captureFrame(); // Capture immediately
    intervalRef.current = setInterval(captureFrame, captureInterval * 1000);
  };

  const stopCapturing = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCapturing(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Sort notes by highlight count for the dashboard
  const sortedByHighlights = [...notes].sort(
    (a, b) => b.highlight_count - a.highlight_count
  );
  const noteMap = new Map(notes.map((n) => [n.section_id, n]));

  if (!room) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-on-dark-dim">
        Loading room...
      </div>
    );
  }

  // Auth gate: prompt for professor key
  if (!authenticated) {
    const handleVerify = async () => {
      setAuthError("");
      try {
        const res = await fetch(
          `${BACKEND_URL}/rooms/${code}/verify-professor`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: keyInput.trim() }),
          }
        );
        if (!res.ok) {
          setAuthError("Invalid professor key");
          return;
        }
        sessionStorage.setItem(`prof_key_${code}`, keyInput.trim());
        setAuthenticated(true);
      } catch {
        setAuthError("Could not verify key. Is the backend running?");
      }
    };

    if (authChecking) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center text-on-dark-dim">
          Verifying access...
        </div>
      );
    }

    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="w-full max-w-sm text-center">
          <div className="mb-2 text-3xl">🔒</div>
          <h1 className="font-display text-2xl italic text-cream">
            Professor Access
          </h1>
          <p className="mt-2 text-sm text-on-dark-dim">
            Enter the secret key you received when creating room{" "}
            <span className="font-mono font-bold text-lamplight">{code}</span>
          </p>

          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="Professor key"
            className="mt-6 w-full rounded-lg border border-rule bg-bg-surface px-4 py-3 font-mono text-sm text-cream placeholder:text-on-dark-dim/30 outline-none transition-colors focus:border-copper/50"
            autoFocus
          />

          {authError && (
            <p className="mt-3 text-xs text-cinnabar">{authError}</p>
          )}

          <button
            onClick={handleVerify}
            disabled={!keyInput.trim()}
            className="mt-4 w-full rounded-lg bg-copper px-4 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-copper/90 disabled:opacity-40"
          >
            Unlock Dashboard
          </button>

          <button
            onClick={() => router.push("/professor")}
            className="mt-4 font-mono text-xs text-on-dark-dim hover:text-cream transition-colors"
          >
            ← Create a new room instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Room header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-on-dark-dim">
            Professor Dashboard
          </p>
          {room.name && (
            <h1 className="mt-1 font-display text-2xl italic text-cream">
              {room.name}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-rule bg-bg-surface px-4 py-2 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-on-dark-dim">
              Students Connected
            </p>
            <p className="mt-0.5 flex items-center justify-center gap-2 font-mono text-xl font-bold text-cream">
              <span className={`inline-block h-2 w-2 rounded-full ${studentCount > 0 ? "bg-copper animate-pulse" : "bg-on-dark-dim/30"
                }`} />
              {studentCount}
            </p>
          </div>
          <div className="rounded-lg border border-rule bg-bg-surface px-4 py-2 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-on-dark-dim">
              Room Code
            </p>
            <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.2em] text-lamplight">
              {room.code}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: Camera */}
        <section>
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-on-dark-dim">
            Camera Capture
          </h2>
          <div className="rounded-lg border border-rule bg-bg-surface overflow-hidden">
            {/* Video preview */}
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${!cameraActive ? "hidden" : ""}`}
              />
              {!cameraActive && (
                <div className="flex h-full items-center justify-center">
                  <button
                    onClick={startCamera}
                    className="rounded-lg bg-bg-raised px-6 py-3 font-mono text-xs font-medium text-on-dark transition-colors hover:bg-rule/20"
                  >
                    Start Camera
                  </button>
                </div>
              )}
              {processing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <p className="font-mono text-xs text-cream animate-pulse">
                    Processing...
                  </p>
                </div>
              )}
            </div>

            {/* Camera controls */}
            {cameraActive && (
              <div className="border-t border-rule p-3">
                <div className="flex items-center gap-2">
                  {!capturing ? (
                    <button
                      onClick={startCapturing}
                      className="flex-1 rounded bg-cinnabar py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-cream hover:bg-cinnabar/90"
                    >
                      Start Capturing
                    </button>
                  ) : (
                    <button
                      onClick={stopCapturing}
                      className="flex-1 rounded border border-cinnabar/50 bg-cinnabar/10 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-cinnabar hover:bg-cinnabar/20"
                    >
                      Stop Capturing
                    </button>
                  )}
                  <button
                    onClick={captureFrame}
                    disabled={processing}
                    className="rounded border border-rule bg-bg-raised px-3 py-2 font-mono text-[10px] text-on-dark hover:bg-rule/20 disabled:opacity-40"
                    title="Capture one frame now"
                  >
                    Snap
                  </button>
                  <button
                    onClick={stopCamera}
                    className="rounded border border-rule bg-bg-raised px-3 py-2 font-mono text-[10px] text-on-dark-dim hover:text-cinnabar"
                    title="Stop camera"
                  >
                    Off
                  </button>
                </div>

                {/* Interval selector */}
                <div className="mt-2 flex items-center gap-2">
                  <label className="font-mono text-[9px] text-on-dark-dim">
                    Interval:
                  </label>
                  <select
                    value={captureInterval}
                    onChange={(e) => setCaptureInterval(Number(e.target.value))}
                    disabled={capturing}
                    className="rounded border border-rule bg-bg-raised px-2 py-1 font-mono text-[10px] text-on-dark outline-none"
                  >
                    <option value={5}>5s</option>
                    <option value={15}>15s</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                  </select>
                  {lastCapture && (
                    <span className="ml-auto font-mono text-[9px] text-on-dark-dim">
                      Last: {lastCapture} ({captureCount} total)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </section>

        {/* Right column: Engagement dashboard */}
        <section>
          {/* Most Highlighted */}
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-on-dark-dim">
            Student Engagement
          </h2>
          <div className="rounded-lg border border-rule bg-bg-surface p-4">
            {sortedByHighlights.length === 0 ? (
              <p className="text-center text-xs text-on-dark-dim/50 py-6">
                No notes yet
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {sortedByHighlights.slice(0, 8).map((note, i) => {
                  const maxCount = sortedByHighlights[0]?.highlight_count || 1;
                  const barWidth = maxCount > 0 ? (note.highlight_count / maxCount) * 100 : 0;
                  const isLong = note.content.length > 80;
                  const isOpen = expandedEngagement === note.section_id;
                  return (
                    <div
                      key={note.section_id}
                      className={`relative rounded p-2 transition-all ${isLong ? "cursor-pointer" : ""
                        }`}
                      onClick={() =>
                        isLong &&
                        setExpandedEngagement(
                          isOpen ? null : note.section_id
                        )
                      }
                    >
                      {/* Background bar */}
                      <div
                        className="bar-animate absolute inset-0 rounded bg-cinnabar/8"
                        style={{ width: `${barWidth}%` }}
                      />
                      <div className="relative z-10 flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-raised font-mono text-[9px] font-bold text-on-dark-dim">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs text-on-dark overflow-hidden transition-[max-height] duration-300 ease-in-out"
                            style={{
                              maxHeight: isOpen ? "500px" : "2.8em",
                            }}
                          >
                            <LatexContent text={note.content} />
                          </div>
                          {!isOpen && isLong && (
                            <span className="text-on-dark-dim/60 text-[11px]">…</span>
                          )}
                        </div>
                        <span
                          className={`mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${note.highlight_count > 0
                              ? "bg-cinnabar text-cream"
                              : "bg-bg-raised text-on-dark-dim"
                            }`}
                        >
                          {note.highlight_count}
                        </span>
                        {isLong && (
                          <span className={`text-[10px] text-on-dark-dim/50 transition-transform duration-200 ${isOpen ? "rotate-180" : ""
                            }`}>
                            ▼
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent Questions */}
          <h2 className="mb-3 mt-6 font-mono text-[10px] font-semibold uppercase tracking-widest text-on-dark-dim">
            Student Questions
          </h2>
          <div className="rounded-lg border border-rule bg-bg-surface p-4">
            {comments.length === 0 ? (
              <p className="text-center text-xs text-on-dark-dim/50 py-6">
                No questions yet
              </p>
            ) : (
              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto">
                {comments.map((c) => {
                  const related = noteMap.get(c.section_id);
                  return (
                    <div key={c.id} className="border-b border-rule pb-3 last:border-0">
                      {c.highlighted_text && (
                        <p className="mb-1 rounded bg-lamplight/10 px-2 py-1 font-mono text-[10px] italic text-lamplight line-clamp-2">
                          &ldquo;{c.highlighted_text}&rdquo;
                        </p>
                      )}
                      {c.comment && (
                        <p className="text-sm text-cream">
                          &ldquo;{c.comment}&rdquo;
                        </p>
                      )}
                      {!c.highlighted_text && related && (
                        <p className="mt-1 font-mono text-[9px] text-on-dark-dim">
                          re: {related.content.slice(0, 60)}...
                        </p>
                      )}
                      <p className="mt-0.5 font-mono text-[8px] text-on-dark-dim/40">
                        {new Date(c.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
