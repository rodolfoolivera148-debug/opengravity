// src/agent/llm.ts
import { env } from "../config/env.js";

/**
 * Lista de modelos priorizados y funcionales (Marzo 2026).
 */
const MODELS = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1/chat/completions' },
    { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' },
    { provider: 'openrouter', model: 'google/gemma-3-27b-it:free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' },
    { provider: 'openrouter', model: 'mistralai/mistral-small-3.1-24b-instruct:free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' },
    { provider: 'openrouter', model: 'openrouter/free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' },
];

export function getModelCount() {
    return MODELS.length;
}

export async function getLLMResponse(messages: any[], modelIndex: number = 0) {
    if (modelIndex >= MODELS.length) {
        throw new Error("ALL_MODELS_EXHAUSTED");
    }

    const config = MODELS[modelIndex];
    const apiKey = config.provider === 'groq' ? env.GROQ_API_KEY : env.OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error(`SKIP_NO_KEY_${config.provider}`);
    }

    // GESTIÓN INTELIGENTE DE HERRAMIENTAS
    // Groq tiene un límite TPM muy bajo (12k). Si le enviamos las 34 tools de Firebase, explota.
    // Los modelos de OpenRouter suelen tener 128k de contexto, aguantan todo.
    const { getTools, getLocalTools } = await import('./tools.js');
    const tools = config.provider === 'groq' ? getLocalTools() : getTools();

    console.log(`[LLM] Intento ${modelIndex + 1}: ${config.model} | ${tools.length} tools`);

    const response = await fetch(config.baseUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://opengravity.ai", // Requerido por algunos modelos de OpenRouter
            "X-Title": "OpenGravity Agent"
        },
        body: JSON.stringify({
            model: config.model,
            messages: messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? "auto" : undefined,
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`LLM_HTTP_${response.status}: ${errorData.substring(0, 500)}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(`LLM_BODY_ERROR: ${JSON.stringify(data.error).substring(0, 500)}`);
    }

    if (!data.choices || data.choices.length === 0) {
        throw new Error(`LLM_NO_CHOICES: ${JSON.stringify(data).substring(0, 300)}`);
    }

    return data;
}
