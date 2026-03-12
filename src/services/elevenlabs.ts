// src/services/elevenlabs.ts
import { env } from "../config/env.js";

export async function textToSpeech(text: string): Promise<Buffer> {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "accept": "audio/mpeg",
        },
        body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ElevenLabs] Error API: ${response.status} - ${errorText}`);
        throw new Error(`ElevenLabs API Error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
