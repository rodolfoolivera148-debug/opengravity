import { env } from "./config/env.js";
import { bot } from "./bot/telegram.js";
import { onExit } from "signal-exit";

async function main() {
    console.log("Iniciando OpenGravity...");

    // Validar conexión a Cloud Firestore
    await import("./config/firebase.js");
    console.log("Conectado exitosamente a Firebase Firestore.");

    // Iniciar cliente MCP con reintentos internos
    const { initMcpClient } = await import("./agent/mcpClient.js");
    await initMcpClient();

    // Pequeño buffer de respiro para que las conexiones se estabilicen
    console.log("Conexión estabilizada, aguardando inicio de bot (5s)...");
    await new Promise(r => setTimeout(r, 5000));

    // Asegurar que el bot se detenga limpiamente al reiniciar el proceso (tsx watch)
    onExit(async () => {
        console.log("Deteniendo bot de forma segura para evitar conflictos (409)...");
        try {
            await bot.stop();
        } catch (e) {}
    });

    // Manejar errores de promesas globales
    process.on("unhandledRejection", (reason, promise) => {
        console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });

    bot.catch((err) => {
        const errMsg = err.message || "";
        if (errMsg.includes("Conflict")) {
            console.error("❌ Conflicto de Bot (409): Otra instancia está activa. Reiniciando en 10s...");
            setTimeout(() => process.exit(1), 10000);
        } else {
            console.error("❌ Error en el bot de Telegram:", err);
        }
    });

    await bot.start({
        onStart: (botInfo) => {
            console.log(`🤖 Bot iniciado exitosamente como @${botInfo.username}`);
            console.log(`👥 Usuarios permitidos: ${env.TELEGRAM_ALLOWED_USER_IDS.join(', ')}`);
        }
    });
}

main().catch((err) => {
    console.error("❌ Error fatal durante el inicio:", err);
    process.exit(1);
});
