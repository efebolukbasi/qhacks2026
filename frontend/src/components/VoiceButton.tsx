'use client'

import { useState } from "react";

export default function VoiceButton({ text }: { text: string }) {
    const [playing, setPlaying] = useState(false);

    async function play_voice(text: string) {
        if (playing) return;
        setPlaying(true);
        try {
            const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

            // Call secure backend endpoint instead of directly exposing API key
            const response = await fetch(`${BACKEND_URL}/tts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text: text,
                    voice_id: "onwK4e9ZLuTAKqWW03F9",
                }),
            });

            if (!response.ok) {
                throw new Error(`TTS error: ${response.statusText}`);
            }

            // Stream the audio blob
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElement = new Audio(audioUrl);

            // Cleanup and state handling
            const cleanup = () => {
                try {
                    URL.revokeObjectURL(audioUrl);
                } catch {}
                setPlaying(false);
            };

            audioElement.addEventListener("ended", cleanup);
            audioElement.addEventListener("error", (e) => {
                console.error("Audio playback error:", e);
                cleanup();
            });

            await audioElement.play();
        } catch (error) {
            console.error("Error playing audio:", error);
            setPlaying(false);
        }
    }

    return (
        <button
            type="button"
            onClick={() => play_voice(text)}
            disabled={playing}
            className="inline-flex items-center gap-2 rounded bg-cinnabar px-3 py-1.5 font-mono text-[12px] font-semibold uppercase tracking-wider text-cream transition-colors hover:bg-cinnabar/90 disabled:opacity-40"
            aria-label="Play note audio"
        >
            {playing ? (
                <>
                    <svg
                        className="h-4 w-4 animate-spin text-cream"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                    </svg>
                    Playing...
                </>
            ) : (
                "Play Dialogue"
            )}
        </button>
    );
}