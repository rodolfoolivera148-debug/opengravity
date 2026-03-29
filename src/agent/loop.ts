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

    // Filtrar herramientas (Estrategia 1: Híbrida)
    // Siempre incluimos las herramientas locales básicas para evitar errores 400 de LLM
    const localToolNames = ['execute_terminal_command', 'read_file', 'write_file', 'list_directory', 'get_current_time', 'execute_google_workspace_action'];
    const activeTools = allTools.filter(t => {
        const name = t.function.name;
        // 1. Siempre incluir locales
        if (localToolNames.includes(name)) return true;
        // 2. Solo incluir MCP si el router lo activó (evitando ruido/límites de tokens)
        if (category === "ALL") return true;
        if (category === "FIREBASE" && name.startsWith("mcp_firebase_")) return true;
        if (category === "COLAB" && name.startsWith("mcp_colab_")) return true;
        if (category === "WORKSPACE" && name.startsWith("mcp_workspace_")) return true;
        return false;
    });

    const SYSTEM_PROMPT = `Eres OpenGravity v2.0 (Router Edition), un agente experto en automatización local operando en un entorno Windows.
    Contexto Actual (Memoria de Estado): ${JSON.stringify(currentState)}
    
    Capacidades activas para este mensaje: ${category}.
    
    INSTRUCCIONES CRÍTICAS:
    1. Si necesitas realizar acciones sensibles (terminal/archivos), llama a la herramienta adecuada. El usuario aprobará manualmente cada acción, así que no dudes en usarlas por motivos de seguridad.
    2. Si en el historial ves una respuesta de herramienta (role: "tool") indicando éxito (ej. "Archivo guardado exitosamente"), CONFIRMA al usuario que la tarea está terminada. No te disculpes ni digas que "no tienes permiso", porque el éxito de la herramienta prueba que SÍ lo tienes.
    3. Responde siempre en español de forma directa y profesional.
    `;

    // 1. Cargamos el historial una sola vez al inicio del bucle
    const historyLimit = modelIndex === 0 ? 10 : 20;
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
                const limit = modelIndex === 0 ? 1200 : 3000;
                if (contentStr.length > limit) contentStr = contentStr.substring(0, limit) + "...";
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
            const response = await getLLMResponse(messages, modelIndex, activeTools);
            const message = response.choices[0].message;

            if (message.content) {
                console.log(`[Modelo Pensamiento]: ${message.content.substring(0, 300)}...`);
            }

            if (message.tool_calls && message.tool_calls.length > 0) {
                console.log(`[Modelo ToolCalls]: ${message.tool_calls.map((tc: any) => tc.function.name).join(", ")}`);
                
                // Guardar en DB para persistencia
                await saveMessage(userId, 'assistant', JSON.stringify({ 
                    content: message.content || null, 
                    tool_calls: message.tool_calls 
                }));
                // Actualizar historial local del giro para velocidad
                turnHistory.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });

                for (const toolCall of message.tool_calls) {
                    try {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        console.log(`   └─ Argumentos para ${toolName}:`, JSON.stringify(toolArgs));

                        // --- STEP 2: SECURITY VALIDATION ---
                        const sensitiveTools = ['execute_terminal_command', 'write_file', 'firestore-delete'];
                        if (sensitiveTools.some(st => toolName.includes(st))) {
                            console.log(`[Seguridad] Pidiendo confirmación para: ${toolName}`);
                            const confirmed = await requestConfirmation(userId, toolName, toolArgs);
                            if (!confirmed) {
                                const result = "Acción rechazada por el usuario (Seguridad).";
                                await saveMessage(userId, 'tool', JSON.stringify({ tool_call_id: toolCall.id, name: toolName, result }));
                                turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                                continue;
                            }
                        }

                        // --- STEP 3: EXECUTION ---
                        let result = await executeTool(toolName, toolArgs);
                        
                        if (!result.includes("Error") && category === "DEV") {
                            await setGlobalState(userId, "last_action", `Ejecutada ${toolName} con éxito`);
                        }

                        await saveMessage(userId, 'tool', JSON.stringify({ tool_call_id: toolCall.id, name: toolName, result }));
                        turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                    } catch (toolError: any) {
                        console.error(`[Tool Error] Error procesando ${toolCall.function.name}:`, toolError.message);
                        const result = `Error interno: ${toolError.message}`;
                        await saveMessage(userId, 'tool', JSON.stringify({ tool_call_id: toolCall.id, name: toolCall.function.name, result }));
                        turnHistory.push({ role: 'tool', tool_call_id: toolCall.id, content: result });
                    }
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
                toolIterations--; // Reintentar con nuevo modelo
                continue;
            }
            return `Ocurrió un error crítico: ${error.message}`;
        }
    }

    return "⚠️ Límite de reflexión alcanzado.";
}
