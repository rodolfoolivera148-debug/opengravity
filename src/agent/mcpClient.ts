import path from "path";
// @ts-ignore
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// @ts-ignore
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Usamos el cliente MCP oficial
let mcpClient: Client | null = null;
let mcpTools: any[] = [];

/**
 * Resuelve referencias $ref en un schema JSON usando los $defs disponibles.
 * Esto es necesario porque Groq y otros LLMs no soportan $ref/$defs en sus herramientas.
 */
function resolveRefs(schema: any, defs: Record<string, any> = {}): any {
    if (!schema || typeof schema !== 'object') return schema;

    // Si es un array, resolver cada elemento
    if (Array.isArray(schema)) {
        return schema.map(item => resolveRefs(item, defs));
    }

    // Si tiene una referencia $ref
    if (schema['$ref']) {
        const refPath = schema['$ref'];
        // extraer el nombre del $def (ej: "#/$defs/DocumentMask" -> "DocumentMask")
        const defName = refPath.split('/').pop();
        if (defName && defs[defName]) {
            // resolver recursivamente el $def referenciado (puede tener sus propios $ref)
            return resolveRefs(defs[defName], defs);
        }
        // Si no encontramos el $def, devolver un schema genérico de string para evitar errores de validación
        return { type: 'string', description: `(Parameter: ${defName})` };
    }

    // Iterar sobre las propiedades del objeto y resolver referencias en cada una
    const resolved: any = {};
    for (const key of Object.keys(schema)) {
        // Omitir $defs y $schema ya que no son necesarios para el LLM
        if (key === '$defs' || key === '$schema') continue;
        resolved[key] = resolveRefs(schema[key], defs);
    }
    return resolved;
}

/**
 * Sanitiza el inputSchema de una herramienta MCP para que sea compatible con la API de Groq/Gemini.
 * Aplana las referencias $ref y elimina características no soportadas.
 */
function sanitizeToolSchema(inputSchema: any): { type: string; properties: any; required: string[] } {
    if (!inputSchema) return { type: 'object', properties: {}, required: [] };

    const defs = inputSchema['$defs'] || {};
    const properties = inputSchema.properties || {};
    const required = inputSchema.required || [];

    // Resolver las referencias en cada propiedad
    const sanitizedProperties: any = {};
    for (const [propName, propSchema] of Object.entries(properties)) {
        try {
            const resolved = resolveRefs(propSchema as any, defs);
            // Simplificar y mantener solo los campos esenciales
            sanitizedProperties[propName] = {
                type: resolved.type || 'string',
                description: (resolved.description || "").substring(0, 1024),
                ...(resolved.enum ? { enum: resolved.enum } : {}),
                ...(resolved.properties ? { properties: resolved.properties } : {}),
                ...(resolved.items ? { items: resolved.items } : {}),
            };
        } catch {
            sanitizedProperties[propName] = { type: 'string' };
        }
    }

    return {
        type: 'object',
        properties: sanitizedProperties,
        required: required,
    };
}

export async function initMcpClient() {
    console.log("[MCP] Iniciando cliente para firebase-tools...");

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

        // Timeout de 60s para listar herramientas (margen máximo de seguridad)
        const listToolsPromise = mcpClient.listTools();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout al listar herramientas MCP")), 60000)
        );

        const toolsResponse = await Promise.race([listToolsPromise, timeoutPromise]) as any;
        
        const localMcpTools = toolsResponse.tools.map((tool: any) => ({
            type: "function",
            function: {
                name: tool.name,
                description: (tool.description || "").substring(0, 1024), 
                parameters: sanitizeToolSchema(tool.inputSchema),
            }
        }));

        const toolsCount = localMcpTools.length;
        mcpTools = localMcpTools; // Assign to the global mcpTools
        console.log(`[MCP] Cargadas ${toolsCount} herramientas de Firebase.`);
    } catch (error: any) {
        // Lógica de Reintento para MCP
        if (!process.env.MCP_RETRIED) {
            console.warn(`[MCP] Reintentando carga de herramientas... (${error.message})`);
            process.env.MCP_RETRIED = "true";
            return initMcpClient(); // Recursivo una sola vez
        }
        console.error(`[MCP] No se pudieron cargar herramientas de Firebase: ${error.message}`);
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
        console.log(`[MCP] Ejecutando: ${name} con args:`, args);
        const result = await mcpClient.callTool({
            name,
            arguments: args
        });

        const contentArr = result.content as any[];
        if (contentArr && contentArr.length > 0) {
            return contentArr.map(c => c.text || JSON.stringify(c)).join("\n");
        }
        return "Herramienta ejecutada sin contenido de retorno.";
    } catch (error: any) {
        console.error(`[MCP] Error ejecutando ${name}:`, error);
        return `Error en la herramienta externa: ${error.message || String(error)}`;
    }
}
