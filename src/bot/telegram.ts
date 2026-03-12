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

        // Intentar enviar respuesta de voz
        try {
            console.log(`[Voice] Generando voz para ${userId}...`);
            const { textToSpeech } = await import("../services/elevenlabs.js");
            // Limpiamos el texto un poco de asteriscos y emojis para el TTS
            const cleanText = response.replace(/[*_~`]/g, '').trim();
            const audioBuffer = await textToSpeech(cleanText);

            const { InputFile } = await import("grammy");
            console.log(`[Voice] Audio generado (${audioBuffer.length} bytes), enviando a Telegram...`);
            await ctx.replyWithVoice(new InputFile(audioBuffer, "voice.mp3"));
            console.log(`[Voice] Nota de voz enviada exitosamente.`);
        } catch (voiceError: any) {
            console.error("[Voice Error] Fallo al generar o enviar la nota de voz:", voiceError.message);
        }
    } catch (error: any) {
        console.error(`[Error] Fallo al procesar mensaje de ${userId}:`, error);
        await ctx.reply("❌ Ocurrió un error interno al procesar tu mensaje.");
    }
});

// Comandos básicos
bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy OpenGravity, tu agente de IA personal. ¿En qué te puedo ayudar hoy?");
});
