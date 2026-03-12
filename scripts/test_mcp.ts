import { initMcpClient, getMcpTools } from "./src/agent/mcpClient.js";

async function test() {
    await initMcpClient();
    const tools = getMcpTools();
    console.log("Found tools:", tools.length);
    tools.forEach(t => console.log(`- ${t.function.name}`));
    process.exit(0);
}

test();
