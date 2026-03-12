import path from "path";
// @ts-ignore
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// @ts-ignore
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Usamos el cliente MCP oficial
let mcpClient: Client | null = null;
let mcpTools: any[] = [];

export async function initMcpClient() {
    console.log("[MCP] Iniciando cliente para firebase-tools...");

    // Usamos la ruta local de node_modules para mayor robustez
    const firebaseBin = path.join(process.cwd(), "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [firebaseBin, "mcp"],
    });

    mcpClient = new Client({
        name: "opengravity-agent",
        version: "1.0.0",
    }, {
        capabilities: {}
    });

    try {
        await mcpClient.connect(transport);
        console.log("[MCP] Conectado exitosamente al servidor MCP de Firebase.");

        // Obtener herramientas disponibles desde el servidor MCP
        const toolsResponse = await mcpClient.listTools();
        mcpTools = toolsResponse.tools.map((tool: any) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description || "",
                parameters: {
                    type: "object",
                    properties: tool.inputSchema?.properties || {},
                    required: tool.inputSchema?.required || []
                }
            }
        }));

        const toolNames = mcpTools.map(t => t.function.name);
        console.log(`[MCP] Se cargaron ${mcpTools.length} herramientas de Firebase: ${toolNames.join(", ")}`);
    } catch (error) {
        console.error("[MCP] Error al conectar con el servidor MCP de Firebase:", error);
        mcpClient = null;
    }
}

export function getMcpTools() {
    return mcpTools;
}

export async function executeMcpTool(name: string, args: Record<string, any>): Promise<string> {
    if (!mcpClient) {
        throw new Error("[MCP] El cliente no está conectado.");
    }

    try {
        console.log(`[MCP] Ejecutando herramienta externa: ${name} con args:`, args);
        const result = await mcpClient.callTool({
            name,
            arguments: args
        });

        // El servidor MCP devuelve un array de 'content' (generalmente de texto)
        const contentArr = result.content as any[];
        if (contentArr && contentArr.length > 0) {
            // Concatenamos el texto si hay múltiples partes
            return contentArr.map(c => c.text || JSON.stringify(c)).join("\n");
        }
        return "Herramienta ejecutada sin contenido de retorno.";
    } catch (error: any) {
        console.error(`[MCP] Error ejecutando ${name}:`, error);
        return `Error en la herramienta externa: ${error.message || String(error)}`;
    }
}
