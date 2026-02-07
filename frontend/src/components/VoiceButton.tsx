'use client'

export default function VoiceButton({ text }: { text: string }) {
    async function play_voice(text: string) {
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
                    voice_id: "9BWtsMINqrJLrRacOk9x",
                }),
            });
            
            if (!response.ok) {
                throw new Error(`TTS error: ${response.statusText}`);
            }
            
            // Stream the audio blob
            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audioElement = new Audio(audioUrl);
            await audioElement.play();
        } catch (error) {
            console.error("Error playing audio:", error);
        }
    }
    
    return (
        <button onClick={() => play_voice(text)}>Play Dialogue</button>
    )
}