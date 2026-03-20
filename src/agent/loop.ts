import { getLLMResponse, getModelCount, getInitialModelIndex } from "./llm.js";
import { executeTool } from "./tools.js";
import { saveMessage, getMessages } from "../memory/memoryManager.js";

const MAX_TOOL_ITERATIONS = 15;

const SYSTEM_PROMPT = `
Eres OpenGravity, un sistema de IA avanzado diseñado para actuar como un Ingeniero de Software Senior y Asistente Personal de alto nivel.
Respondes SIEMPRE en español con un tono profesional, servicial y directo.

Capacidades principales:
1. DESARROLLO: Puedes escribir, leer y modificar código localmente con herramientas de archivos.
2. EJECUCIÓN: Tienes acceso a una terminal de Windows para ejecutar comandos (npm, git, python, etc.).
3. MEMORIA: Recuerdas conversaciones pasadas gracias a tu base de datos persistente.
4. FIREBASE: Posees herramientas para interactuar con bases de datos en la nube de Google Cloud Firestore.

Metodología de trabajo:
- Antes de realizar cambios complejos en archivos, "piensa" y planifica tus acciones.
- Eres proactivo: si el usuario te pide una aplicación, créala paso a paso sin que te lo pidan dos veces.
- Verificación: Siempre verifica la salida de tus comandos de terminal para confirmar el éxito del proceso.
- Privacidad: Trata la información local con seguridad.

Tu entorno operativo es Windows y te comunicas a través de un Bot de Telegram.
`;

export async function runAgentLoop(userId: number, userMessage: string): Promise<string> {
    await saveMessage(userId, 'user', userMessage);

    let toolIterations = 0;
    let modelIndex = getInitialModelIndex(); // <--- Ahora es inteligente

    while (toolIterations < MAX_TOOL_ITERATIONS) {
        toolIterations++;

        // DINÁMICO: Si el modelo es Groq (index 0), tomamos menos historial (últimos 8)
        // Si no, tomamos los últimos 15.
        const historyLimit = modelIndex === 0 ? 8 : 15;
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

                    // Truncado más agresivo para evitar el error de 12k de Groq
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
            console.log(`[AgentLoop] Iter ${toolIterations} | Modelo ${modelIndex} | Usuario ${userId}`);
            const response = await getLLMResponse(messages, modelIndex);
            const message = response.choices[0].message;

            if (message.tool_calls && message.tool_calls.length > 0) {
                await saveMessage(userId, 'assistant', JSON.stringify({ tool_calls: message.tool_calls }));

                for (const toolCall of message.tool_calls) {
                    let result: string;
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        result = await executeTool(toolCall.function.name, args);
                    } catch (e: any) {
                        console.error("[AgentLoop] Error herramienta:", e.message);
                        result = `Error: ${e.message}. Intenta de nuevo con argumentos válidos.`;
                    }

                    await saveMessage(userId, 'tool', JSON.stringify({
                        tool_call_id: toolCall.id,
                        name: toolCall.function.name,
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
            const errMsg = error.message || "";
            console.error(`[AgentLoop Error]: ${errMsg.substring(0, 200)}`);

            const retryCodes = ['LLM_HTTP_429', 'LLM_HTTP_413', 'LLM_HTTP_502', 'LLM_HTTP_503', 'LLM_HTTP_400', 'LLM_HTTP_404', 'LLM_BODY_ERROR', 'LLM_NO_CHOICES', 'rate_limit', 'SKIP_NO_KEY'];

            if (retryCodes.some(code => errMsg.includes(code)) && modelIndex < getModelCount() - 1) {
                console.log(`[AgentLoop] Fallo en el modelo actual. Cambiando al siguiente...`);
                modelIndex++;
                toolIterations--;
                continue;
            }

            if (errMsg.includes("ALL_MODELS_EXHAUSTED")) {
                return "⚠️ Todos los modelos están fuera de servicio o saturados. Por favor, intenta de nuevo en unos minutos.";
            }

            return `Ocurrió un error al procesar tu mensaje: ${errMsg.substring(0, 300)}`;
        }
    }

    return "⚠️ Se alcanzó el límite máximo de reflexión para tu solicitud. Por favor divídela en partes más pequeñas.";
}
