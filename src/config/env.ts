import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_ALLOWED_USER_IDS: z.string().transform((val) =>
        val.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
    ),
    GROQ_API_KEY: z.string().min(1),
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default("openrouter/free"),
    DB_PATH: z.string().default("./memory.db"),
    FIREBASE_PROJECT_ID: z.string().optional().default("opengravity-1234"),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
    PORT: z.string().default("3000"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Invalid environment variables:", _env.error.format());
    process.exit(1);
}

export const env = _env.data;
