// src/memory/memoryManager.ts
import { dbFirestore } from "../config/firebase.js";
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
