
import { runAgentLoop } from "../src/agent/loop.js";
import { env } from "../src/config/env.js";

async function test() {
    console.log("Testing OpenGravity Agent Loop...");
    const userId = env.TELEGRAM_ALLOWED_USER_IDS[0];
    
    if (!userId) {
        console.error("No allowed user IDs found in .env");
        return;
    }

    try {
        console.log(`Running loop for user: ${userId}`);
        const response = await runAgentLoop(userId, "Hola, ¿quién eres y qué hora es?");
        console.log("Agent Response:", response);
    } catch (error) {
        console.error("Test failed:", error);
    }
}

test();
