// src/bot/telegram.ts
import { Bot, InputFile, InlineKeyboard, Context } from "grammy";
import { env } from "../config/env.js";
import { runAgentLoop } from "../agent/loop.js";

// Inicializa el bot de Telegram
export const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Mapa para gestionar confirmaciones pendientes
const pendingConfirmations = new Map<string, (approved: boolean) => void>();

/**
 * Pide confirmación al usuario antes de ejecutar una herramienta sensible.
 * (Human-in-the-loop Strategy)
 */
export async function requestConfirmation(userId: number, toolName: string, args: any): Promise<boolean> {
    const confirmationId = `${userId}_${Date.now()}`;
    const keyboard = new InlineKeyboard()
        .text("✅ Aprobar", `confirm_${confirmationId}_yes`)
        .text("❌ Rechazar", `confirm_${confirmationId}_no`);

    const summary = JSON.stringify(args, null, 2).substring(0, 500);
    const message = `⚠️ *PETICIÓN DE ACCIÓN SENSIBLE*\n\n🛠 *Herramienta:* \`${toolName}\`\n📋 *Argumentos:* \n\`\`\`json\n${summary}\n\`\`\`\n\n¿Deseas ejecutar esta acción?`;

    await bot.api.sendMessage(userId, message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
    });

    return new Promise((resolve) => {
        pendingConfirmations.set(confirmationId, resolve);
        // Timeout de seguridad por si el usuario no responde en 5 min
        setTimeout(() => {
            if (pendingConfirmations.has(confirmationId)) {
                pendingConfirmations.delete(confirmationId);
                resolve(false);
            }
        }, 300000);
    });
}

// Manejar clics en los botones de confirmación
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data || "";
    if (data.startsWith("confirm_")) {
        const [_, id, choice] = data.split("_");
        const resolver = pendingConfirmations.get(id);
        
        if (resolver) {
            resolver(choice === "yes");
            pendingConfirmations.delete(id);
            await ctx.editMessageText(choice === "yes" ? "✅ Acción aprobada y en ejecución..." : "❌ Acción rechazada.");
        } else {
            await ctx.answerCallbackQuery("Error: Esta petición ha expirado.");
        }
    }
});

/**
 * Envía mensajes largos manejando las limitaciones de Telegram (4k chars)
 */
async function sendRobustMessage(ctx: any, content: string) {
    const MAX_LENGTH = 3800;
    if (content.length <= MAX_LENGTH) {
        return await ctx.reply(content, { parse_mode: "Markdown" }).catch(() => ctx.reply(content));
    }
    const preview = content.substring(0, 1000) + "\n\n... (Mensaje truncado. Ver archivo completo) ...";
    await ctx.reply(preview);
    try {
        const fileContent = Buffer.from(content, 'utf-8');
        await ctx.replyWithDocument(new InputFile(fileContent, "respuesta_completa.md"), {
            caption: "📄 Respuesta completa generada por OpenGravity"
        });
    } catch (e) {
        for (let i = 0; i < content.length; i += MAX_LENGTH) {
            await ctx.reply(content.substring(i, i + MAX_LENGTH));
        }
    }
}

bot.use(async (ctx, next) => {
    if (!ctx.from || !env.TELEGRAM_ALLOWED_USER_IDS.includes(ctx.from.id)) return;
    await next();
});

bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    await ctx.replyWithChatAction("typing");
    try {
        const response = await runAgentLoop(userId, ctx.message.text);
        await sendRobustMessage(ctx, response);
    } catch (error: any) {
        await ctx.reply("❌ Error al procesar tu mensaje.");
    }
});

bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy OpenGravity. He activado el sistema de validación estricta y ruteo inteligente.");
});
