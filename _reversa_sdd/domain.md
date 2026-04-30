# Reglas de Dominio y Glosario — Opengravity

## Glosario de Términos

- **Reasoning Loop**: Ciclo de pensamiento recursivo donde el agente decide qué herramientas usar hasta completar la tarea o alcanzar el límite (12 iteraciones).
- **LeJEPA (Memory of Success)**: Inspirado en la arquitectura JEPA, es el sistema de recuperación semántica que inyecta trazas exitosas pasadas como ejemplos de "pocos disparos" (few-shot).
- **Auditor**: Agente post-mortem que analiza fallas críticas y genera "Optimización de Prompts" persistentes.
- **Superpoderes**: Conjunto de herramientas de nivel de sistema (FileSystem, Terminal) que permiten al agente modificar su propio entorno.
- **Context Budgeting**: Estrategia de gestión de tokens que trunca resultados de herramientas y reduce el historial dinámicamente para evitar el error 413.

## Reglas de Negocio Implícitas

### 1. Prioridad de Seguridad (Human-in-the-loop)

🟢 **CONFIRMADO**

Cualquier acción que pueda alterar el estado del sistema o archivos (`write_file`, `execute_terminal_command`, `firestore-delete`) **DEBE** ser confirmada mediante botones inline en Telegram. El hilo de ejecución del agente se suspende asincrónicamente mediante un mapa de promesas.

### 2. Clasificación Obligatoria (Routing)

🟢 **CONFIRMADO**

Antes de procesar cualquier mensaje, el sistema lo clasifica en una categoría (FIREBASE, NEWS, WORKSPACE, etc.). Esto no es solo para el prompt; decide qué definiciones de herramientas se cargan para ahorrar tokens (Context-Aware Loading).

### 3. Evolución Continua

🟡 **INFERIDO**

El sistema asume que el usuario ("Rodolfo") es el dueño y objeto del aprendizaje. Los hechos guardados en el perfil de usuario tienen prioridad sobre el historial corto de la conversación.

### 4. Resiliencia de Modelos

🟢 **CONFIRMADO**

Si un proveedor (ej: Groq) devuelve un error 429 (Rate Limit) o falla la autenticación, el `ModelTracker` lo marca como fallido temporalmente y escala la petición al siguiente modelo en la lista de fallback (ej: OpenRouter).
