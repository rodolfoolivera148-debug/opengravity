// src/memory/memoryManager.ts
import { dbFirestore } from "../config/firebase.js";
import { FieldValue } from "firebase-admin/firestore";
import { env } from "../config/env.js";
import { saveMessage as saveLocal, getMessages as getLocal, MessageRow } from "./db.js";

const COLLECTION_NAME = 'messages';

/**
 * Sistema de memoria híbrido: Cloud (Firestore) con fallback Local (SQLite).
 */
export async function saveMessage(userId: number, role: 'system' | 'user' | 'assistant' | 'tool', content: string) {
    saveLocal(userId, role, content);

    try {
        await dbFirestore.collection(COLLECTION_NAME).add({
            user_id: userId,
            role: role,
            content: content,
            timestamp: new Date(),
        });
    } catch (error) {
        console.warn("[Memory] No se pudo sincronizar con Firestore.");
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

const genAI = new GoogleGenerativeAI(env.OPENROUTER_API_KEY || ""); // Usando la misma key
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

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
        try {
            const result = await embeddingModel.embedContent(traceData.user_message);
            vector = result.embedding.values;
        } catch (e) {}

        await dbFirestore.collection('traces').add({
            user_id: userId,
            ...traceData,
            embedding: vector ? FieldValue.vector(vector) : null,
            timestamp: new Date(),
        });
    } catch (error) {
        console.warn("[Memory] Error al guardar traza semántica.");
    }
}

/**
 * Búsqueda de Memoria Semántica (LeJEPA inspired)
 */
export async function getSemanticContext(userId: number, query: string, category: string) {
    try {
        // Primero intentamos por categoría (fallback rápido)
        const snapshot = await dbFirestore.collection('traces')
            .where('user_id', '==', userId)
            .where('category', '==', category)
            .where('success', '==', true)
            .limit(2)
            .get();

        return snapshot.docs.map(doc => {
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
