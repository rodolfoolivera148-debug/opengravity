import OpenAI from "openai";
import { env } from "../config/env.js";
import { modelTracker } from "./modelTracker.js";

const models = [
    // 1. OpenRouter - Free Tier (Gemini 2.0 Flash Lite - Masivo Context Window y Quotas)
    { name: "google/gemini-2.0-flash-lite-001", provider: "openrouter", apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" },
    { name: "google/gemini-2.0-flash-001", provider: "openrouter", apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" },

    // 2. Groq - Alta velocidad (Verificados Marzo 2026)
    { name: "llama-3.3-70b-versatile", provider: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" },
    { name: "llama-3.1-70b-versatile", provider: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" },
    { name: "llama-3.1-8b-instant", provider: "groq", apiKey: env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" },

    // 3. Otros fallbacks
    { name: "meta-llama/llama-3.3-70b-instruct:free", provider: "openrouter", apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" },
    { name: "deepseek/deepseek-chat", provider: "openrouter", apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" }
];

export function getModelCount() { return models.length; }

export function getInitialModelIndex() {
    // Retorna el ID del modelo que, según nuestro rastreador en vivo, está actualmente disponible
    return modelTracker.getBestAvailableModelIndex(models); 
}

/**
 * Llama al LLM con soporte para herramientas y monitoreo automático de caídas (Status Tracker)
 */
export async function getLLMResponse(messages: any[], modelIndex: number = 0, tools: any[] = []) {
    const config = models[modelIndex];
    if (!config.apiKey) throw new Error(`LLM_SKIP_NO_KEY: Falta API Key para ${config.name}`);

    const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
    });

    const completionOptions: any = {
        model: config.name,
        messages: messages,
        temperature: 0.1,
    };

    if (tools && tools.length > 0) {
        completionOptions.tools = tools;
        completionOptions.tool_choice = "auto";
    }

    try {
        // Ejecutamos pasándole withResponse() para poder leer los Headers reales y dárselos al Tracker
        const { data, response: rawResponse } = await client.chat.completions.create(completionOptions).withResponse();
        
        if (rawResponse.headers) {
            modelTracker.updateFromHeaders(config.name, config.provider, rawResponse.headers as any, rawResponse.status);
        }
        
        return data;
    } catch (error: any) {
        console.error(`[LLM Error] Provider ${config.provider} (${config.name}):`, error.message);
        
        // Si hay error en la red/Rate limit, alimentamos al Tracker para que bloquee el modelo temporalmente
        if (error.status && error.headers) {
            modelTracker.updateFromHeaders(config.name, config.provider, error.headers as any, error.status);
        }
        
        throw new Error(`LLM_HTTP_${error.status || 'ERROR'}: ${error.message}`);
    }
}
