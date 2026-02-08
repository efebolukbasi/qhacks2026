"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/supabase";

interface RoomSummary {
  id: string;
  code: string;
  name: string | null;
  created_at: string;
  note_count: number;
}

type SortField = "date" | "name" | "notes";
type SortDir = "asc" | "desc";

export default function StudentRoomsPage() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const router = useRouter();

  useEffect(() => {
    async function loadRooms() {
      try {
        const res = await fetch(`${BACKEND_URL}/rooms`);
        if (!res.ok) throw new Error("Failed to load rooms");
        const data: RoomSummary[] = await res.json();
        setRooms(data);
      } catch {
        setError("Could not load rooms. Is the backend running?");
      } finally {
        setLoading(false);
      }
    }
    loadRooms();
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    let list = rooms;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          (r.name && r.name.toLowerCase().includes(q))
      );
    }

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortField === "name") {
        const na = (a.name || a.code).toLowerCase();
        const nb = (b.name || b.code).toLowerCase();
        cmp = na.localeCompare(nb);
      } else if (sortField === "notes") {
        cmp = a.note_count - b.note_count;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [rooms, search, sortField, sortDir]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-rule border-t-cinnabar" />
          <p className="mt-4 text-sm text-on-dark-dim">Loading rooms…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-cinnabar">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg border border-rule bg-bg-raised px-4 py-2 font-mono text-xs text-on-dark transition-colors hover:border-on-dark-dim/30"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="stagger-children mb-8">
        <h1 className="font-display text-3xl italic tracking-tight text-cream">
          All Rooms
        </h1>
        <p className="mt-1 text-sm text-on-dark-dim">
          Browse lecture rooms and view their notes
        </p>
      </div>

      {/* Search & Sort Controls */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-on-dark-dim"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full rounded-lg border border-rule bg-bg-surface py-2.5 pl-9 pr-3 font-mono text-xs text-cream placeholder:text-on-dark-dim/40 outline-none transition-colors focus:border-cinnabar/50"
          />
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-1">
          <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-on-dark-dim">
            Sort
          </span>
          {(
            [
              ["date", "Date"],
              ["name", "Name"],
              ["notes", "Notes"],
            ] as [SortField, string][]
          ).map(([field, label]) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                sortField === field
                  ? "bg-bg-raised text-cream"
                  : "text-on-dark-dim hover:text-on-dark"
              }`}
            >
              {label}{" "}
              <span className="ml-0.5 text-on-dark-dim">
                {sortIcon(field)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {rooms.length === 0 && (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-rule bg-bg-surface p-10 text-center">
          <p className="font-display text-xl italic text-on-dark-dim">
            No rooms yet
          </p>
          <p className="mt-2 text-xs text-on-dark-dim">
            Rooms will appear here once a professor creates one.
          </p>
        </div>
      )}

      {/* Filtered empty state */}
      {rooms.length > 0 && filtered.length === 0 && (
        <div className="flex min-h-[30vh] flex-col items-center justify-center rounded-xl border border-rule bg-bg-surface p-10 text-center">
          <p className="text-sm text-on-dark-dim">
            No rooms match &ldquo;{search}&rdquo;
          </p>
          <button
            onClick={() => setSearch("")}
            className="mt-3 font-mono text-xs text-cinnabar transition-colors hover:text-cinnabar/80"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Room cards */}
      <div className="grid gap-3">
        {filtered.map((room, idx) => (
          <button
            key={room.id}
            onClick={() => router.push(`/room/${room.code}`)}
            className="ink-reveal hover-lift group flex w-full items-center gap-4 rounded-xl border border-rule bg-bg-surface p-4 text-left transition-all hover:border-on-dark-dim/20 hover:bg-bg-raised"
            style={{ '--delay': `${idx * 50}ms` } as React.CSSProperties}
          >
            {/* Room code badge */}
            <div className="flex h-12 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-bg-raised font-mono text-sm font-bold tracking-[0.15em] text-lamplight group-hover:bg-bg-surface">
              {room.code}
            </div>

            {/* Room info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h2 className="truncate font-body text-base font-medium text-cream">
                  {room.name || "Untitled Room"}
                </h2>
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-on-dark-dim">
                <span>{formatDate(room.created_at)}</span>
                <span className="text-rule">•</span>
                <span>{formatTime(room.created_at)}</span>
                <span className="text-rule">•</span>
                <span
                  className={
                    room.note_count > 0 ? "text-copper" : "text-on-dark-dim"
                  }
                >
                  {room.note_count} {room.note_count === 1 ? "note" : "notes"}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <svg
              className="h-4 w-4 flex-shrink-0 text-on-dark-dim transition-transform group-hover:translate-x-0.5 group-hover:text-on-dark"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 4.5l7.5 7.5-7.5 7.5"
              />
            </svg>
          </button>
        ))}
      </div>

      {/* Summary footer */}
      {rooms.length > 0 && (
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-widest text-on-dark-dim">
          {filtered.length} of {rooms.length} room{rooms.length !== 1 && "s"}
        </p>
      )}
    </div>
  );
}
