# Preguntas de Validación — Opengravity

Hola Rodolfo. Tras revisar las especificaciones contra el código fuente, he encontrado algunos puntos donde el comportamiento implementado difiere de lo que parece ser la intención original del diseño.

Por favor, aclara los siguientes puntos para finalizar el reporte de confianza:

## 🔴 Críticos (Bloquean paridad funcional)

### 1. Búsqueda Vectorial vs Categorías
En `memoryManager.ts`, el sistema genera embeddings de Google (`text-embedding-004`) al guardar trazas, pero al recuperarlas en `getSemanticContext` se realiza una consulta de Firestore filtrando solo por la cadena `category`. 
- **Pregunta**: ¿La búsqueda vectorial es una funcionalidad planeada pero no terminada, o existe algún otro módulo que realice la comparación de vectores (`cosine similarity`) que no haya detectado?

### 2. Estado de OpengravityApp
El directorio `OpengravityApp` contiene solo la estructura básica de una app de React Native (v0.76). No hay lógica de comunicación con el Agente ni interfaz de usuario funcional.
- **Pregunta**: ¿Este repositorio es solo para el Backend/Agente y la App se desarrolla en otro lugar, o quieres que documente la App simplemente como un placeholder?

## 🟡 Moderados (Impacto en la experiencia)

### 3. Sincronización Local (SQLite -> Firestore)
El componente de memoria guarda en SQLite y luego intenta enviar a Firestore. Si esto falla (ej: sin internet), la traza se queda solo en local y no parece haber un proceso de "re-intento" o "background sync" posterior.
- **Pregunta**: ¿Es aceptable que los datos no sincronizados se queden solo en el dispositivo origen, o debería existir un worker de sincronización?

### 4. Capacidad de TrendRadar
He detectado la herramienta `trigger_crawl`. 
- **Pregunta**: ¿El agente tiene permiso para disparar esta herramienta de forma autónoma ante cualquier duda, o está restringida a ciertos comandos de mantenimiento?

---
> **Instrucciones**: Responde aquí mismo o en el chat para que pueda actualizar las especificaciones finales.
