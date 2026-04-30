import { env } from "./config/env.js";
import { bot } from "./bot/telegram.js";
import express, { Request, Response } from "express";
import { webhookCallback } from "grammy";

async function main() {
    console.log("Iniciando OpenGravity v2.0...");
    
    const isCloudMode = !!env.WEBHOOK_URL;
    const app = express();
    app.use(express.json());

    app.get("/", (req: Request, res: Response) => {
        res.send("OpenGravity Bot is Online ✅");
    });

    // ═══════════════════════════════════════════════════════════
    // 1. INICIO INMEDIATO DEL SERVIDOR (Para Render/Cloud Run)
    // ═══════════════════════════════════════════════════════════
    const server = app.listen(env.PORT, () => {
        console.log(`[System] Servidor ${isCloudMode ? 'Cloud' : 'Local'} activo en puerto ${env.PORT}`);
    });

    // ═══════════════════════════════════════════════════════════
    // 2. INFRAESTRUCTURA EN SEGUNDO PLANO
    // ═══════════════════════════════════════════════════════════
    
    // Validar conexión a Cloud Firestore
    const initFirebase = async () => {
        try {
            await import("./config/firebase.js");
            console.log("✅ Conectado a Firebase Firestore.");
        } catch (e: any) {
            console.error("⚠️ Firebase error:", e.message);
        }
    };

    // Iniciar cliente MCP (graceful)
    const initMcp = async () => {
        try {
            const { initMcpClient } = await import("./agent/mcpClient.js");
            await initMcpClient();
            console.log("✅ Ecosistema MCP inicializado.");
        } catch (e: any) {
            console.warn("⚠️ MCP error:", e.message);
        }
    };

    // Lanzamos inicializaciones
    initFirebase();
    initMcp();

    // Iniciar worker de sincronización SQLite → Firestore en background
    const { startSyncWorker } = await import("./memory/memoryManager.js");
    startSyncWorker();

    // 3. Error handler global del bot
    bot.catch((err: any) => {
        const errMsg = err.description || err.message || "";
        console.error("❌ Error en el bot de Telegram:", err);
    });

    // ═══════════════════════════════════════════════════════════
    // 3. MODO WEBHOOK (Nube) vs POLLING (Local)
    // ═══════════════════════════════════════════════════════════
    if (isCloudMode) {
        console.log(`[Cloud] Configurando Webhook en: ${env.WEBHOOK_URL}/webhook`);
        app.post("/webhook", webhookCallback(bot, "express"));
        
        try {
            await bot.api.setWebhook(`${env.WEBHOOK_URL}/webhook`);
            console.log("✅ Webhook registrado exitosamente en Telegram.");
        } catch (e) {
            console.error("❌ Error registrando Webhook:", e);
        }
    } else {
        // ═══════════════════════════════════════════════════════════
        // MODO POLLING (Local/Desarrollo)
        // ═══════════════════════════════════════════════════════════
        console.log("[Local] Modo Long Polling Activo...");
        app.listen(env.PORT, () => console.log(`[Local] Port ${env.PORT} listening for health checks.`));

        // Buffer de seguridad extendido para evitar Conflicto 409 (Telegram)
        console.log("Conexión estabilizada. Aguardando a que instancias previas cierren (15s)...");
        await new Promise(r => setTimeout(r, 15000));

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
