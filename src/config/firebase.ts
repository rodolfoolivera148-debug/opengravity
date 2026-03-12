import admin from "firebase-admin";
import { env } from "./env.js";

// Inicializar Firebase Admin SDK
// Nota: Si GOOGLE_APPLICATION_CREDENTIALS está definido en el .env, 
// no es necesario pasar nada a cert().
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: env.FIREBASE_PROJECT_ID,
    });
    console.log(`[Firebase] SDK inicializado para el proyecto: ${env.FIREBASE_PROJECT_ID}`);
}

export const dbFirestore = admin.firestore();
export default admin;
