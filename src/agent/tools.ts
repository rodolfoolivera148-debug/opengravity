import { z } from "zod";
import { executeMcpTool, getMcpTools } from "./mcpClient.js";

export interface ToolExecutionParams {
    timezone?: string;
    [key: string]: any;
}

export const tools = [
    {
        type: "function",
        function: {
            name: "get_current_time",
            description: "Obtiene la hora actual. Puede usarse con o sin zona horaria.",
            parameters: {
                type: "object",
                properties: {
                    timezone: {
                        type: "string",
                        description: "La zona horaria opcional (ej. 'America/Buenos_Aires', 'Europe/Madrid')."
                    }
                }
            }
        }
    }
];

export function getTools() {
    const mcpTools = getMcpTools();
    return [
        ...tools,
        ...mcpTools
    ];
}

export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
    const isMcpTool = getMcpTools().some((t: any) => t.function.name === name);
    if (isMcpTool) {
        return executeMcpTool(name, args);
    }

    console.log(`[Tool Local] Ejecutando: ${name} con argumentos:`, args);
    switch (name) {
        case "get_current_time": {
            try {
                const options: Intl.DateTimeFormatOptions = {
                    timeStyle: "long",
                    dateStyle: "full"
                };
                if (args.timezone) {
                    options.timeZone = args.timezone;
                }
                return new Intl.DateTimeFormat("es-ES", options).format(new Date());
            } catch (error: any) {
                return `Error al obtener la hora: ${error.message}`;
            }
        }
        default:
            return `Herramienta desconocida: ${name}`;
    }
}
