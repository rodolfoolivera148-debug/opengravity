import { initMcpClient, executeMcpTool, getMcpTools } from "./src/agent/mcpClient.js";

async function test() {
    try {
        console.log("--- TEST DE INTEGRACIÓN FIREBASE MCP ---");
        await initMcpClient();
        
        const tools = getMcpTools();
        const firebaseTools = tools.filter(t => t.function.name.startsWith("mcp_firebase_"));
        
        if (firebaseTools.length === 0) {
            console.error("❌ No se encontraron herramientas de Firebase. Revisa mcp_tools.txt");
            process.exit(1);
        }

        console.log(`✅ ${firebaseTools.length} herramientas de Firebase detectadas.`);
        
        // Intentar una acción simple: listar colecciones
        // El nombre real suele ser 'firestore_list_collections' -> 'mcp_firebase_firestore_list_collections'
        const toolToCall = "mcp_firebase_firestore_list_documents"; // Ajustar según disponibilidad
        console.log(`Ejecutando ${toolToCall}...`);
        
        const result = await executeMcpTool(toolToCall, {
            project_id: "opengravity-1234",
            collection_id: "messages"
        });

        console.log("Resultado de Firebase:");
        console.log(result);
        process.exit(0);
    } catch (e) {
        console.error("Fallo crítico:", e);
        process.exit(1);
    }
}

test();
