import { env } from "./config/env.js";
import { bot } from "./bot/telegram.js";
import express from "express";
import { webhookCallback } from "grammy";

async function main() {
    console.log("Iniciando OpenGravity v2.0...");
    
    // Express para Webhook/Cloud Run Salud
    const app = express();
    app.use(express.json());

    app.get("/", (req, res) => res.send("OpenGravity Bot is Online ✅"));

    // MODO WEBHOOK (Para Nube 100% Gratis - Cloud Run/Render)
    if (env.WEBHOOK_URL) {
        console.log(`[Cloud] Modo Webhook Activo: ${env.WEBHOOK_URL}`);
        app.post("/webhook", webhookCallback(bot, "express"));
        
        // Iniciar Servidor HTTP
        app.listen(env.PORT, () => {
            console.log(`[Cloud] Servidor Webhook escuchando en puerto ${env.PORT}`);
        });

        // Configurar Webhook en Telegram al iniciar
        try {
            await bot.api.setWebhook(`${env.WEBHOOK_URL}/webhook`);
            console.log("✅ Webhook registrado exitosamente en Telegram.");
        } catch (e) {
            console.error("❌ Error registrando Webhook:", e);
        }
    } else {
        // MODO POLLING (Local/Desarrollo)
        console.log("[Local] Modo Long Polling Activo...");
        app.listen(env.PORT, () => console.log(`[Local] Port ${env.PORT} listening for health checks.`));

        // 1. Validar conexión a Cloud Firestore
        await import("./config/firebase.js");
        console.log("Conectado exitosamente a Firebase Firestore.");

        // 2. Iniciar cliente MCP con el nuevo modo silencioso
        const { initMcpClient } = await import("./agent/mcpClient.js");
        await initMcpClient();

        // 3. Buffer de seguridad extendido para evitar Conflicto 409 (Telegram)
        console.log("Conexión estabilizada. Aguardando a que instancias previas cierren (15s)...");
        await new Promise(r => setTimeout(r, 15000));

        bot.catch((err: any) => {
            const errMsg = err.description || err.message || "";
            if (errMsg.includes("Conflict")) {
                console.error("❌ Conflicto 409: La sesión anterior sigue activa. Reintentando en 20s...");
                setTimeout(() => process.exit(1), 20000);
            } else {
                console.error("❌ Error en el bot de Telegram:", err);
            }
        });

        let started = false;
        let attempts = 0;
        while (!started && attempts < 5) {
            try {
                await bot.start({
                    drop_pending_updates: true,
                    onStart: (botInfo) => {
                        console.log(`🚀 BOT ONLINE: @${botInfo.username} (Polling)`);
                    }
                });
                started = true;
            } catch (err: any) {
                attempts++;
                const errMsg = err.description || err.message || "";
                if (errMsg.includes("Conflict") || errMsg.includes("409")) {
                    console.warn(`[Telegram] ⚠️ Conflicto 409 (Intento ${attempts}/5). Reintentando en 10s...`);
                    await new Promise(res => setTimeout(res, 10000));
                } else {
                    throw err;
                }
            }
        }
    }

    // Asegurar detención limpia
    const gracefulShutdown = async () => {
        console.log("Cerrando sesión de Telegram...");
        try { if (!env.WEBHOOK_URL) await bot.stop(); } catch (e) {}
        process.exit(0);
    };
    process.once("SIGINT", gracefulShutdown);
    process.once("SIGTERM", gracefulShutdown);
}

main().catch((err) => {
    console.error("❌ Error fatal durante el inicio:", err);
    process.exit(1);
});
