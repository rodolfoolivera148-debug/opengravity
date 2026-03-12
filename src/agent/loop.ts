// src/agent/loop.ts
import { getLLMResponse } from "./llm.js";
import { executeTool } from "./tools.js";
import { saveMessage, getMessages } from "../memory/firestore.js";

const MAX_ITERATIONS = 5;

const SYSTEM_PROMPT = `
Eres OpenGravity, un agente de IA personal altamente capaz, ejecutándose localmente.
Respondes SIEMPRE en español.
Tu interfaz principal de comunicación es Telegram.
Tienes acceso a herramientas y memoria persistente.
Sé conciso, útil y seguro.
`;

export async function runAgentLoop(userId: number, userMessage: string): Promise<string> {
    await saveMessage(userId, 'user', userMessage);

    let iterations = 0;
    let useFallback = false;

    while (iterations < MAX_ITERATIONS) {
        iterations++;

        // Obtener historial completo para el LLM
        const historyData = await getMessages(userId, 20);
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
                    return { role: 'tool', tool_call_id: parsed.tool_call_id, name: parsed.name, content: String(parsed.result) };
                } catch (e) { }
            }
            return { role: msg.role, content: msg.content };
        });

        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            ...history
        ];

        try {
            console.log(`[AgentLoop] Iteración ${iterations} para usuario ${userId}`);
            const response = await getLLMResponse(messages, useFallback);
            const message = response.choices[0].message;

            // Si el modelo decide usar una herramienta
            if (message.tool_calls && message.tool_calls.length > 0) {
                // Guardar el intention del asistente
                await saveMessage(userId, 'assistant', JSON.stringify({ tool_calls: message.tool_calls }));

                for (const toolCall of message.tool_calls) {
                    const args = JSON.parse(toolCall.function.arguments);
                    const result = await executeTool(toolCall.function.name, args);

                    // Guardar el resultado de la herramienta
                    await saveMessage(userId, 'tool', JSON.stringify({
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
                        result: result
                    }));
                }
                // Continuar el bucle para que el LLM analice el resultado de la herramienta
                continue;
            }

            // Si es una respuesta final de texto
            if (message.content) {
                await saveMessage(userId, 'assistant', message.content);
                return message.content;
            }

            return "No hubo respuesta del modelo.";

        } catch (error: any) {
            console.error("[AgentLoop Error]:", error);

            if (!useFallback && error.message.includes("429")) {
                console.log("Cambiando al modelo de respaldo (OpenRouter)...");
                useFallback = true;
                continue; // Intentar de nuevo en el mismo ciclo
            }

            return `Ocurrió un error al procesar tu mensaje: ${error.message}`;
        }
    }

    return "Se alcanzó el límite máximo de iteraciones pensando en una respuesta.";
}
