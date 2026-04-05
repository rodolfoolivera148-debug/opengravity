import { dbFirestore } from "../config/firebase.js";
import { getLLMResponse, getModelCount } from "./llm.js";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

/**
 * Agente Auditor (Estrategia: Evolución por Contraste)
 * Analiza fallos comparándolos con éxitos para extraer patrones de mejora.
 */
export async function runFailureAudit(userId: number) {
    try {
        // Obtenemos las últimas 10 trazas del usuario sin filtros complejos para evitar requerir índices compuestos
        const snapshot = await dbFirestore.collection('traces')
            .where('user_id', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();

        if (snapshot.empty) return;

        const allTraces = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
            const d = doc.data();
            return { user: d.user_message, thought: d.thought_process?.[0], results: d.results, success: d.success, timestamp: d.timestamp?.toDate() };
        });

        allTraces.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));

        const failures = allTraces.filter(t => t.success === false).slice(0, 3);
        const successes = allTraces.filter(t => t.success === true).slice(0, 2);

        if (failures.length === 0) return;

        const auditPrompt = `Eres el Cerebro Auditor de OpenGravity. Tu misión es EVOLUCIONAR el sistema analizando fallos.

CASOS DE ÉXITO (Referencia):
${JSON.stringify(successes, null, 2)}

FALLOS TÉCNICOS DETECTADOS:
${JSON.stringify(failures, null, 2)}

INSTRUCCIONES:
1. Compara los éxitos con los fallos.
2. Identifica el error raíz: ¿El modelo intentó usar una herramienta que no existe? ¿Se confundió con las rutas de Windows? ¿Olvidó confirmar el éxito?
3. Genera una "REGLA CRÍTICA" en español que sea una instrucción directa para el Agente. Debe ser corta y evitar que el error se repita.

Responde SOLO con la regla. Ejemplo: "Usa siempre rutas absolutas de Windows con barras invertidas dobles para evitar errores de escape."
`;

        // Usamos el mejor modelo disponible (índice 0 suele ser Llama 70B o similar en este proyecto)
        const response = await getLLMResponse([{ role: "user", content: auditPrompt }], 0); 
        const suggestion = response.choices[0].message.content?.trim();

        if (suggestion) {
            console.log(`[Auditor] Nueva regla de evolución generada: ${suggestion}`);

            // Persistir la optimización
            await dbFirestore.collection('prompt_optimizations').doc(userId.toString()).set({
                last_suggestion: suggestion,
                updated_at: new Date(),
                audit_log: failures.map(f => f.user)
            });
        }

    } catch (e: any) {
        console.warn("[Auditor] Error en el proceso de evolución:", e.message);
    }
}
