"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/supabase";

export default function ProfessorCreatePage() {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
      router.push(`/professor/${room.code}`);
    } catch {
      setError("Could not create room. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center">
      <div className="w-full max-w-sm text-center">
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
