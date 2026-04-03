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

    try {
        const result = await client.callTool({ name: originalName, arguments: args });
        const contentArr = result.content as any[];
        return contentArr.map(c => c.text || JSON.stringify(c)).join("\n");
    } catch (error: any) {
        return `Error en herramienta MCP (${name}): ${error.message}`;
    }
}
