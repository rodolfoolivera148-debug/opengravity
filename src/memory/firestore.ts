import { dbFirestore } from "../config/firebase.js";

// Estructura de mensaje similar a la SQLite
export interface MessageRow {
    id?: string; // En Firestore usamos ID de documento
    user_id: number;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: any; // Firestore Timestamp
}

const COLLECTION_NAME = 'messages';

export async function saveMessage(userId: number, role: 'system' | 'user' | 'assistant' | 'tool', content: string) {
    try {
        await dbFirestore.collection(COLLECTION_NAME).add({
            user_id: userId,
            role: role,
            content: content,
            timestamp: new Date(), // Usamos Date de JS que Firebase convierte a Timestamp
        });
    } catch (error) {
        console.error("[Firestore] Error al guardar mensaje:", error);
    }
}

export async function getMessages(userId: number, limitCount: number = 50): Promise<MessageRow[]> {
    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME)
            .where('user_id', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(limitCount)
            .get();

        const messages: MessageRow[] = [];
        snapshot.forEach(doc => {
            const data = doc.data() as MessageRow;
            messages.push({ ...data, id: doc.id });
        });

        // Devolvemos invertido para que el historial fluya cronológicamente al LLM
        return messages.reverse();
    } catch (error) {
        console.error("[Firestore] Error al obtener mensajes:", error);
        return [];
    }
}

export async function clearMessages(userId: number) {
    try {
        const snapshot = await dbFirestore.collection(COLLECTION_NAME)
            .where('user_id', '==', userId)
            .get();

        const batch = dbFirestore.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    } catch (error) {
        console.error("[Firestore] Error al limpiar mensajes:", error);
    }
}
