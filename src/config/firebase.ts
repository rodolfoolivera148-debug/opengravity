import { initializeApp, getApps, getApp, getCert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";

// Inicializar Firebase Admin SDK usando sub-módulos ESM
let adminApp;

if (getApps().length === 0) {
    const options: any = {
        projectId: env.FIREBASE_PROJECT_ID,
    };

    // Si pasamos el JSON entero por variable de entorno (Render/GCP)
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
            const cert = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
            options.credential = getCert(cert);
            console.log("[Firebase] Usando credenciales de variable de entorno.");
        } catch (e) {
            console.error("[Firebase] Error parseando FIREBASE_SERVICE_ACCOUNT_JSON:", e);
        }
    }

    adminApp = initializeApp(options);
    console.log(`[Firebase] SDK inicializado para el proyecto: ${env.FIREBASE_PROJECT_ID}`);
} else {
    adminApp = getApp();
}

export const dbFirestore = getFirestore(adminApp);
export default adminApp;
