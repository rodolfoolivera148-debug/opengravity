// src/agent/loop.ts
import { getLLMResponse, getModelCount, getInitialModelIndex } from "./llm.js";
import { executeTool, getTools } from "./tools.js";
import { saveMessage, getMessages, getGlobalState, setGlobalState } from "../memory/memoryManager.js";
import { requestConfirmation } from "../bot/telegram.js";

const MAX_TOOL_ITERATIONS = 12;

export async function runAgentLoop(userId: number, userMessage: string): Promise<string> {
    const currentState = await getGlobalState(userId);
    await saveMessage(userId, 'user', userMessage);

    let toolIterations = 0;
    let modelIndex = getInitialModelIndex();

    // --- STEP 1: ROUTING (Estrategia 1: Agente Enrutador) ---
    // Usamos el primer intento para decidir que "scope" de apps necesitamos
    const allTools = getTools();
    const routerPrompt = `Recibiste este mensaje: "${userMessage}".
    Dime a qué dominio pertenece para activar las herramientas correctas. Responde SOLO con una de estas categorías:
    - FIREBASE: Para bases de datos en la nube.
    - COLAB: Para ciencia de datos y Python remoto.
    - WORKSPACE: Para Gmail, Drive y oficina.
    - DEV: Para leer/escribir archivos locales o usar la terminal.
    - CORE: Para preguntas generales sin herramientas.
    `;
    
    let category = "CORE";
    try {
        const routerResponse = await getLLMResponse([{ role: "system", content: routerPrompt }], 0); // Groq es rápido para esto
        category = (routerResponse.choices[0].message.content || "CORE").trim().toUpperCase();
        console.log(`[Router] Mensaje clasificado como: ${category}`);
    } catch (e) {
        console.warn("[Router] Fallo en clasificación, usando todas las herramientas.");
        category = "ALL";
    }

    // Filtrar herramientas según la categoría (Estrategia 1)
    const activeTools = allTools.filter(t => {
        const name = t.function.name.toLowerCase();
        const desc = t.function.description.toLowerCase();
        if (category === "ALL") return true;
        if (category === "FIREBASE" && (desc.includes("[firebase]") || name.includes("firestore"))) return true;
        if (category === "COLAB" && (desc.includes("[colab]") || desc.includes("[science]") || name.includes("code"))) return true;
        if (category === "WORKSPACE" && name.includes("workspace")) return true;
        if (category === "DEV" && (name.includes("file") || name.includes("terminal") || name.includes("dir"))) return true;
        if (category === "CORE" && (name === "get_current_time")) return true;
        return false;
    });

    const SYSTEM_PROMPT = `Eres OpenGravity v2.0 (Router Edition).
    Contexto Actual (Memoria de Estado): ${JSON.stringify(currentState)}
    
    Capacidades activas para este mensaje: ${category}.
    Instrucciones:
    1. Si necesitas ejecutar comandos en la terminal o escribir archivos, el bot te pedirá aprobación del usuario automáticamente.
    2. Mantén el foco en la tarea actual guardada en el Estado.
    3. Responde siempre en español.
    `;

    while (toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;

        // Obtener historial con límite dinámico
        const historyLimit = modelIndex === 0 ? 10 : 20;
        const historyData = await getMessages(userId, historyLimit);

        const history = historyData.map(msg => {
            if (msg.role === 'assistant') {
                try {
                    const parsed = JSON.parse(msg.content);
                    if (parsed.tool_calls) {
                        return { role: 'assistant', tool_calls: parsed.tool_calls };
                    }
                } catch (e) { }
            }
            if (msg.role === 'tool') {
                try {
                    const parsed = JSON.parse(msg.content);
                    let contentStr = typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result);

                    // Truncado para evitar límites de tokens de Groq u otros modelos
                    const limit = modelIndex === 0 ? 1200 : 3000;
                    if (contentStr.length > limit) {
                        contentStr = contentStr.substring(0, limit) + "\n... [TRUNCADO]";
                    }
                    return {
                        role: 'tool',
                        tool_call_id: parsed.tool_call_id,
                        content: contentStr
                    };
                } catch (e) { }
            }
            return { role: msg.role, content: msg.content };
        });

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history
        ];

        try {
            console.log(`[AgentLoop] Iter ${toolIterations} | Modelo ${modelIndex} | Tools: ${activeTools.length}`);
            const response = await getLLMResponse(messages, modelIndex, activeTools);
            const message = response.choices[0].message;

            if (message.tool_calls && message.tool_calls.length > 0) {
                await saveMessage(userId, 'assistant', JSON.stringify({ tool_calls: message.tool_calls }));

                for (const toolCall of message.tool_calls) {
                    const toolName = toolCall.function.name;
                    const toolArgs = JSON.parse(toolCall.function.arguments);

                    // --- STEP 2: SECURITY VALIDATION (Estrategia 3: Human-in-the-loop) ---
                    const sensitiveTools = ['execute_terminal_command', 'write_file', 'firestore-delete'];
                    if (sensitiveTools.some(st => toolName.includes(st))) {
                        console.log(`[Seguridad] Pidiendo confirmación para: ${toolName}`);
                        const confirmed = await requestConfirmation(userId, toolName, toolArgs);
                        if (!confirmed) {
                            await saveMessage(userId, 'tool', JSON.stringify({
                                tool_call_id: toolCall.id,
                                name: toolName,
                                result: "Acción rechazada por el usuario (Seguridad)."
                            }));
                            continue;
                        }
                    }

                    // --- STEP 3: EXECUTION ---
                    let result = await executeTool(toolName, toolArgs);
                    
                    // Si el resultado es éxito en una tarea DEV, actualizamos el estado (Estrategia 2)
                    if (!result.includes("Error") && category === "DEV") {
                        await setGlobalState(userId, "last_action", `Ejecutada ${toolName} con éxito`);
                    }

                    await saveMessage(userId, 'tool', JSON.stringify({
                        tool_call_id: toolCall.id,
                        name: toolName,
                        result: result
                    }));
                }
                continue;
            }

            if (message.content) {
                await saveMessage(userId, 'assistant', message.content);
                return message.content;
            }
            return "El modelo no generó una respuesta.";

        } catch (error: any) {
            console.error(`[AgentLoop Error]: ${error.message}`);
            if (modelIndex < getModelCount() - 1) {
                modelIndex++;
                toolIterations--;
                continue;
            }
            return `Ocurrió un error crítico: ${error.message}`;
        }
    }

    return "⚠️ Límite de reflexión alcanzado.";
}
