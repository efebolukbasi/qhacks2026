"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/supabase";

export default function ProfessorCreatePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRoom, setCreatedRoom] = useState<{
    code: string;
    professor_key: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });
      if (!res.ok) throw new Error("Failed to create room");
      const room = await res.json();
      setCreatedRoom({
        code: room.code,
        professor_key: room.professor_key,
      });
    } catch {
      setError("Could not create room. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAndContinue = () => {
    if (!createdRoom) return;
    // Store the key in sessionStorage so the dashboard can use it
    sessionStorage.setItem(
      `prof_key_${createdRoom.code}`,
      createdRoom.professor_key
    );
    router.push(`/professor/${createdRoom.code}`);
  };

  const handleCopyKey = async () => {
    if (!createdRoom) return;
    try {
      await navigator.clipboard.writeText(createdRoom.professor_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the text
    }
  };

  // After room creation: show the secret key
  if (createdRoom) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <div className="stagger-children w-full max-w-sm text-center">
          <div className="mb-2 text-3xl">🔑</div>
          <h1 className="font-display text-2xl italic text-cream">
            Room Created!
          </h1>
          <p className="mt-2 text-sm text-on-dark-dim">
            Save your <strong className="text-cream">professor key</strong> — you&apos;ll
            need it to access the dashboard.
          </p>

          <div className="mt-6 rounded-lg border border-rule bg-bg-surface p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-on-dark-dim">
              Room Code
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tracking-[0.2em] text-lamplight">
              {createdRoom.code}
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-copper/30 bg-copper/5 p-4">
            <p className="font-mono text-[9px] uppercase tracking-widest text-copper">
              Professor Key (secret)
            </p>
            <p className="mt-1 break-all font-mono text-sm font-bold text-cream select-all">
              {createdRoom.professor_key}
            </p>
            <button
              onClick={handleCopyKey}
              className="mt-2 rounded border border-rule px-3 py-1 font-mono text-[10px] text-on-dark-dim transition-colors hover:border-copper hover:text-copper"
            >
              {copied ? "✓ Copied!" : "Copy Key"}
            </button>
          </div>

          <p className="attention-pulse mt-4 rounded bg-cinnabar/10 px-3 py-2 text-xs text-cinnabar">
            ⚠ This key will not be shown again. Save it somewhere safe!
          </p>

          <button
            onClick={handleCopyAndContinue}
            className="mt-6 w-full rounded-lg bg-copper px-4 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-copper/90"
          >
            Continue to Dashboard →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="stagger-children w-full max-w-sm text-center">
        <h1 className="font-display text-3xl italic text-cream">
          Create a Room
        </h1>
        <p className="mt-2 text-sm text-on-dark-dim">
          Start a live lecture session for your students
        </p>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="Lecture title (optional)"
          className="mt-8 w-full rounded-lg border border-rule bg-bg-surface px-4 py-3 font-mono text-sm text-cream placeholder:text-on-dark-dim/30 outline-none transition-colors focus:border-copper/50"
          autoFocus
        />

        {error && (
          <p className="mt-3 text-xs text-cinnabar">{error}</p>
        )}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-copper px-4 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-copper/90 disabled:opacity-40"
        >
          {loading ? "Creating..." : "Create Room"}
        </button>

        <div className="mt-10 border-t border-rule pt-6">
          <p className="text-xs text-on-dark-dim">
            Students will enter the room code at
          </p>
          <p className="mt-1 font-mono text-sm text-lamplight">
            {typeof window !== "undefined" ? window.location.origin : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
