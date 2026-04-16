// src/agent/loop.ts
import { getLLMResponse, getModelCount, getInitialModelIndex } from "./llm.js";
import { executeTool, getTools } from "./tools.js";
import { getMcpStatus } from "./mcpClient.js";
import fs from "fs";
import path from "path";
import { saveMessage, getMessages, getGlobalState, setGlobalState, saveTrace, getSemanticContext, getPromptOptimizations, getUserProfile } from "../memory/memoryManager.js";
import { requestConfirmation } from "../bot/telegram.js";
import { PROMPTS } from "../config/prompts.js";
import { runFailureAudit } from "./auditor.js";

const MAX_TOOL_ITERATIONS = 12;
const TOOL_RESULT_LIMIT = 2000; // Límite de caracteres para resultados de herramientas

export async function runAgentLoop(userId: number, userMessage: string): Promise<string> {
    const currentState = await getGlobalState(userId);
    const userProfile = await getUserProfile(userId);
    await saveMessage(userId, 'user', userMessage);

    let toolIterations = 0;
    let modelIndex = getInitialModelIndex();

    // --- ESTRUCTURA DE AUTOAPRENDIZAJE (Trace Data) ---
    const traceData = {
        category: "CORE",
        user_message: userMessage,
        thought_process: [] as string[],
        tool_calls: [] as any[],
        results: [] as string[],
        model_index: modelIndex,
        success: false
    };

    // --- STEP 1: ROUTING ---
    const allTools = getTools();
    let category = "CORE";
    try {
        const routerResponse = await getLLMResponse([{ role: "system", content: PROMPTS.ROUTER_PROMPT(userMessage) }], 0);
        let rawCategory = routerResponse.choices[0].message.content || "CORE";
        rawCategory = rawCategory.trim().toUpperCase().replace(/[^A-Z]/g, '');
        const validCategories = ['FIREBASE', 'COLAB', 'WORKSPACE', 'NEWS', 'DEV', 'CORE'];
        category = validCategories.includes(rawCategory) ? rawCategory : "CORE";
        traceData.category = category;
        console.log(`[Router] Mensaje clasificado como: ${category}`);
    } catch (e) {
        console.warn("[Router] Fallo en clasificación:", e);
    }

    const learningContext = await getSemanticContext(userId, userMessage, category);
    if (learningContext) console.log(`[Autoaprendizaje] Recuperando ${learningContext.split('\n').length} ejemplos de éxito.`);

    // --- STEP 1.2: RECUPERACIÓN DE REGLAS CRÍTICAS (Auditor) ---
    const promptOptimizations = await getPromptOptimizations(userId);
    if (promptOptimizations) console.log(`[Autoaprendizaje] Aplicando optimización de prompt activa.`);

    // 1. Cargamos el historial ANTES para preservar tools y evitar ValidationError (Groq)
    // IMPORTANTE: Groq free tier tiene 6000-12000 TPM. Con 5 msgs × 500 chars = ~2500 tokens de historial.
    const historyLimit = 5; // Máximo 5 mensajes de historial para todos los modelos
    const historyData = await getMessages(userId, historyLimit);
    
    const historicalTools = new Set<string>();
    let turnHistory = historyData.map(msg => {
        if (msg.role === 'assistant') {
            try {
                const parsed = JSON.parse(msg.content);
                if (parsed.tool_calls) {
                    for (const tc of parsed.tool_calls) historicalTools.add(tc.function.name);
                    return { role: 'assistant', content: parsed.content || null, tool_calls: parsed.tool_calls };
                }
            } catch (e) { }
        }
        if (msg.role === 'tool') {
            try {
                const parsed = JSON.parse(msg.content);
                let contentStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
                // TRUNCADO AGRESIVO: 500 chars máx por resultado de herramienta del historial
                // Esto es crucial para que el contexto quepa en Groq (6000 TPM)
                if (contentStr.length > 500) contentStr = contentStr.substring(0, 500) + "... [truncado]";
                return { role: 'tool', tool_call_id: parsed.tool_call_id, content: contentStr };
            } catch (e) { }
        }
        return { role: msg.role, content: msg.content };
    });

    // Filtrar herramientas (Estrategia: Context-Budget-Aware)
    // Cada tool definition consume ~100-200 tokens. Con 30 tools = ~4500 tokens solo en definiciones.
    // Para Groq (12000 TPM), máximo ~10 tools para dejar espacio al prompt y respuesta.
    const localToolNames = ['get_current_time'];
    const ESSENTIAL_TRENDRADAR_TOOLS = new Set([
        'mcp_trendradar_search_news',
        'mcp_trendradar_get_latest_news', 
        'mcp_trendradar_get_news_by_date',
        'mcp_trendradar_search_rss',
        'mcp_trendradar_get_latest_rss',
        'mcp_trendradar_read_article',
        'mcp_trendradar_get_trending_topics',
    ]);
    const activeTools = allTools.filter(t => {
        const name = t.function.name;
        
        // Herramientas del historial DEBEN estar presentes para evitar 400 en Groq
        if (historicalTools.has(name)) return true;

        if (localToolNames.includes(name)) return true;
        if (category === "FIREBASE" && name.startsWith("mcp_firebase_")) return true;
        if (category === "COLAB" && name.startsWith("mcp_colab_")) return true;
        if (category === "WORKSPACE" && name.startsWith("mcp_workspace_")) return true;
        
        // NEWS: Solo las 7 herramientas core de TrendRadar, NO las 27
        if (category === "NEWS" && ESSENTIAL_TRENDRADAR_TOOLS.has(name)) return true;
        
        const msgLow = userMessage.toLowerCase();
        const newsKeywords = ["rastre", "crawl", "trendradar", "notici", " ai", " ia", "artificial", "tecnolog", "china", "shanghai", "beijing"];
        if (ESSENTIAL_TRENDRADAR_TOOLS.has(name) && newsKeywords.some(kw => msgLow.includes(kw))) return true;
        
        return false;
    });

    // --- STEP 1.3: CONSTRUIR CAPACIDADES DINÁMICAS ---
    let capabilities = getMcpStatus();
    
    // Inyectar Superpoderes (Metodología)
    let superpowersContent = "";
    try {
        const superPath = path.resolve(process.cwd(), "superpowers/skills/using-superpowers/SKILL.md");
        if (fs.existsSync(superPath)) {
            superpowersContent = fs.readFileSync(superPath, "utf-8");
            capabilities += `\n\nMETODOLOGÍA DE SUPERPODERES (Cómo debes operar):\n${superpowersContent}`;
        }
    } catch (e) {
        console.warn("[Loop] No se pudo leer Superpowers SKILL.md");
    }

    if (category === "WORKSPACE" || userMessage.toLowerCase().includes("workspace") || userMessage.toLowerCase().includes("gmail")) {
        try {
            const skillPath = path.resolve(process.cwd(), "SKILL.md");
            if (fs.existsSync(skillPath)) {
                const skillContent = fs.readFileSync(skillPath, "utf-8");
                capabilities += `\n\nGUÍA DE USO PARA GOOGLE WORKSPACE (gogcli):\n${skillContent}`;
            }
        } catch (e) {
            console.warn("[Loop] No se pudo leer SKILL.md");
        }
    }

    // System prompt COMPLETO (para modelos con contexto grande)
    const FULL_SYSTEM_PROMPT = PROMPTS.DEFAULT_SYSTEM(category, currentState, capabilities) + 
        (userProfile.length > 0 ? `\n\nLO QUE SÉ SOBRE RODOLFO (Memoria a Largo Plazo):\n- ${userProfile.join('\n- ')}` : "") +
        (learningContext ? `\n\nMEMORIA DE ÉXITO (Úsala como ejemplo):\n${learningContext}` : "") +
        (promptOptimizations ? `\n\n${promptOptimizations}` : "");

    // System prompt REDUCIDO (para modelos con contexto limitado — Groq free tier)
    const LITE_SYSTEM_PROMPT = PROMPTS.DEFAULT_SYSTEM(category, currentState, getMcpStatus());

    let contextReduced = false; // Flag para saber si ya redujimos contexto por 413

    while (toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;

        // Seleccionar prompt y tools según contexto
        const currentPrompt = contextReduced ? LITE_SYSTEM_PROMPT : FULL_SYSTEM_PROMPT;
        const currentTools = contextReduced 
            ? activeTools.filter(t => {
                const name = t.function.name;
                // En modo reducido: solo tools locales esenciales + tools de la categoría activa
                const localToolNames = ['get_current_time'];
                if (localToolNames.includes(name)) return true;
                if (category === "NEWS" && name.startsWith("mcp_trendradar_")) {
                    // Solo las herramientas core de TrendRadar
                    return name.includes("search_news") || name.includes("get_latest") || name.includes("search_rss");
                }
                if (category === "FIREBASE" && name.startsWith("mcp_firebase_")) return true;
                if (category === "COLAB" && name.startsWith("mcp_colab_")) return true;
                // Incluir herramientas ya usadas en el historial
                if (historicalTools.has(name)) return true;
                return false;
            })
            : activeTools;

        const messages = [
            { role: "system", content: currentPrompt },
            ...turnHistory
        ];
        
        if (contextReduced) {
            console.log(`[AgentLoop] Iter ${toolIterations} | MODO LITE | ${messages.length} msgs, ${currentTools.length} tools`);
        } else {
            console.log(`[AgentLoop] Iter ${toolIterations} | Contexto: ${messages.length} mensajes (Giro: ${turnHistory.length})`);
        }

        try {
            // Filtrar herramientas activas por categoría para reducir tamaño de prompt (Estrategia 2: Context-Aware Loading)
            const response = await getLLMResponse(messages, modelIndex, currentTools);
            const message = response.choices[0].message;

            if (message.content) {
                console.log(`[Modelo Pensamiento]: ${message.content.substring(0, 300)}...`);
                traceData.thought_process.push(message.content);
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                console.log(`[Modelo ToolCalls]: ${message.tool_calls.map((tc: any) => tc.function.name).join(", ")}`);
                traceData.tool_calls.push(...message.tool_calls);

                await saveMessage(userId, 'assistant', JSON.stringify({ 
                    content: message.content || null, 
                    tool_calls: message.tool_calls 
                }));
                turnHistory.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });

                for (const toolCall of message.tool_calls) {
                    let toolName = "unknown";
                    try {
                        toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        console.log(`   └─ Argumentos para ${toolName}:`, JSON.stringify(toolArgs));

                        // --- STEP 2: SECURITY VALIDATION ---
                        const sensitiveTools = ['execute_terminal_command', 'write_file', 'firestore-delete'];
                        if (sensitiveTools.some(st => toolName.includes(st))) {
                            const confirmed = await requestConfirmation(userId, toolName, toolArgs);
                            if (!confirmed) {
                                const result = "Acción rechazada por el usuario (Seguridad).";
                                await saveMessage(userId, 'tool', JSON.stringify({ tool_call_id: toolCall.id, name: toolName, result }));
                                turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                                traceData.results.push(result);
                                continue;
                            }
                        }

                        // --- STEP 3: EXECUTION ---
                        let result = await executeTool(toolName, toolArgs, userId);
                        if (!result.includes("Error") && category === "DEV") {
                            await setGlobalState(userId, "last_action", `Ejecutada ${toolName} con éxito`);
                        }

                        await saveMessage(userId, 'tool', JSON.stringify({ tool_call_id: toolCall.id, name: toolName, result }));
                        let resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                        const limit = contextReduced ? 1000 : TOOL_RESULT_LIMIT;
                        if (resultStr.length > limit) resultStr = resultStr.substring(0, limit) + "... [truncado]";
                        turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: resultStr });
                        traceData.results.push(resultStr);
                    } catch (toolError: any) {
                        const result = `Error interno: ${toolError.message}`;
                        await saveMessage(userId, 'tool', JSON.stringify({ 
                            tool_call_id: toolCall.id, 
                            name: toolName, 
                            result 
                        }));
                        turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                        traceData.results.push(result);
                    }
                }
                continue;
            }

            if (message.content) {
                await saveMessage(userId, 'assistant', message.content);
                traceData.success = true;
                await saveTrace(userId, traceData); // GUARDAR TRAZA FINAL PARA APRENDIZAJE
                return message.content;
            }
            return "El modelo no generó una respuesta.";

        } catch (error: any) {
            console.error(`[AgentLoop Error]: ${error.message}`);
            
            // --- MANEJO INTELIGENTE DE 413 (Context Too Large) ---
            if (error.message.includes('413') && !contextReduced) {
                console.warn(`[AgentLoop] ⚠️ Contexto demasiado grande. Reduciendo y reintentando mismo modelo...`);
                contextReduced = true;
                
                // 1. Reducir historial: mantener solo último 30% de turnHistory
                const keepCount = Math.max(2, Math.ceil(turnHistory.length * 0.3));
                turnHistory = turnHistory.slice(-keepCount);
                
                // 2. Truncar resultados de tool en historial existente
                turnHistory = turnHistory.map(msg => {
                    if (msg.role === 'tool' && msg.content && msg.content.length > 500) {
                        return { ...msg, content: msg.content.substring(0, 500) + '... [reducido]' };
                    }
                    return msg;
                });
                
                // 3. Reducir herramientas: solo locales + herramientas ya usadas en historial
                // (activeTools ya tiene el filtro, pero lo reducimos más)
                
                toolIterations--; // No contar este intento
                continue;
            }
            
            // --- FALLBACK NORMAL: Escalar a siguiente modelo ---
            if (modelIndex < getModelCount() - 1) {
                modelIndex++;
                traceData.model_index = modelIndex;
                toolIterations--;
                continue;
            }
            await saveTrace(userId, { ...traceData, success: false }); // Guardar fallo
            await runFailureAudit(userId); // DISPARAR AUDITORÍA DE APRENDIZAJE TRAS ERROR CRÍTICO
            return `Ocurrió un error crítico: ${error.message}`;
        }
    }

    return "⚠️ Límite de reflexión alcanzado.";
}
