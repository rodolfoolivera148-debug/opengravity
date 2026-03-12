const { spawn } = require('child_process');

// Usar el path directo al bin de firebase-tools
const firebaseBin = "C:\\Users\\Rodolfo Olivera\\AppData\\Roaming\\npm\\node_modules\\firebase-tools\\lib\\bin\\firebase.js";

const child = spawn(process.execPath, [firebaseBin, "mcp"], {
    stdio: ['pipe', 'pipe', 'pipe'], // Interceptar stdin, stdout, stderr
    env: { ...process.env, CI: "true", FIREBASE_SKIP_UPDATE_CHECK: "true" } // deshabilitar promps
});

child.stdout.on('data', (data) => {
    console.log(`[STDOUT] ${data.toString()}`);
});

child.stderr.on('data', (data) => {
    console.log(`[STDERR] ${data.toString()}`);
});

child.on('error', (err) => {
    console.error(`[SPAWN ERROR]`, err);
});

child.on('close', (code) => {
    console.log(`[EXIT] Process exited with code ${code}`);
});

// Envia un request de MCP inicial
const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" }
    }
}) + "\n";

console.log("[SENDING REQUEST]", initRequest);
child.stdin.write(initRequest);

setTimeout(() => {
    console.log("[TIMEOUT] 10s alcanzado, matando proceso...");
    child.kill();
}, 10000);
