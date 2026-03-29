import { z } from "zod";
import { executeMcpTool, getMcpTools } from "./mcpClient.js";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export interface ToolExecutionParams {
    timezone?: string;
    [key: string]: any;
}

export const tools = [
    {
        type: "function",
        function: {
            name: "execute_google_workspace_action",
            description: "Ejecuta una acción en Google Workspace (Gmail, Calendar, Drive, Sheets, Docs o Contacts) usando la herramienta gogcli. Recibe el comando completo para ejecutar. Ejemplos de uso: 'gmail search \"newer_than:7d\" --max 5', 'calendar events <calendarId>', 'drive search \"query\"'. Revisa la documentación de comandos soportados para asegurar que usas el comando correcto (no incluyas 'gog' al inicio del argumento).",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "El subcomando y opciones a ejecutar, por ejemplo: 'gmail search \"newer_than:7d\"'"
                    }
                },
                required: ["command"]
            }
        }
    },
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
    },
    {
        type: "function",
        function: {
            name: "execute_terminal_command",
            description: "Ejecuta un comando de sistema en la terminal (Shell/PowerShell) y retorna la salida. Útil para npm, git, compilar, etc. Debes tener cuidado con los comandos que bloquean la terminal o son interactivos, usa comandos que terminen su ejecución.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "El comando a ejecutar en la terminal (ej. 'npm run build', 'git status', 'mkdir new_folder')."
                    },
                    cwd: {
                        type: "string",
                        description: "Directorio de trabajo actual (opcional). Por defecto es la raíz del proyecto actual."
                    }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Lee el contenido de un archivo en el disco.",
            parameters: {
                type: "object",
                properties: {
                    filepath: {
                        type: "string",
                        description: "La ruta completa o relativa del archivo a leer."
                    }
                },
                required: ["filepath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Escribe o sobreescribe contenido en un archivo en el disco. Crea el archivo y carpetas destino si no existen.",
            parameters: {
                type: "object",
                properties: {
                    filepath: {
                        type: "string",
                        description: "La ruta del archivo a escribir."
                    },
                    content: {
                        type: "string",
                        description: "El contenido a escribir en el archivo."
                    }
                },
                required: ["filepath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_directory",
            description: "Lista los archivos y carpetas dentro de un directorio.",
            parameters: {
                type: "object",
                properties: {
                    dirpath: {
                        type: "string",
                        description: "La ruta de la carpeta a listar."
                    }
                },
                required: ["dirpath"]
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

export function getLocalTools() {
    return [...tools];
}

export async function executeTool(name: string, args: Record<string, any>): Promise<string> {
    const isLocal = tools.some(t => t.function.name === name);
    
    if (isLocal) {
        console.log(`[Tool] Ejecutando local: ${name} con argumentos:`, args);
        switch (name) {
            case "execute_google_workspace_action": {
                try {
                    const gogPath = path.join(process.cwd(), 'gog.exe');
                    const result = execSync(`"${gogPath}" ${args.command}`, { encoding: 'utf-8', windowsHide: true });
                    return result || "Comando ejecutado exitosamente sin salida.";
                } catch (error: any) {
                    const errorMsg = error.stderr?.toString() || error.stdout?.toString() || error.message;
                    return `Error al ejecutar gogcli: ${errorMsg}`;
                }
            }
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
            case "execute_terminal_command": {
                try {
                    const cwd = args.cwd || process.cwd();
                    const result = execSync(args.command, { encoding: 'utf-8', cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
                    return result || "Comando ejecutado exitosamente sin salida.";
                } catch (error: any) {
                    const errorMsg = error.stderr?.toString() || error.stdout?.toString() || error.message;
                    return `Error al ejecutar comando: ${errorMsg}`;
                }
            }
            case "read_file": {
                try {
                    const targetPath = path.resolve(process.cwd(), args.filepath);
                    if (!fs.existsSync(targetPath)) return `Error: El archivo ${targetPath} no existe.`;
                    const content = fs.readFileSync(targetPath, 'utf-8');
                    return content;
                } catch (error: any) {
                    return `Error al leer archivo: ${error.message}`;
                }
            }
            case "write_file": {
                try {
                    const targetPath = path.resolve(process.cwd(), args.filepath);
                    const dir = path.dirname(targetPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(targetPath, args.content, 'utf-8');
                    return `Archivo ${targetPath} guardado exitosamente.`;
                } catch (error: any) {
                    return `Error al escribir archivo: ${error.message}`;
                }
            }
            case "list_directory": {
                try {
                    const targetPath = path.resolve(process.cwd(), args.dirpath);
                    if (!fs.existsSync(targetPath)) return `Error: El directorio ${targetPath} no existe.`;
                    const stats = fs.statSync(targetPath);
                    if (!stats.isDirectory()) return `Error: ${targetPath} no es un directorio.`;
                    const files = fs.readdirSync(targetPath);
                    return `Contenido de ${targetPath}:\n` + files.map(f => {
                        const fPath = path.join(targetPath, f);
                        const isDir = fs.statSync(fPath).isDirectory();
                        return `${isDir ? '[DIR]' : '[FILE]'} ${f}`;
                    }).join('\n');
                } catch (error: any) {
                    return `Error al listar directorio: ${error.message}`;
                }
            }
            default:
                return `Herramienta local desconocida: ${name}`;
        }
    }

    // 2. FALLBACK: Herramientas de MCP (ahora con prefijos garantizados)
    const isMcpTool = getMcpTools().some((t: any) => t.function.name === name);
    if (isMcpTool) {
        console.log(`[Tool] Ejecutando MCP: ${name}`);
        return executeMcpTool(name, args);
    }

    return `Herramienta no encontrada (local ni MCP): ${name}`;
}
