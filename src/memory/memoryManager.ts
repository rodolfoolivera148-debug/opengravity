// src/memory/memoryManager.ts
import fs from "fs";
import path from "path";
import { dbFirestore } from "../config/firebase.js";
import { saveMessage as saveLocal, getMessages as getLocal, MessageRow } from "./db.js";

const COLLECTION_NAME = 'messages';

/**
 * Sistema de memoria híbrido: Cloud (Firestore) con fallback Local (SQLite).
 */
export async function saveMessage(userId: number, role: 'system' | 'user' | 'assistant' | 'tool', content: string) {
    // Siempre guardamos localmente primero para asegurar persistencia offline
    saveLocal(userId, role, content);

    // Intentamos subirlo a la nube (Firestore)
    try {
        await dbFirestore.collection(COLLECTION_NAME).add({
            user_id: userId,
            role: role,
            content: content,
            timestamp: new Date(),
        });
    } catch (error) {
        console.warn("[Memory] No se pudo sincronizar con Firestore, usando modo local.");
    }
}

export async function getMessages(userId: number, limitCount: number = 50): Promise<MessageRow[]> {
    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME)
            .where('user_id', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(limitCount)
            .get();

        if (snapshot.empty) {
            return getLocal(userId, limitCount);
        }

        const messages: any[] = [];
        snapshot.forEach((doc: any) => {
            const data = doc.data();
            messages.push({ ...data, id: doc.id });
        });

        return messages.reverse();
    } catch (error) {
        console.warn("[Memory] Error Firestore, recuperando de base de datos local.");
        return getLocal(userId, limitCount);
    }
}

export async function clearMessages(userId: number) {
    // Limpiar ambos
    const { clearMessages: clearLocal } = await import("./db.js");
    clearLocal(userId);

    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME)
            .where('user_id', '==', userId)
            .get();

        const batch = dbFirestore.batch();
        snapshot.forEach((doc: any) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    } catch (error) {
        console.error("[Memory] Error limpiando Firestore:", error);
    }
} interface ModelState {
    name: string;
    provider: string;
    available: boolean;
    retryAfter: number; // Timestamp en ms de cuándo vuelve a estar activo
    remainingRequests?: number;
    remainingTokens?: number;
}
const STATE_FILE = path.join(process.cwd(), 'model_state.json');
class ModelTracker {
    private states: Record<string, ModelState> = {};

    constructor() {
        this.loadState();
    }

    private loadState() {
        if (fs.existsSync(STATE_FILE)) {
            try {
                this.states = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            } catch (e) {
                this.states = {};
            }
        }
    }

    private saveState() {
        fs.writeFileSync(STATE_FILE, JSON.stringify(this.states, null, 2));
    }

    /**
     * Procesa los headers de respuesta de Groq/OpenRouter para actualizar el estado.
     */
    updateFromHeaders(modelName: string, provider: string, headers: Headers, statusCode: number) {
        const now = Date.now();
        const state: ModelState = this.states[modelName] || {
            name: modelName,
            provider,
            available: true,
            retryAfter: 0
        };

        // 1. Manejo específico de Groq (X-RateLimit-*)
        if (provider === 'groq') {
            const remainingRequests = headers.get('x-ratelimit-remaining-requests');
            const remainingTokens = headers.get('x-ratelimit-remaining-tokens');
            const resetRequests = headers.get('x-ratelimit-reset-requests'); // ej: "1.5s"

            if (remainingRequests) state.remainingRequests = parseInt(remainingRequests);
            if (remainingTokens) state.remainingTokens = parseInt(remainingTokens);

            // Si quedan pocos recursos, marcamos preventivamente como saturado por unos segundos
            if (state.remainingRequests === 0 || state.remainingTokens && state.remainingTokens < 1000) {
                state.available = false;
                const seconds = resetRequests ? parseFloat(resetRequests) : 60;
                state.retryAfter = now + (seconds * 1000);
            } else {
                state.available = true;
            }
        }

        // 2. Manejo de Error 429 (Too Many Requests)
        if (statusCode === 429) {
            state.available = false;
            const retryAfter = headers.get('retry-after'); // Segundos o fecha
            let waitMs = 60 * 1000; // 1 minuto por defecto

            if (retryAfter) {
                if (!isNaN(parseInt(retryAfter))) {
                    waitMs = parseInt(retryAfter) * 1000;
                } else {
                    waitMs = new Date(retryAfter).getTime() - now;
                }
            }
            state.retryAfter = now + waitMs;
            console.warn(`[ModelTracker] ⚠️ Modelo ${modelName} marcado como NO DISPONIBLE hasta ${new Date(state.retryAfter).toLocaleTimeString()}`);
        } else if (statusCode >= 200 && statusCode < 300) {
            // Si la petición fue exitosa y no hay bloqueo de headers, asegurar disponibilidad
            if (now > state.retryAfter) {
                state.available = true;
            }
        }

        this.states[modelName] = state;
        this.saveState();
    }

    /**
     * Retorna el primer modelo de la lista que esté disponible.
     */
    getBestAvailableModelIndex(models: any[]): number {
        const now = Date.now();
        for (let i = 0; i < models.length; i++) {
            const m = models[i];
            const state = this.states[m.model];

            if (!state) return i; // No tenemos datos, asumimos disponible
            if (state.available) return i;
            if (now > state.retryAfter) {
                state.available = true;
                return i;
            }
        }
        return 0; // Si todos están muertos, devolver el primero y que falle con honor
    }
}

export const modelTracker = new ModelTracker();

