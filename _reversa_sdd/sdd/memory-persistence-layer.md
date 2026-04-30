# Memory Persistence Layer

## Visión Geral

La capa de memoria de Opengravity es un sistema híbrido que gestiona el historial de conversaciones, el perfil dinámico del usuario y el auto-aprendizaje semántico (LeJEPA). Utiliza una combinación de SQLite local para redundancia y Firestore en la nube para persistencia global y recuperación de vectores.

## Responsabilidades

- **Hybrid Sync**: Sincroniza mensajes y trazas entre el almacenamiento local y la nube de forma transparente.
- **Semantic Memory**: Almacena y recupera "trazas de éxito" mediante búsqueda vectorial (Embeddings) para actuar como ejemplos de aprendizaje.
- **User Profiling**: Mantiene un registro permanente de hechos y preferencias sobre el usuario ("Rodolfo").
- **Audit Logging**: Registra reglas críticas generadas por el Auditor tras fallos del sistema.

## Interface

- **Entrada**: Objetos `Message`, `TraceData`, `UserFact`.
- **Salida**: Listados de historial, resúmenes de evolución y contextos semánticos.
- **Tecnología**: Firebase Admin SDK, Better-SQLite3, Google AI SDK (Vectores).

## Regras de Negócio

- **Priorización de Éxito**: Solo las trazas marcadas como `success: true` se recuperan para el contexto semántico (LeJEPA). 🟢
- **Sincronización Fallback**: Si Firestore no está disponible, el sistema opera solo con SQLite local y marca los registros para sincronización posterior. 🔴 (Inferido como intención, implementación parcial).
- **Límite de Historial**: La recuperación de mensajes para el prompt está limitada a los últimos 5 turnos para optimizar TPM. 🟢
- **Long-term Fact Storage**: Los hechos guardados mediante `save_user_fact` no expiran y se inyectan siempre en el system prompt. 🟢

## Fluxo Principal

1. Se genera un nuevo mensaje o traza en el Agente.
2. `saveMessage` / `saveTrace` guardan el dato en SQLite local inmediatamente.
3. Se invoca la sincronización asíncrona hacia Firestore mediante el SDK de Admin.
4. Para la recuperación semántica, se genera un vector del mensaje actual mediante Gemini `text-embedding-004`.
5. Se realiza una búsqueda de similitud en la colección de trazas de éxito en Firestore.
6. Los resultados se inyectan en el prompt del Agente como "Memoria de Éxito".

## Fluxos Alternativos

- **Fallo de API de Embeddings:** El sistema ignora la búsqueda semántica y continúa con el historial estándar.
- **Auditoría de Fallos:** Cuando ocurre un error severo, se guarda una `AUDIT_RULE` que bloquea comportamientos erróneos futuros modificando los prompts dinámicos.

## Dependências

- **Firebase Firestore** — Persistencia en la nube.
- **SQLite** — Persistencia local resiliente.
- **Google Generative AI** — Generación de embeddings vectoriales.
- **Prisma/Kysely (Potencial)** — Se observa uso de raw SQL o wrappers simples para SQLite.

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confianza |
| :--- | :--- | :--- | :---: |
| Disponibilidad | Redundancia local + Cloud para operación offline parcial. | `src/memory/memoryManager.ts` | 🟡 |
| Performance | Búsqueda vectorial para recuperación de contexto relevante. | `src/memory/memoryManager.ts:165` | 🟢 |
| Escalabilidad | Uso de búsqueda semántica en lugar de historial infinito (ahorro de tokens). | `src/agent/loop.ts:49` | 🟢 |
| Integridad | Validación de esquemas mediante tipos de TypeScript estrictos. | `src/memory/types.ts` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado un nuevo hecho mencionado por el usuario ("Me gusta el café solo")
Cuando el agente ejecuta la herramienta `save_user_fact`
Entonces el hecho debe persistirse en Firestore y aparecer en todos los prompts de sistema futuros.

Dado que el agente resuelve exitosamente una tarea compleja
Cuando se ejecuta `saveTrace`
Entonces la traza debe vectorizarse y estar disponible para búsqueda semántica posterior.
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
| :--- | :--- | :--- |
| Almacenamiento de mensajes y perfil | Must | Base fundamental de la continuidad de la conversación. |
| Recuperación LeJEPA (Vectores) | Should | Mejora significativamente el razonamiento pero tiene fallback. |
| Auditoría de fallos | Should | Crítico para la estabilidad a largo plazo. |
| Sincronización local bidireccional | Could | Útil para resiliencia total pero la nube es la prioridad. |

## Rastreabilidade de Código

| Arquivo | Función / Clase | Cobertura |
| :--- | :--- | :---: |
| `src/memory/memoryManager.ts` | `saveMessage` | 🟢 |
| `src/memory/memoryManager.ts` | `getSemanticContext` | 🟢 |
| `src/memory/memoryManager.ts` | `addFactToProfile` | 🟢 |
