// src/agent/mcpClient.ts
import path from "path";
// @ts-ignore
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
// @ts-ignore
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// @ts-ignore
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { dbFirestore } from "../config/firebase.js";
import { env } from "../config/env.js";
import { getLLMResponse, getInitialModelIndex } from "./llm.js";

interface McpServerConfig {
    name: string;
    type: "stdio" | "sse";
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
}

const SERVERS: McpServerConfig[] = [
    {
        name: "firebase",
        type: "stdio",
        command: "npx",
        args: [
            "--no-install",
            "firebase",
            "mcp"
        ],
        env: {
            CI: "1",
            FIREBASE_FRAMEWORK_TOOLS: "true",
            GCP_PROJECT: env.FIREBASE_PROJECT_ID
        }
    },
    {
        name: "colab_local",
        type: "stdio",
        command: "uvx",
        // Quitamos cualquier flag que pueda causar ruido y forzamos logs a stderr
        args: ["--quiet", "git+https://github.com/googlecolab/colab-mcp"],
        env: { 
            PYTHONUNBUFFERED: "1",
            FAST_MCP_LOG_LEVEL: "ERROR" // Silenciamos el logo de FastMCP
        }
    },
    {
        name: "trendradar",
        type: "stdio",
        command: "uv",
        args: ["run", "--directory", "trendradar-repo", "python", "-m", "mcp_server.server"],
        env: { 
            PYTHONUNBUFFERED: "1",
            PYTHONUTF8: "1",
            // Puedes añadir aquí variables de entorno de TrendRadar si las necesitas
        }
    }
];

let unifiedTools: any[] = [];
const toolToClientMap = new Map<string, Client>();
const clients: Client[] = [];

function resolveRefs(schema: any, defs: Record<string, any> = {}): any {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map(item => resolveRefs(item, defs));
    if (schema['$ref']) {
        const refPath = schema['$ref'];
        const defName = refPath.split('/').pop();
        if (defName && defs[defName]) return resolveRefs(defs[defName], defs);
        return { type: 'string', description: `(Parameter: ${defName})` };
    }
    const resolved: any = {};
    for (const key of Object.keys(schema)) {
        if (key === '$defs' || key === '$schema') continue;
        resolved[key] = resolveRefs(schema[key], defs);
    }
    return resolved;
}

function sanitizeToolSchema(inputSchema: any): { type: string; properties: any; required: string[] } {
    if (!inputSchema) return { type: 'object', properties: {}, required: [] };
    const defs = inputSchema['$defs'] || {};
    const properties = inputSchema.properties || {};
    const sanitizedProperties: any = {};
    for (const [propName, propSchema] of Object.entries(properties)) {
        try {
            const resolved = resolveRefs(propSchema as any, defs);
            sanitizedProperties[propName] = {
                type: resolved.type || 'string',
                description: (resolved.description || "").substring(0, 1024),
                ...(resolved.enum ? { enum: resolved.enum } : {}),
                ...(resolved.properties ? { properties: resolved.properties } : {}),
                ...(resolved.items ? { items: resolved.items } : {}),
            };
        } catch { sanitizedProperties[propName] = { type: 'string' }; }
    }
    return { type: 'object', properties: sanitizedProperties, required: inputSchema.required || [] };
}

async function getRemoteColabUrl(): Promise<string | null> {
    try {
        const doc = await dbFirestore.collection("config").doc("mcp_remote").get();
        return doc.exists ? (doc.data()?.url || null) : null;
    } catch (e) { return null; }
}

export async function initMcpClient() {
    console.log(`[MCP] Iniciando ecosistema de herramientas...`);
    unifiedTools = [];
    toolToClientMap.clear();

    const remoteUrl = await getRemoteColabUrl();
    if (remoteUrl) {
        console.log(`[MCP] Detectada Science Lab remota en: ${remoteUrl}`);
        SERVERS.push({ name: "science_lab", type: "sse", url: remoteUrl });
    }

    const TIMEOUT_MS = 240000; // 4 minutos de margen total

    const loadServer = async (config: McpServerConfig) => {
        try {
            console.log(`[MCP] Cargando: ${config.name}...`);
            let transport;
            if (config.type === "stdio") {
                transport = new StdioClientTransport({
                    command: config.command!,
                    args: config.args!,
                    env: { ...process.env, ...config.env }
                } as any);
            } else {
                transport = new SSEClientTransport(new URL(config.url!));
            }

            const client = new Client({ name: "opengravity-agent", version: "1.0.0" }, { capabilities: {} });
            await client.connect(transport, { timeout: TIMEOUT_MS });

            const toolsResponse = await client.listTools(undefined, { timeout: TIMEOUT_MS }) as any;
            if (toolsResponse.tools && Array.isArray(toolsResponse.tools)) {
                for (const tool of toolsResponse.tools) {
                    // Prefijamos el nombre para evitar colisiones con herramientas locales
                    const prefixedName = `mcp_${config.name}_${tool.name}`;

                    unifiedTools.push({
                        type: "function",
                        function: {
                            name: prefixedName,
                            description: `[${config.name}] ${tool.description || ""}`.substring(0, 1024),
                            parameters: sanitizeToolSchema(tool.inputSchema),
                        }
                    });
                    toolToClientMap.set(prefixedName, client);
                }
                clients.push(client);
                console.log(`[MCP] ✅ ${config.name} listo. (${toolsResponse.tools.length} herramientas)`);
            }
        } catch (error: any) {
            console.error(`[MCP] ❌ ${config.name}: ${error.message}`);
        }
    };

    for (const config of SERVERS) {
        await loadServer(config);
    }
    console.log(`[MCP] Total herramientas disponibles: ${unifiedTools.length}`);
}

export function getMcpTools() { return unifiedTools; }

export function getMcpStatus(): string {
    if (unifiedTools.length === 0) return "No hay herramientas MCP conectadas actualmente.";
    return SERVERS.map(s => {
        const count = unifiedTools.filter(t => t.function.name.startsWith(`mcp_${s.name}_`)).length;
        return `- MCP [${s.name}]: ${count} herramientas activas.`;
    }).join("\n");
}

export async function executeMcpTool(name: string, args: Record<string, any>): Promise<string> {
    const client = toolToClientMap.get(name);
    if (!client) throw new Error(`[MCP] Herramienta no encontrada o prefijo inválido: ${name}`);

    // Extraemos el nombre original (quitando el prefijo mcp_servidor_)
    const nameParts = name.split("_");
    const originalName = nameParts.slice(2).join("_");

    // Interceptor de Parámetros y Calidad para TrendRadar
    const isTrendRadar = name.startsWith("mcp_trendradar_");
    if (isTrendRadar) {
        // Solo inyectamos o limitamos el parámetro 'limit' en herramientas de búsqueda o listas
        const isListTool = name.includes("search") || name.includes("latest") || name.includes("_topics") || name.includes("_date");
        if (isListTool) {
            args.limit = Math.min(args.limit || 5, 5); 
            // Siempre incluimos la URL en las listas para que el agente pueda leerlas después
            args.include_url = true; 
        }
    }

    try {
        const result = await client.callTool(
            { name: originalName, arguments: args },
            undefined, // resultSchema - use default
            { timeout: 300000 } // 5 minutos de timeout para herramientas pesadas
        );

        const contentArr = result.content as any[];
        let finalResponse = contentArr.map(c => c.text || JSON.stringify(c)).join("\n");

        if (isTrendRadar && !finalResponse.includes("Error")) {
            console.log(`[MCP] 🌐 Traduciendo resultados de ${name}...`);
            const isArticle = name.includes("read_article");
            finalResponse = await translateTrendRadarResult(finalResponse, isArticle);
        }

        return finalResponse;
    } catch (error: any) {
        return `Error en herramienta MCP (${name}): ${error.message}`;
    }
}

/**
 * Helper dedicado para traducir los resultados de TrendRadar de forma aislada.
 * Esto evita que el Agente principal "se salte" la traducción por saturación.
 */
async function translateTrendRadarResult(content: string, isArticle: boolean = false): Promise<string> {
    try {
        const index = getInitialModelIndex();
        
        let systemPrompt = `Eres un traductor experto de Chino a Español. Tu tarea es traducir los resultados de noticias.`;
        
        if (isArticle) {
            systemPrompt += `\nREGLAS PARA ARTÍCULOS COMPLETOS:
1. El contenido es un artículo en Markdown obtenido vía Jina Reader.
2. Traduce el contenido completo al español manteniendo el formato Markdown (títulos, negritas, enlaces).
3. Asegura que el tono sea profesional e informativo.
4. Si el texto es muy extenso, prioriza la traducción de los párrafos principales y conclusiones.`;
        } else {
            systemPrompt += `\nREGLAS PARA TITULARES:
1. Mantén la estructura original de los resultados (plataformas, listas, etc.).
2. Traduce todos los titulares al español de forma natural y atractiva.
3. Si hay términos en inglés (ej: AI, Tesla), mantenlos o tradúcelos según el contexto.`;
        }

        systemPrompt += `\n\nREGLAS GENERALES:
- Responde SOLO con el contenido traducido, sin preámbulos ni explicaciones.
- Si el contenido ya parece estar en español, devuélvelo tal cual.`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: content }
        ];

        // Usamos un modelo rápido pero capaz para esta tarea puntual
        const { data } = await getLLMResponse(messages, index);
        return data.choices?.[0]?.message?.content || content;
    } catch (e) {
        console.error("[MCP] ❌ Fallo en Traducción Interceptor:", e);
        return content; // Fallback al contenido original si la traducción falla
    }
}
