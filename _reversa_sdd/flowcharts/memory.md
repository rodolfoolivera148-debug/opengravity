# Diagramas de Flujo — Módulo `memory`

## Flujo de Guardado Híbrido

Este flujo describe cómo se asegura la redundancia de los mensajes del bot.

```mermaid
graph TD
    Trigger([Llamada a saveMessage]) --> SQLite[Insertar en better-sqlite3]
    SQLite --> Firestore[Añadir a Colección 'messages' en Firestore]
    Firestore -- Éxito --> End([Fin])
    Firestore -- Error de Red --> Log[Warn: No sincronizado]
    Log --> End
```

## Memoria Semántica y LeJEPA

Cómo el agente recupera ejemplos de éxito para guiar su razonamiento.

```mermaid
sequenceDiagram
    participant Agent as Agente Core
    participant Mem as Memory Manager
    participant Fire as Firestore (traces)
    participant Gemini as Google AI (Embeddings)

    Agent->>Mem: getSemanticContext(userId, query, category)
    
    rect rgb(240, 240, 240)
        Note over Mem, Gemini: Si hay API Key de Google
        Mem->>Gemini: embedContent(query)
        Gemini-->>Mem: Vector del Mensaje
    end

    Mem->>Fire: Query (category, success=true, limit=2)
    Note right of Fire: Búsqueda por categoría + éxito
    Fire-->>Mem: Lista de Trazas (Snapshot)
    
    Mem->>Mem: Formatear Ejemplos (Role: User -> Role: Thought)
    Mem-->>Agent: Retornar String de Contexto
```
