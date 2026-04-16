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
        command: "node",
        args: [
            path.resolve(process.cwd(), "node_modules/firebase-tools/lib/bin/firebase.js"),
            "mcp",
            "--only",
            "core,firestore"
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
        args: ["run", "--directory", "trendradar", "python", "-m", "mcp_server.server"],
        env: { 
            PYTHONUNBUFFERED: "1",
            PYTHONUTF8: "1",
            // Puedes añadir aquí variables de entorno de TrendRadar si las necesitas
        }
    }
];

let unifiedTools: any[] = [];
const toolToClientMap = new Map<string, Client>();
const toolOriginalNameMap = new Map<string, string>();
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
                description: (resolved.description || "").substring(0, 100), // LIMITADO AGRESIVAMENTE PARA EVITAR 413 EN GROQ
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
    toolOriginalNameMap.clear();

    const remoteUrl = await getRemoteColabUrl();
    if (remoteUrl) {
        // Evitar duplicados si initMcpClient se llama más de una vez
        const alreadyAdded = SERVERS.some(s => s.name === "science_lab");
        if (!alreadyAdded) {
            console.log(`[MCP] Detectada Science Lab remota en: ${remoteUrl}`);
            SERVERS.push({ name: "science_lab", type: "sse", url: remoteUrl });
        }
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
                            description: `[${config.name}] ${tool.description || ""}`.substring(0, 250), // LIMITADO AGRESIVAMENTE PARA EVITAR 413
                            parameters: sanitizeToolSchema(tool.inputSchema),
                        }
                    });
                    toolToClientMap.set(prefixedName, client);
                    toolOriginalNameMap.set(prefixedName, tool.name);
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

    // Extraemos el nombre original usando el mapa (evita bugs con underscores en nombres de servidor)
    const originalName = toolOriginalNameMap.get(name) || name.split("_").slice(2).join("_");

    // Interceptor de Parámetros y Calidad para TrendRadar
    const isTrendRadar = name.startsWith("mcp_trendradar_");
    if (isTrendRadar) {
        // 1. Mapeo de parámetros antiguos o alucinados — CONDICIONAL por herramienta
        if (name.includes("search_news")) {
            // search_news usa 'query' → renombrar keyword/keywords → query
            if (args.keywords && !args.query) {
                args.query = args.keywords;
                delete args.keywords;
            }
            if (args.keyword && !args.query) {
                args.query = args.keyword;
                delete args.keyword;
            }
        } else if (name.includes("search_rss")) {
            // search_rss usa 'keyword' → renombrar query/keywords → keyword  
            if (args.query && !args.keyword) {
                args.keyword = args.query;
                delete args.query;
            }
            if (args.keywords && !args.keyword) {
                args.keyword = args.keywords;
                delete args.keywords;
            }
        }

        // 2. Eliminar agresivamente parámetros que el LLM inventa y causan ValidationError
        const hallucinated = [
            'source_countries', 'country', 'countries', 'language', 'lang',
            'date_from', 'date_to', 'start_date', 'end_date', 'sort',
            'sort_by', 'order', 'format', 'category', 'type', 'max_results',
            'page', 'offset', 'fields', 'output_format', 'time_range',
            'time_period', 'period', 'range', 'since', 'until', 'before', 'after'
        ];
        for (const param of hallucinated) {
            delete args[param];
        }

        if (name.includes("search_news")) {
            // Optimización de Consulta: mapa estático (NO usa LLM para evitar rate limits)
            if (args.query) {
                args.query = optimizeSearchQuery(args.query);
            }
            if (args.source === "rss" || args.include_rss) {
                args.include_rss = true;
            }
            delete args.source;
            delete args.days;
        } else if (name.includes("search_rss")) {
            // Optimizar keyword para search_rss
            if (args.keyword) {
                args.keyword = optimizeSearchQuery(args.keyword);
            }
        }

        // 3. Limitación de cantidad para evitar saturación
        const isListTool = name.includes("search") || name.includes("latest") || name.includes("_topics") || (name.includes("_date") && !name.includes("list_available_dates"));
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

        if (isTrendRadar && !finalResponse.toLowerCase().includes("error")) {
            // Formatear JSON a Markdown para mejor legibilidad (sin LLM, sin rate limits)
            finalResponse = formatTrendRadarResults(finalResponse, originalName);
        }

        return finalResponse;
    } catch (error: any) {
        return `Error en herramienta MCP (${name}): ${error.message}`;
    }
}

/**
 * Formateador de Resultados: Convierte JSON técnico de TrendRadar en Markdown amigable.
 */
function formatTrendRadarResults(jsonStr: string, toolName: string): string {
    try {
        const data = JSON.parse(jsonStr);

        // Detectar errores explícitos del servidor
        if (data.success === false && data.error) {
            return `❌ ERROR EN TRENDRADAR: ${data.error.message || JSON.stringify(data.error)}`;
        }

        // Extraer el array de items de cualquier campo conocido
        const knownArrayFields = ['data', 'hot_news', 'items', 'results', 'news', 'articles', 'feeds', 'topics'];
        let items: any[] = [];
        let rssItems: any[] = [];

        // Buscar cualquier array en el objeto raíz
        for (const field of knownArrayFields) {
            if (Array.isArray(data[field]) && data[field].length > 0) {
                items = data[field];
                break;
            }
        }
        if (Array.isArray(data.rss) && data.rss.length > 0) rssItems = data.rss;

        // Si no encontramos nada en campos conocidos, buscar cualquier array
        if (items.length === 0 && rssItems.length === 0) {
            for (const val of Object.values(data)) {
                if (Array.isArray(val) && val.length > 0) { items = val; break; }
            }
        }

        if (items.length === 0 && rssItems.length === 0) {
            // Puede ser un objeto simple con datos (ej: status de feeds)
            if (typeof data === 'object' && !Array.isArray(data)) {
                const lines = Object.entries(data)
                    .filter(([k]) => k !== 'success')
                    .map(([k, v]) => `- **${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`);
                return lines.length > 0 ? lines.join('\n') : jsonStr;
            }
            return "No se encontraron noticias ni tendencias para esta búsqueda.";
        }

        let output = "";

        if (items.length > 0) {
            output += `### 📈 Tendencias / Noticias Encontradas:\n`;
            items.forEach((item: any, i: number) => {
                if (typeof item === 'string') {
                    output += `${i + 1}. ${item}\n`;
                    return;
                }
                // Buscar el título en múltiples campos posibles
                const title = item.title || item.name || item.keyword || item.topic || item.headline || JSON.stringify(item).substring(0, 80);
                output += `${i + 1}. **${title}**\n`;
                const source = item.platform_name || item.source || item.feed_name || item.platform || '';
                if (source) output += `   - Fuente: ${source}\n`;
                const url = item.url || item.link || item.href || '';
                if (url) output += `   - [Ver más](${url})\n`;
                const summary = item.summary || item.description || item.content || item.snippet || '';
                if (summary) output += `   - Resumen: ${String(summary).substring(0, 250)}...\n`;
                // Info adicional según tipo de herramienta
                if (item.count !== undefined) output += `   - Menciones: ${item.count}\n`;
                if (item.heat !== undefined) output += `   - Heat: ${item.heat}\n`;
                if (item.published_at || item.pub_date) output += `   - Fecha: ${item.published_at || item.pub_date}\n`;
            });
            output += "\n";
        }

        if (rssItems.length > 0) {
            output += `### 📰 Resultados RSS / Especializados:\n`;
            rssItems.forEach((item: any, i: number) => {
                const title = item.title || item.name || JSON.stringify(item).substring(0, 80);
                output += `${i + 1}. **${title}**\n`;
                if (item.feed_name) output += `   - Canal: ${item.feed_name}\n`;
                const url = item.link || item.url || '';
                if (url) output += `   - [Leer Artículo](${url})\n`;
                const desc = item.description || item.summary || '';
                if (desc) output += `   - Resumen: ${String(desc).substring(0, 200)}...\n`;
            });
        }

        return output.trim() || jsonStr;
    } catch (e) {
        // Si no es JSON o falla el parseo, devolver original
        return jsonStr;
    }
}

/**
 * Optimizador de consultas ESTÁTICO — NO usa LLM, no consume rate limits.
 * Traduce términos comunes de español a inglés para mejorar resultados de búsqueda.
 */
function optimizeSearchQuery(query: string): string {
    const q = query.toLowerCase().trim();
    const translations: Record<string, string> = {
        'inteligencia artificial': 'artificial intelligence',
        'aprendizaje automático': 'machine learning',
        'aprendizaje profundo': 'deep learning',
        'computación cuántica': 'quantum computing',
        'energía renovable': 'renewable energy',
        'cambio climático': 'climate change',
        'guerra comercial': 'trade war',
        'ciberseguridad': 'cybersecurity',
        'semiconductores': 'semiconductors',
        'vehículos eléctricos': 'electric vehicles',
        'robótica': 'robotics',
        'biotecnología': 'biotechnology',
        'economía': 'economy',
        'política': 'politics',
        'tecnología': 'technology',
        'ciencia': 'science',
        'salud': 'health',
        'finanzas': 'finance',
        'criptomonedas': 'cryptocurrency',
        'blockchain': 'blockchain',
        'espacial': 'space',
        'defensa': 'defense',
        'educación': 'education',
        'noticias': 'news',
        'china': 'China',
        'eeuu': 'USA',
        'estados unidos': 'United States',
        'europa': 'Europe',
    };

    // Buscar coincidencia exacta primero
    if (translations[q]) {
        console.log(`[MCP] 🔍 Búsqueda optimizada: "${query}" -> "${translations[q]}"`);
        return translations[q];
    }

    // Buscar coincidencia parcial
    for (const [es, en] of Object.entries(translations)) {
        if (q.includes(es)) {
            const optimized = q.replace(es, en);
            console.log(`[MCP] 🔍 Búsqueda optimizada: "${query}" -> "${optimized}"`);
            return optimized;
        }
    }

    // Si no hay traducción, pasar el query tal cual
    console.log(`[MCP] 🔍 Búsqueda sin traducción: "${query}"`);
    return query;
}
