import { env } from "./config/env.js";
import { bot } from "./bot/telegram.js";

async function main() {
    console.log("Iniciando OpenGravity...");

    // Validar conexión a Cloud Firestore
    await import("./config/firebase.js");
    console.log("Conectado exitosamente a Firebase Firestore.");

    // Iniciar cliente MCP
    const { initMcpClient } = await import("./agent/mcpClient.js");
    await initMcpClient();

    // Manejar errores de promesas globales
    process.on("unhandledRejection", (reason, promise) => {
        console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    });

    bot.catch((err) => {
        console.error("❌ Error en el bot de Telegram:", err);
    });

    // Iniciar bot
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
