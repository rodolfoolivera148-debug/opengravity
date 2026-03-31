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
        .text("✅ Aprobar", `confirm:yes:${confirmationId}`)
        .text("❌ Rechazar", `confirm:no:${confirmationId}`);

    const summary = JSON.stringify(args, null, 2).substring(0, 500);
    const message = `⚠️ *PETICIÓN DE ACCIÓN SENSIBLE*\n\n🛠 *Herramienta:* \`${toolName}\`\n📋 *Argumentos:* \n\`\`\`json\n${summary}\n\`\`\`\n\n¿Deseas ejecutar esta acción?`;

    console.log(`[Telegram Debug] Enviando teclado de confirmación para ${toolName} (ID: ${confirmationId})`);
    await bot.api.sendMessage(userId, message, {
        parse_mode: "Markdown",
        reply_markup: keyboard
    });

    return new Promise((resolve) => {
        pendingConfirmations.set(confirmationId, (val) => {
            console.log(`[Telegram Debug] Resolver llamado para ID: ${confirmationId} con valor: ${val}`);
            resolve(val);
        });
        
        // Timeout de seguridad por si el usuario no responde en 5 min
        setTimeout(() => {
            if (pendingConfirmations.has(confirmationId)) {
                pendingConfirmations.delete(confirmationId);
                console.log(`[Telegram Debug] Timeout de 5min alcanzado para ID: ${confirmationId}`);
                resolve(false);
            }
        }, 300000);
    });
}

// Manejar clics en los botones de confirmación
bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data || "";
    if (data.startsWith("confirm:")) {
        const parts = data.split(":");
        const choice = parts[1];
        const id = parts.slice(2).join(":"); // Reconstruye el ID completo
        const resolver = pendingConfirmations.get(id);
        
        console.log(`[Telegram Debug] Clic detectado. ID: ${id}, Choice: ${choice}, Resolver Existe: ${!!resolver}`);
        
        if (resolver) {
            resolver(choice === "yes");
            pendingConfirmations.delete(id);
            try {
                await ctx.editMessageText(choice === "yes" ? "✅ Acción aprobada y en ejecución..." : "❌ Acción rechazada.");
            } catch (e: any) {
                console.warn(`[Telegram] Error editando texto: ${e.message}`);
            }
        } else {
            console.log(`[Telegram Debug] Resolver no encontrado para ID: ${id}. Mostrando expirado.`);
            try {
                await ctx.answerCallbackQuery("Error: Esta petición ha expirado.");
            } catch (e: any) {
                console.warn(`[Telegram] Error respondiendo callback: ${e.message}`);
            }
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
    
    // No usamos 'await' directo aquí para no bloquear el bucle de eventos de Telegram.
    // Al dejarlo asíncrono, el bot puede recibir clics de botones (confirmaciones)
    // mientras el Agente está pensando.
    (async () => {
        try {
            const response = await runAgentLoop(userId, ctx.message.text);
            await sendRobustMessage(ctx, response);
        } catch (error: any) {
            console.error("[Telegram Error] Falló el loop del agente:", error.message);
            await ctx.reply("❌ Error al procesar tu mensaje.");
        }
    })();
});

bot.command("start", async (ctx) => {
    await ctx.reply("¡Hola! Soy OpenGravity. He activado el sistema de validación estricta y ruteo inteligente.");
});

bot.command("status", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const { getEvolutionSummary } = await import("../memory/memoryManager.js");
    const summary = await getEvolutionSummary(userId);

    if (!summary) {
        return await ctx.reply("❌ No se pudo recuperar el estado de evolución.");
    }

    const message = `📈 *ESTADO DE EVOLUCIÓN (OpenGravity v2.0)*\n\n` +
        `🧠 *Experiencia acumulada:* ${summary.total_traces} trazas\n` +
        `✅ *Tasa de éxito:* ${summary.success_rate}%\n\n` +
        `⚠️ *REGLA ACTIVA (Auditor):*\n_\`${summary.last_rule}\`_`;

    await ctx.reply(message, { parse_mode: "Markdown" });
});
