// src/memory/memoryManager.ts
import { dbFirestore } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { env } from "../config/env.js";
import { saveMessage as saveLocal, getMessages as getLocal, MessageRow, enqueueSyncMessage, getPendingSyncMessages, deleteSyncMessage, incrementSyncAttempts } from "./db.js";

const COLLECTION_NAME = 'messages';

/**
 * Sistema de memoria híbrido: Cloud (Firestore) con fallback Local (SQLite).
 */
export async function saveMessage(userId: number, role: 'system' | 'user' | 'assistant' | 'tool', content: string) {
    // 1. Guardar siempre en local primero (garantizado)
    saveLocal(userId, role, content);

    try {
        await dbFirestore.collection(COLLECTION_NAME).add({
            user_id: userId,
            role: role,
            content: content,
            timestamp: new Date(),
        });
    } catch (error) {
        // Si Firestore falla, encolar para reintento posterior
        console.warn("[Memory] Firestore no disponible. Encolando para sync posterior...");
        enqueueSyncMessage(userId, role, content);
    }
}

export async function getMessages(userId: number, limitCount: number = 50): Promise<MessageRow[]> {
    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME)
            .where('user_id', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(limitCount)
            .get();

        if (snapshot.empty) return getLocal(userId, limitCount);

        const messages: any[] = [];
        snapshot.forEach((doc: any) => {
            const data = doc.data();
            messages.push({ ...data, id: doc.id });
        });

        return messages.reverse();
    } catch (error) {
        console.warn("[Memory] Usando base de datos local.");
        return getLocal(userId, limitCount);
    }
}

export async function clearMessages(userId: number) {
    const { clearMessages: clearLocal } = await import("./db.js");
    clearLocal(userId);

    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME).where('user_id', '==', userId).get();
        const batch = dbFirestore.batch();
        snapshot.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
    } catch (error) {
        console.error("[Memory] Error limpiando Firestore.");
    }
}

import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Embeddings: soporta API Key o Service Account ───────────────────────────
const googleApiKey = process.env.GOOGLE_API_KEY || "";
const googleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

const genAI = googleApiKey ? new GoogleGenerativeAI(googleApiKey) : null;
const embeddingModel = genAI ? genAI.getGenerativeModel({ model: "text-embedding-004" }) : null;

if (!googleApiKey && !googleCredentials) {
    console.warn("[Memory] Ni GOOGLE_API_KEY ni GOOGLE_APPLICATION_CREDENTIALS configurados — embeddings semánticos desactivados.");
} else if (!googleApiKey && googleCredentials) {
    console.log("[Memory] Usando GOOGLE_APPLICATION_CREDENTIALS para embeddings semánticos.");
}

/**
 * Helper unificado para obtener un vector de embedding.
 * Soporta: GOOGLE_API_KEY (SDK) y GOOGLE_APPLICATION_CREDENTIALS (REST + OAuth2).
 */
async function getEmbedding(text: string): Promise<number[] | null> {
    // Opción 1: SDK con API Key (rápido, caché en módulo)
    if (embeddingModel) {
        const result = await embeddingModel.embedContent(text);
        return result.embedding.values;
    }

    // Opción 2: REST API con Service Account (GOOGLE_APPLICATION_CREDENTIALS)
    if (googleCredentials) {
        try {
            const { GoogleAuth } = await import('google-auth-library');
            const auth = new GoogleAuth({
                keyFilename: googleCredentials,
                scopes: ['https://www.googleapis.com/auth/generative-language'],
            });
            const token = await auth.getAccessToken();
            if (!token) return null;

            const resp = await fetch(
                'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'models/text-embedding-004',
                        content: { parts: [{ text }] },
                    }),
                }
            );
            const data = await resp.json() as any;
            return data?.embedding?.values ?? null;
        } catch (e: any) {
            console.warn('[Memory] Error obteniendo embedding via service account:', e.message);
        }
    }

    return null;
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persistencia de Trazas de Aprendizaje (LeJEPA / Self-Improving)
 */
export async function saveTrace(userId: number, traceData: {
    category: string;
    user_message: string;
    thought_process: string[];
    tool_calls: any[];
    results: string[];
    model_index: number;
    success: boolean;
}) {
    try {
        // Generar embedding para búsqueda semántica (LeJEPA)
        let vector = null;
        if (googleApiKey || googleCredentials) {
            try {
                vector = await getEmbedding(traceData.user_message);
            } catch (e) {}
        }

        await dbFirestore.collection('traces').add({
            user_id: userId,
            ...traceData,
            embedding: vector,
            timestamp: new Date(),
        });
    } catch (error) {
        console.warn("[Memory] Error al guardar traza semántica.");
    }
}

/**
 * Búsqueda de Memoria Semántica (LeJEPA) con Cosine Similarity real.
 * Si GOOGLE_API_KEY no está disponible, hace fallback a búsqueda por categoría.
 */
export async function getSemanticContext(userId: number, query: string, category: string) {
    try {
        // Recuperar trazas exitosas de la misma categoría
        const snapshot = await dbFirestore.collection('traces')
            .where('user_id', '==', userId)
            .where('category', '==', category)
            .where('success', '==', true)
            .limit(10)
            .get();

        if (snapshot.empty) return "";

        // Si tenemos soporte de embeddings, hacer búsqueda vectorial real
        if (googleApiKey || googleCredentials) {
            try {
                const queryVector = await getEmbedding(query);
                if (!queryVector) throw new Error('No vector');

                // Calcular cosine similarity con cada traza
                const scored = snapshot.docs
                    .map(doc => {
                        const d = doc.data();
                        const traceVector: number[] = d.embedding;
                        if (!traceVector || traceVector.length === 0) return null;

                        // Cosine similarity = dot(A,B) / (||A|| * ||B||)
                        const dot = queryVector.reduce((sum: number, v: number, i: number) => sum + v * traceVector[i], 0);
                        const normA = Math.sqrt(queryVector.reduce((sum: number, v: number) => sum + v * v, 0));
                        const normB = Math.sqrt(traceVector.reduce((sum: number, v: number) => sum + v * v, 0));
                        const similarity = dot / (normA * normB);

                        return { data: d, similarity };
                    })
                    .filter((x): x is { data: any; similarity: number } => x !== null && x.similarity > 0.75)
                    .sort((a, b) => b.similarity - a.similarity)
                    .slice(0, 2);

                return scored.map(({ data: d, similarity }) =>
                    `Ejemplo de éxito (similitud: ${(similarity * 100).toFixed(0)}%): User: "${d.user_message}" -> Pensó: "${d.thought_process[0]}" -> Resultado: "${d.results[0]}"`
                ).join('\n');
            } catch (embeddingErr) {
                console.warn('[Memory] Error en búsqueda vectorial, usando fallback por categoría.');
            }
        }

        // Fallback: devolver las 2 primeras trazas exitosas por categoría
        return snapshot.docs.slice(0, 2).map(doc => {
            const d = doc.data();
            return `Ejemplo de éxito: User: "${d.user_message}" -> Pensó: "${d.thought_process[0]}" -> Resultado: "${d.results[0]}"`;
        }).join('\n');
    } catch (e) {
        return "";
    }
}

/**
 * GESTIÓN DE ESTADO (User Strategy 2)
 */
export async function setGlobalState(userId: number, key: string, value: any) {
    try {
        await dbFirestore.collection('state').doc(userId.toString()).set({
            [key]: value,
            updatedAt: new Date()
        }, { merge: true });
    } catch (e) {
        console.warn("[State] No se pudo guardar estado global.");
    }
}

export async function getGlobalState(userId: number): Promise<any> {
    try {
        const doc = await dbFirestore.collection('state').doc(userId.toString()).get();
        return doc.exists ? doc.data() : {};
    } catch (e) {
        return {};
    }
}

/**
 * Recupera las sugerencias críticas generadas por el Auditor tras fallos pasados.
 */
export async function getPromptOptimizations(userId: number): Promise<string> {
    try {
        const doc = await dbFirestore.collection('prompt_optimizations').doc(userId.toString()).get();
        if (doc.exists) {
            const data = doc.data();
            return data?.last_suggestion ? `⚠️ REGLA CRÍTICA (Basada en fallos previos): ${data.last_suggestion}` : "";
        }
        return "";
    } catch (e) {
        return "";
    }
}

/**
 * Obtiene un resumen del estado de evolución (LeJEPA/Auditor)
 */
export async function getEvolutionSummary(userId: number) {
    try {
        const doc = await dbFirestore.collection('prompt_optimizations').doc(userId.toString()).get();
        
        // Contar trazas totales
        const traceSnapshot = await dbFirestore.collection('traces').where('user_id', '==', userId).get();
        const traceCount = traceSnapshot.size;
        
        // Contar éxitos
        const successSnapshot = await dbFirestore.collection('traces').where('user_id', '==', userId).where('success', '==', true).get();
        const successCount = successSnapshot.size;
        
        return {
            total_traces: traceCount,
            success_rate: traceCount > 0 ? ((successCount / traceCount) * 100).toFixed(1) : "0",
            last_rule: doc.exists ? doc.data()?.last_suggestion : "Ninguna aún"
        };
    } catch (e) {
        console.error("[Memory] Error en getEvolutionSummary:", e);
        return null;
    }
}

/**
 * GESTIÓN DE PERFIL DE USUARIO (Conocimiento a Largo Plazo)
 * Guarda hechos específicos sobre Rodolfo para personalizar la experiencia.
 */
export async function getUserProfile(userId: number): Promise<string[]> {
    try {
        const doc = await dbFirestore.collection('user_metadata').doc(userId.toString()).get();
        if (doc.exists) {
            return doc.data()?.facts || [];
        }
        return [];
    } catch (e) {
        console.warn("[Memory] No se pudo leer el perfil de usuario.");
        return [];
    }
}

export async function addFactToProfile(userId: number, fact: string) {
    try {
        await dbFirestore.collection('user_metadata').doc(userId.toString()).set({
            facts: FieldValue.arrayUnion(fact),
            lastUpdate: new Date()
        }, { merge: true });
    } catch (e) {
        console.error("[Memory] Error al guardar hecho en el perfil.");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND SYNC WORKER: Reintenta subir a Firestore los mensajes fallidos
// Se inicia automáticamente y corre cada 5 minutos.
// ─────────────────────────────────────────────────────────────────────────────
export function startSyncWorker() {
    const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
    const MAX_ATTEMPTS = 5;

    const runSync = async () => {
        const pending = getPendingSyncMessages();
        if (pending.length === 0) return;

        console.log(`[SyncWorker] Reintentando ${pending.length} mensaje(s) pendiente(s) hacia Firestore...`);
        let successCount = 0;

        for (const row of pending) {
            try {
                await dbFirestore.collection(COLLECTION_NAME).add({
                    user_id: row.user_id,
                    role: row.role,
                    content: row.content,
                    timestamp: new Date(row.failed_at),
                    synced_late: true,
                });
                deleteSyncMessage(row.id);
                successCount++;
            } catch (err) {
                incrementSyncAttempts(row.id);
                if (row.attempts + 1 >= MAX_ATTEMPTS) {
                    console.warn(`[SyncWorker] Mensaje ${row.id} descartado tras ${MAX_ATTEMPTS} intentos fallidos.`);
                    deleteSyncMessage(row.id);
                }
            }
        }

        if (successCount > 0) {
            console.log(`[SyncWorker] ✅ ${successCount}/${pending.length} mensajes sincronizados con Firestore.`);
        }
    };

    // Primera ejecución inmediata (por si hay pendientes del arranque anterior)
    setTimeout(runSync, 30_000);
    // Ejecuciones periódicas
    setInterval(runSync, INTERVAL_MS);
    console.log('[SyncWorker] Worker de sincronización iniciado (cada 5 min).');
}
