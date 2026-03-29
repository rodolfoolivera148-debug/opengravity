// src/index.ts
import { env } from "./config/env.js";
import { bot } from "./bot/telegram.js";

async function main() {
    console.log("Iniciando OpenGravity v2.0...");

    // 1. Validar conexión a Cloud Firestore
    await import("./config/firebase.js");
    console.log("Conectado exitosamente a Firebase Firestore.");

    // 2. Iniciar cliente MCP con el nuevo modo silencioso
    const { initMcpClient } = await import("./agent/mcpClient.js");
    await initMcpClient();

    // 3. Buffer de seguridad extendido para evitar Conflicto 409 (Telegram)
    // tsx --watch reinicia rápido, pero Telegram tarda en soltar la sesión antigua.
    console.log("Conexión estabilizada. Aguardando a que instancias previas cierren (15s)...");
    await new Promise(r => setTimeout(r, 15000));

    // 4. Asegurar detención limpia (debe ser asíncrono para esperar el cierre de red)
    const gracefulShutdown = async () => {
        console.log("Cerrando sesión de Telegram (evitando 409)...");
        try {
            await bot.stop();
        } catch (e) {}
        process.exit(0);
    };
    process.once("SIGINT", gracefulShutdown);
    process.once("SIGTERM", gracefulShutdown);

    bot.catch((err: any) => {
        const errMsg = err.description || err.message || "";
        if (errMsg.includes("Conflict")) {
            console.error("❌ Conflicto 409: La sesión anterior sigue activa. Reintentando en 20s...");
            setTimeout(() => process.exit(1), 20000);
        } else {
            console.error("❌ Error en el bot de Telegram:", err);
        }
    });

    // Bucle de reintentos para bot.start() en caso de Conflict 409
    let started = false;
    let attempts = 0;
    while (!started && attempts < 5) {
        try {
            await bot.start({
                drop_pending_updates: true,
                onStart: (botInfo) => {
                    console.log(`🚀 BOT ONLINE: @${botInfo.username}`);
                    console.log(`🛡️ Seguridad activa. Solo usuarios permitidos.`);
                }
            });
            started = true;
        } catch (err: any) {
            attempts++;
            const errMsg = err.description || err.message || "";
            if (errMsg.includes("Conflict") || errMsg.includes("409")) {
                console.warn(`[Telegram] ⚠️ Conflicto 409 detectado (Intento ${attempts}/5). La sesión anterior en Telegram se está cerrando. Reintentando en 10s...`);
                await new Promise(res => setTimeout(res, 10000));
            } else {
                console.error("❌ Error grave al iniciar el bot de Telegram:", err);
                throw err;
            }
        }
    }

    if (!started) {
        throw new Error("No se pudo iniciar el bot tras 5 intentos por conflictos de sesión.");
    }
}

main().catch((err) => {
    console.error("❌ Error fatal durante el inicio:", err);
    process.exit(1);
});
