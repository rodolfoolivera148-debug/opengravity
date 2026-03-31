import { initMcpClient, getMcpTools } from "./src/agent/mcpClient.js";
import { dbFirestore } from "./src/config/firebase.js";

async function test() {
    try {
        console.log("Iniciando prueba de MCP...");
        await initMcpClient();
        const tools = getMcpTools();
        const toolNames = tools.map(t => t.function.name);
        console.log("Herramientas encontradas:", toolNames);
        const fs = await import("fs");
        fs.writeFileSync("mcp_tools.txt", toolNames.join("\n"));
        process.exit(0);
    } catch (e) {
        console.error("Fallo crítico en la prueba:", e);
        process.exit(1);
    }
}

test();
