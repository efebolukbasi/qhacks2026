'use client'

import { useState, useRef } from "react";

export default function VoiceButton({ text }: { text: string }) {
    const [status, setStatus] = useState<"idle" | "generating" | "playing">("idle");
    const [voiceGender, setVoiceGender] = useState<"male" | "female">("male");
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const voiceIds = {
        male: "onwK4e9ZLuTAKqWW03F9",
        female: "XrExE9yKIg1WjnnlVkGX",
    };

    async function handleClick(e: React.MouseEvent) {
        e.stopPropagation();

        if (status === "playing") {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            setStatus("idle");
            return;
        }

        if (status !== "idle") return;
        setStatus("generating");
        try {
            const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

            const response = await fetch(`${BACKEND_URL}/tts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: text,
                    voice_id: voiceIds[voiceGender],
                }),
            });

            if (!response.ok) {
                throw new Error(`TTS error: ${response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElement = new Audio(audioUrl);
            audioRef.current = audioElement;

            setStatus("playing");

            const cleanup = () => {
                try { URL.revokeObjectURL(audioUrl); } catch {}
                audioRef.current = null;
                setStatus("idle");
            };

            audioElement.addEventListener("ended", cleanup);
            audioElement.addEventListener("error", () => cleanup());

            await audioElement.play();
        } catch (error) {
            console.error("Error playing audio:", error);
            audioRef.current = null;
            setStatus("idle");
        }
    }

    const title =
        status === "generating" ? "Generating audio\u2026" :
        status === "playing" ? "Click to stop" :
        "Listen to this section";

    return (
        <div className="voice-group">
            {(["male", "female"] as const).map((gender) => (
                <button
                    key={gender}
                    type="button"
                    onClick={() => setVoiceGender(gender)}
                    disabled={status !== "idle"}
                    className={`voice-gender-btn ${voiceGender === gender ? "active" : ""}`}
                    aria-label={`Select ${gender} voice`}
                >
                    {gender[0].toUpperCase()}
                </button>
            ))}
            <span className="voice-sep" />
            <button
                type="button"
                onClick={handleClick}
                title={title}
                aria-label={title}
                data-status={status}
                className="voice-btn"
            >
                {status === "generating" ? (
                    <span className="voice-dots">
                        <span /><span /><span />
                    </span>
                ) : status === "playing" ? (
                    <svg className="voice-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect className="voice-bar voice-bar-1" x="4"  y="4" width="3" rx="1.5" height="16" fill="currentColor" />
                        <rect className="voice-bar voice-bar-2" x="10.5" y="7" width="3" rx="1.5" height="10" fill="currentColor" />
                        <rect className="voice-bar voice-bar-3" x="17" y="2" width="3" rx="1.5" height="20" fill="currentColor" />
                    </svg>
                ) : (
                    <svg className="voice-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                )}
            </button>
        </div>
    );
}
