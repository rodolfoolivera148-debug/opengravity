// src/agent/llm.ts
import { env } from "../config/env.js";

// Usando fetch directamente para OpenAI compatible API (Groq)
export async function getLLMResponse(messages: any[], useFallback = false) {
    const apiKey = useFallback ? env.OPENROUTER_API_KEY : env.GROQ_API_KEY;
    const baseUrl = useFallback
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions";

    const model = useFallback ? env.OPENROUTER_MODEL : "llama-3.3-70b-versatile";

    if (!apiKey) {
        throw new Error(`API Key no configurada para ${useFallback ? 'OpenRouter' : 'Groq'}`);
    }

    const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            tools: (await import('./tools.js')).getTools(),
            tool_choice: "auto",
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`LLM API Error (${response.status}): ${errorData}`);
    }

    return response.json();
}
