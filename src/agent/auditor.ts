import { dbFirestore } from "../config/firebase.js";
import { getLLMResponse } from "./llm.js";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Agente Auditor (Estrategia: Self-Correction)
 * Analiza fallos en las trazas y genera recomendaciones de prompt.
 */
export async function runFailureAudit(userId: number) {
    try {
        const snapshot = await dbFirestore.collection('traces')
            .where('user_id', '==', userId)
            .where('success', '==', false)
            .orderBy('timestamp', 'desc')
            .limit(3)
            .get();

        if (snapshot.empty) return;

        const failures = snapshot.docs.map((doc: QueryDocumentSnapshot) => doc.data());
        const auditPrompt = `Eres un Ingeniero de Prompts Senior. Analiza estos fallos técnicos de un Bot de automatización local:
        
${JSON.stringify(failures, null, 2)}

Tu objetivo es identificar el error (¿Hallucinación? ¿Falta de contexto? ¿Malos argumentos?) y generar una REGLA CRÍTICA corta en español para añadirla al prompt del sistema y evitar que se repita. Responde SOLO con la regla en una frase.
`;

        const response = await getLLMResponse([{ role: "user", content: auditPrompt }], 0); // Groq/Gemini
        const suggestion = response.choices[0].message.content;

        console.log(`[Auditor] Sugerencia de mejora detectada: ${suggestion}`);

        // Guardar la sugerencia en una nueva colección para que el bot la use en tiempo real
        await dbFirestore.collection('prompt_optimizations').doc(userId.toString()).set({
            last_suggestion: suggestion,
            updated_at: new Date()
        });

    } catch (e: any) {
        console.warn("[Auditor] Error en el bucle de autocrítica:", e.message);
    }
}
