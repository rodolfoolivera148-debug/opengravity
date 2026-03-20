
import dotenv from "dotenv";
dotenv.config();

async function testGroq() {
    console.log("Testing Groq Connectivity...");
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error("GROQ_API_KEY not found");
        return;
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: "Hello" }]
            })
        });

        console.log("Status:", response.status);
        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("Fetch failed:", error);
    }
}

testGroq();
