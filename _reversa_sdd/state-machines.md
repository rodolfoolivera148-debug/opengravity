# Máquinas de Estado — Opengravity

## Ciclo de Vida de una Petición (Agent Loop)

Este diagrama describe el estado lógico del agente mientras procesa un mensaje desde Telegram.

```mermaid
stateDiagram-v2
    [*] --> IDLE: Espera de mensaje
    IDLE --> ROUTING: Recibe texto de usuario
    ROUTING --> PLANNING: Categoría identificada (Context Load)
    
    state "REASONING LOOP (Max 12 iters)" as Loop {
        PLANNING --> THINKING: LLM genera respuesta
        THINKING --> TOOL_PENDING: Decisión de usar herramienta
        TOOL_PENDING --> SECURITY_CHECK: ¿Es sensible?
        
        SECURITY_CHECK --> CONFIRMATION_WAIT: SÍ (Inline Buttons)
        CONFIRMATION_WAIT --> TOOL_EXEC_LOCAL: Aprobado
        CONFIRMATION_WAIT --> TOOL_REJECTED: Denegado
        
        SECURITY_CHECK --> TOOL_EXEC_LOCAL: NO
        
        TOOL_EXEC_LOCAL --> EVALUATING: Resultado obtenido
        TOOL_REJECTED --> EVALUATING
        EVALUATING --> THINKING: Re-alimentar prompt
    }
    
    Loop --> SUCCESS: Tarea completada
    Loop --> AUDITING: Error Crítico / Límite alcanzado
    
    AUDITING --> IDLE: Regla generada
    SUCCESS --> IDLE: Respuesta enviada
```

## Estados de los Modelos (Model Visibility)

Gestionado por `ModelTracker`.

```mermaid
stateDiagram-v2
    [*] --> AVAILABLE
    AVAILABLE --> UNAVAILABLE: Error 429 / 401
    UNAVAILABLE --> WAITING: Marca de tiempo establecida
    WAITING --> AVAILABLE: Tiempo de espera cumplido / Reset manual
```
