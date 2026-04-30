# Reasoning Loop — Detalle de Funcionamiento

Este diagrama detalla la lógica de `src/agent/loop.ts`, incluyendo la recuperación de errores 413 y la estrategia de memoria exitosa.

```mermaid
flowchart TD
    Start([Inicio runAgentLoop]) --> SaveMsg[Guardar mensaje usuario]
    SaveMsg --> GetState[Cargar Estado Global y Perfil]
    
    subgraph RoutingPhase [Fase de Enrutamiento]
        GetState --> RouterLLM[Llamada a Router LLM]
        RouterLLM --> Classify[Clasificar categoría: NEWS, FIREBASE, etc.]
    end
    
    subgraph ContextPrep [Preparación de Memoria]
        Classify --> GetSuccess[Recuperar Memoria de Éxito - Traces]
        GetSuccess --> GetRules[Recuperar Reglas del Auditor]
        GetRules --> Superpowers[Injectar Superpowers y SKILL.md]
    end
    
    ContextPrep --> LoopStart{Bucle de Herramientas < 12}
    
    subgraph LLMInteraction [Interacción LLM]
        LoopStart --> ToolFilter[Filtrar herramientas por categoría]
        ToolFilter --> LLMCall[Llamada al LLM]
        LLMCall -- Error 413 --> ContextRed{¿Modo Lite?}
        ContextRed -- No --> ReduceHist[Reducir Historial y Truncar]
        ReduceHist --> ToolFilter
        ContextRed -- Sí --> Error([Error Crítico])
        
        LLMCall -- Éxito --> CheckTC{¿Llamada a herramienta?}
    end
    
    CheckTC -- No --> FinalResp[Guardar Respuesta y Trace Éxito]
    FinalResp --> End([Fin])
    
    CheckTC -- Sí --> Confirms{¿Es sensible?}
    Confirms -- Sí --> AskUser[Solicitar confirmación Telegram]
    AskUser -- Rechazado --> ToolRes[Resultado: Acción rechazada]
    AskUser -- Aceptado --> ExecTool[Ejecutar executeTool]
    
    Confirms -- No --> ExecTool
    ExecTool --> ToolRes
    ToolRes --> LoopStart
    
    LoopStart -- Limite alcanzado --> LimitMsg[Msj: Límite alcanzado]
    LimitMsg --> End
```

### Lógica de Autocorrección de Contexto (413)
Cuando el sistema recibe un error `Request Too Large`:
1. El flag `contextReduced` se activa en `true`.
2. El sistema mantiene solo los últimos 2-3 turnos de conversación.
3. Se aplica un truncamiento agresivo (500 caracteres) a cualquier salida de herramienta previa que esté en el historial.
4. Se cambia el System Prompt al `LITE_SYSTEM_PROMPT`.
5. Se reintenta la llamada sin cambiar el modelo.
