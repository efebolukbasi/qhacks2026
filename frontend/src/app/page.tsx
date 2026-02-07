"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/supabase";

export default function HomePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${BACKEND_URL}/rooms/${trimmed}`);
      if (res.ok) {
        router.push(`/room/${trimmed}`);
      } else {
        setError("Room not found. Check the code and try again.");
      }
    } catch {
      setError("Could not reach server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <h1 className="font-display text-5xl italic tracking-tight text-cream">
          ChalkBoard
        </h1>
        <p className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-cinnabar">
          live
        </p>

        <p className="mt-8 text-sm text-on-dark-dim">
          Enter the room code to join a lecture
        </p>

        {/* Code input */}
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
          placeholder="ROOM CODE"
          maxLength={6}
          className="mt-4 w-full rounded-lg border border-rule bg-bg-surface px-4 py-3.5 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-cream placeholder:text-on-dark-dim/30 outline-none transition-colors focus:border-cinnabar/50"
          autoFocus
        />

        {error && (
          <p className="mt-3 text-xs text-cinnabar">{error}</p>
        )}

        <button
          onClick={handleJoin}
          disabled={loading || !code.trim()}
          className="mt-4 w-full rounded-lg bg-cinnabar px-4 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-cream transition-colors hover:bg-cinnabar/90 disabled:opacity-40"
        >
          {loading ? "Joining..." : "Join"}
        </button>

        <div className="mt-10 border-t border-rule pt-6">
          <p className="text-xs text-on-dark-dim">
            Are you a professor?
          </p>
          <button
            onClick={() => router.push("/professor")}
            className="mt-2 rounded-lg border border-rule bg-bg-raised px-5 py-2.5 font-mono text-xs font-medium text-on-dark transition-colors hover:border-on-dark-dim/30"
          >
            Create a Room
          </button>
        </div>

        <div className="mt-6 border-t border-rule pt-6">
          <p className="text-xs text-on-dark-dim">
            Or browse all available rooms
          </p>
          <button
            onClick={() => router.push("/rooms")}
            className="mt-2 rounded-lg border border-rule bg-bg-raised px-5 py-2.5 font-mono text-xs font-medium text-on-dark transition-colors hover:border-on-dark-dim/30"
          >
            Browse Rooms
          </button>
        </div>
      </div>
    </div>
  );
}
