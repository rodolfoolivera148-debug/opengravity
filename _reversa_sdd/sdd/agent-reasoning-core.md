# Agent Reasoning Core

## Visión Geral

El núcleo de razonamiento de Opengravity es un motor de bucle cerrado que orquesta la inteligencia artificial para resolver tareas complejas mediante el uso dinámico de herramientas, gestión de contexto y auto-aprendizaje a partir de fallos.

## Responsabilidades

- **Routing Dinámico**: Clasifica la intención del usuario para cargar solo las herramientas necesarias.
- **Reasoning Loop**: Ejecuta hasta 12 iteraciones de pensamiento y acción para alcanzar un objetivo.
- **Context Budgeting**: Reduce y trunca el contexto automáticamente para evitar errores de límite de tokens (413).
- **Self-Healing**: Activa auditorías post-mortem tras fallos críticos para generar reglas de conducta futuras.
- **Trace Management**: Registra el proceso de pensamiento y los resultados para el entrenamiento semántico (LeJEPA).

## Interface

- **Entrada**: `userId (number)`, `userMessage (string)`.
- **Salida**: `Promise<string>` (Respuesta final del agente).
- **Formatos de datos**: Mensajes compatibles con OpenAI/Anthropic SDKs.

## Regras de Negócio

- **Máximo de Iteraciones**: El sistema se detiene tras 12 llamadas a herramientas para evitar bucles infinitos. 🟢
- **Modo Lite (413)**: Ante un error de contexto, se activa un modo reducido que trunca resultados a 500 caracteres y reduce el historial al último 30%. 🟢
- **Metodología de Superpoderes**: El agente debe seguir el proceso Brainstorming -> Planning -> Execution -> Verification. 🟢
- **Fallback de Modelos**: Si el modelo actual (Groq) falla o tiene rate limit, se escala al siguiente proveedor (OpenRouter). 🟢
- **Filtro de Herramientas**: Solo se exponen herramientas de la categoría ruteada más las esenciales (get_current_time). 🟡

## Fluxo Principal

1. Recibe mensaje del usuario.
2. Ejecuta Router para clasificar la categoría (FIREBASE, NEWS, etc.).
3. Recupera ejemplos de éxito (LeJEPA) y reglas del Auditor (Optimizations).
4. Inicia bucle de razonamiento.
5. El LLM decide si responder o llamar a una herramienta.
6. Si llama a una herramienta sensible, solicita confirmación humana.
7. Ejecuta la herramienta y procesa el resultado.
8. Repite hasta completar la tarea o agotar iteraciones.

## Fluxos Alternativos

- **Contexto demasiado grande (413):** Activa el flag `contextReduced`, reinicia el bucle con prompts "Lite" y datos truncados.
- **Error crítico de modelo:** Escala el `modelIndex` para usar un backup (OpenRouter) y reintenta el giro actual.
- **Límite de reflexión alcanzado:** Devuelve un mensaje de advertencia y dispara el Auditor de fallos.

## Dependências

- **LLM Providers (Groq/OpenRouter)** — Motores de inferencia.
- **Memory Manager** — Persistencia de historial, trazas y perfil de usuario.
- **Auditor** — Análisis de fallos.
- **Telegram Bot** — Interfaz de entrada/salida y validaciones.

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confianza |
| :--- | :--- | :--- | :---: |
| Performance | Truncado de resultados a 2000 chars (1000 en Lite). | `src/agent/loop.ts:13` | 🟢 |
| Seguridad | Validación de herramientas sensibles antes de ejecutar. | `src/agent/loop.ts:219` | 🟢 |
| Resiliencia | Fallback automático entre 4 proveedores de modelos. | `src/agent/llm.ts:16` | 🟢 |
| Disponibilidad | Modo de arranque no bloqueante para cloud health checks. | `src/agent/loop.ts` (implícito) | 🟡 |

## Critérios de Aceitação

```gherkin
Dado que el usuario solicita una tarea compleja (ej: resumen de noticias)
Cuando el agente clasifica la tarea como "NEWS"
Entonces debe cargar solo herramientas de TrendRadar y ejecutar el loop hasta obtener resultados.

Dado que ocurre un error 413 (Payload Too Large)
Cuando el sistema captura la excepción
Entonces debe reintentar la tarea automáticamente en Modo Lite reduciendo el historial.
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
| :--- | :--- | :--- |
| Agent Loop (Think/Act) | Must | Funcionalidad core del sistema. |
| Context Budgeting (413 Fix) | Must | Crítico para la operación en Groq (capa gratuita). |
| Routing de herramientas | Should | Optimiza el uso de tokens pero podría operar con todo el set en modelos grandes. |
| Auditoría post-mortem | Should | Mejora el sistema pero no impide su ejecución inmediata. |
| Recuperación LeJEPA | Could | Mejora la calidad de respuesta pero el bot funciona sin ella. |

## Rastreabilidade de Código

| Arquivo | Função / Clase | Cobertura |
| :--- | :--- | :---: |
| `src/agent/loop.ts` | `runAgentLoop` | 🟢 |
| `src/agent/llm.ts` | `getLLMResponse` | 🟢 |
| `src/agent/auditor.ts` | `runFailureAudit` | 🟢 |
