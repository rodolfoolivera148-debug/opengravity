import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";

// Inicializar Firebase Admin SDK usando sub-módulos ESM
// Nota: Si GOOGLE_APPLICATION_CREDENTIALS está definido en el .env, 
// no es necesario pasar nada a initializeApp().
let adminApp;
if (getApps().length === 0) {
    adminApp = initializeApp({
        projectId: env.FIREBASE_PROJECT_ID,
    });
    console.log(`[Firebase] SDK inicializado para el proyecto: ${env.FIREBASE_PROJECT_ID}`);
} else {
    adminApp = getApp();
}

export const dbFirestore = getFirestore(adminApp);
export default adminApp;
