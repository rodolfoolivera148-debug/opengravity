// src/agent/modelTracker.ts
import fs from 'fs';
import path from 'path';

interface ModelState {
    name: string;
    provider: string;
    available: boolean;
    retryAfter: number; // Timestamp en ms de cuándo vuelve a estar activo
    remainingRequests?: number;
    remainingTokens?: number;
}

const META_DIR = path.join(process.cwd(), '.opengravity');
if (!fs.existsSync(META_DIR)) fs.mkdirSync(META_DIR, { recursive: true });

const STATE_FILE = path.join(META_DIR, 'model_state.json');

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
     * Extrae un valor de cabecera de forma segura, ya sea un objeto Headers o un objeto plano.
     */
    private getHeader(headers: any, key: string): string | null {
        if (!headers) return null;
        if (typeof headers.get === 'function') {
            return headers.get(key);
        }
        // Fallback para objetos planos (OpenAI SDK a veces los devuelve así)
        return headers[key] || headers[key.toLowerCase()] || null;
    }

    /**
     * Procesa los headers de respuesta de Groq/OpenRouter para actualizar el estado.
     */
    updateFromHeaders(modelName: string, provider: string, headers: any, statusCode: number) {
        const now = Date.now();
        const state: ModelState = this.states[modelName] || {
            name: modelName,
            provider,
            available: true,
            retryAfter: 0
        };

        // 1. Manejo específico de Groq (X-RateLimit-*)
        if (provider === 'groq') {
            const remainingRequests = this.getHeader(headers, 'x-ratelimit-remaining-requests');
            const remainingTokens = this.getHeader(headers, 'x-ratelimit-remaining-tokens');
            const resetRequests = this.getHeader(headers, 'x-ratelimit-reset-requests'); // ej: "1.5s"
            
            if (remainingRequests) state.remainingRequests = parseInt(remainingRequests);
            if (remainingTokens) state.remainingTokens = parseInt(remainingTokens);

            // Si quedan pocos recursos, marcamos preventivamente como saturado por unos segundos
            if (state.remainingRequests === 0 || (state.remainingTokens && state.remainingTokens < 1000)) {
                state.available = false;
                const seconds = resetRequests ? parseFloat(resetRequests) : 60;
                state.retryAfter = now + (seconds * 1000);
            } else {
                state.available = true;
            }
        }

        // 2. Manejo de Error 429 (Too Many Requests) o errores de servidor (5xx)
        if (statusCode === 429) {
            state.available = false;
            const retryAfter = this.getHeader(headers, 'retry-after');
            let waitMs = 60 * 1000;

            if (retryAfter) {
                if (!isNaN(parseInt(retryAfter))) {
                    waitMs = parseInt(retryAfter) * 1000;
                } else {
                    waitMs = new Date(retryAfter).getTime() - now;
                }
            }
            state.retryAfter = now + waitMs;
            console.warn(`[ModelTracker] ⚠️ Modelo ${modelName} marcado como NO DISPONIBLE hasta ${new Date(state.retryAfter).toLocaleTimeString()}`);
        } else if (statusCode === 401 || statusCode === 403) {
            // Error de autenticación, la API Key no sirve o fue revocada. Bloqueo prolongado.
            state.available = false;
            state.retryAfter = now + (1000 * 60 * 60 * 24); // 24 horas
            console.warn(`[ModelTracker] ⛔ Modelo ${modelName} inhabilitado por fallo de Autenticación (${statusCode}).`);
        } else if (statusCode >= 500) {
            // Error de servidor o de proveedor, darle un respiro de 30s
            state.available = false;
            state.retryAfter = now + (30 * 1000);
            console.warn(`[ModelTracker] ⛔ Modelo ${modelName} inestable (${statusCode}). Descansando 30s.`);
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
            
            if (!state) return i; 
            if (state.available) return i;
            if (now > state.retryAfter) {
                state.available = true;
                return i;
            }
        }
        return 0; 
    }
}

export const modelTracker = new ModelTracker();
