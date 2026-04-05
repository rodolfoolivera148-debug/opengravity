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

    // Filtrar herramientas (Estrategia 1: Híbrida)
    const localToolNames = ['execute_terminal_command', 'read_file', 'write_file', 'list_directory', 'get_current_time', 'execute_google_workspace_action'];
    const activeTools = allTools.filter(t => {
        const name = t.function.name;
        if (localToolNames.includes(name)) return true;
        if (category === "ALL") return true;
        if (category === "FIREBASE" && name.startsWith("mcp_firebase_")) return true;
        if (category === "COLAB" && name.startsWith("mcp_colab_")) return true;
        if (category === "WORKSPACE" && name.startsWith("mcp_workspace_")) return true;
        if (category === "NEWS" && name.startsWith("mcp_trendradar_")) return true;
        const msgLow = userMessage.toLowerCase();
        // Ampliamos palabras clave para forzar inyección de herramientas de noticias
        const newsKeywords = ["rastre", "crawl", "trendradar", "notici", " ai", " ia", "artificial", "tecnolog", "china", "shanghai", "beijing"];
        if (name.startsWith("mcp_trendradar_") && newsKeywords.some(kw => msgLow.includes(kw))) return true;
        return false;
    });

    // --- STEP 1.3: CONSTRUIR CAPACIDADES DINÁMICAS ---
    let capabilities = getMcpStatus();
    
    // Inyectar Superpoderes (Metodología)
    try {
        const superPath = path.resolve(process.cwd(), "superpowers/skills/using-superpowers/SKILL.md");
        if (fs.existsSync(superPath)) {
            const superContent = fs.readFileSync(superPath, "utf-8");
            capabilities += `\n\nMETODOLOGÍA DE SUPERPODERES (Cómo debes operar):\n${superContent}`;
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

    const SYSTEM_PROMPT = PROMPTS.DEFAULT_SYSTEM(category, currentState, capabilities) + 
        (userProfile.length > 0 ? `\n\nLO QUE SÉ SOBRE RODOLFO (Memoria a Largo Plazo):\n- ${userProfile.join('\n- ')}` : "") +
        (learningContext ? `\n\nMEMORIA DE ÉXITO (Úsala como ejemplo):\n${learningContext}` : "") +
        (promptOptimizations ? `\n\n${promptOptimizations}` : "");

    // 1. Cargamos el historial de forma más compacta para evitar TPM Limits (Groq)
    const historyLimit = modelIndex === 0 ? 5 : 12;
    const historyData = await getMessages(userId, historyLimit);
    let turnHistory = historyData.map(msg => {
        if (msg.role === 'assistant') {
            try {
                const parsed = JSON.parse(msg.content);
                if (parsed.tool_calls) {
                    return { role: 'assistant', content: parsed.content || null, tool_calls: parsed.tool_calls };
                }
            } catch (e) { }
        }
        if (msg.role === 'tool') {
            try {
                const parsed = JSON.parse(msg.content);
                let contentStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);
                const limit = 10000;
                if (contentStr.length > limit) contentStr = contentStr.substring(0, limit) + "... [truncado]";
                return { role: 'tool', tool_call_id: parsed.tool_call_id, content: contentStr };
            } catch (e) { }
        }
        return { role: msg.role, content: msg.content };
    });

    while (toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...turnHistory
        ];
        
        console.log(`[AgentLoop] Iter ${toolIterations} | Contexto: ${messages.length} mensajes (Giro: ${turnHistory.length})`);

        try {
            // Filtrar herramientas activas por categoría para reducir tamaño de prompt (Estrategia 2: Context-Aware Loading)
            const response = await getLLMResponse(messages, modelIndex, activeTools);
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
                    try {
                        const toolName = toolCall.function.name;
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
                        turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                        traceData.results.push(result);
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
