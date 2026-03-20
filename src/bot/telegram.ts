import { Bot } from "grammy";
import { env } from "../config/env.js";
import { runAgentLoop } from "../agent/loop.js";

// Inicializa el bot de Telegram
export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Middleware para restringir acceso solo a IDs permitidos
bot.use(async (ctx, next) => {
    if (!ctx.from) return;

    if (!env.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from.id)) {
        console.warn(`[Seguridad] Usuario no autorizado intentó interactuar: ${ctx.from.id} (@${ctx.from.username})`);
        return;
    }

    await next();
});

// Manejador principal de mensajes de texto
bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // Enviar estado de "escribiendo..."
    await ctx.replyWithChatAction("typing");

    try {
        const response = await runAgentLoop(userId, text);
        // Enviar respuesta de texto
        await ctx.reply(response);
    } catch (error: any) {
        console.error(`[Error] Fallo al procesar mensaje de ${userId}:`, error);
        await ctx.reply("❌ Ocurrió un error interno al procesar tu mensaje.");
    }
});

// Comandos básicos
bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy OpenGravity, tu agente de IA personal. ¿En qué te puedo ayudar hoy?");
});
