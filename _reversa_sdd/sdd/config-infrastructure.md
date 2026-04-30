# Config & Infrastructure

## Visión Geral

El componente de configuración e infraestructura es el cimiento de seguridad y estabilidad de Opengravity. Se encarga de la validación estricta del entorno mediante esquemas, la carga segura de credenciales de Firebase en entornos PaaS (Render) y la gestión dinámica del estado de los proveedores de IA.

## Responsabilidades

- **Env Validation**: Garantiza que todas las variables de entorno necesarias existan y cumplan con el formato requerido al arranque (Fail-fast).
- **Credential Injection**: Permite la inicialización de Firebase Admin SDK mediante un string JSON inyectado, evitando el uso de archivos `.json` físicos en disco.
- **Model State Management**: Rastrea la disponibilidad y errores de los proveedores de LLM de forma persistente.
- **Prompt Registry**: Centraliza las plantillas de prompts del sistema para facilitar el ruteo y la optimización.

## Interface

- **Entrada**: Variables de entorno (`process.env`), archivos de configuración (`.firebaserc`, `model_state.json`).
- **Salida**: Objetos de configuración tipados, instancias inicializadas de Firebase y ModelTracker.
- **Tecnología**: Zod (Validación), Firebase Admin SDK, TypeScript.

## Regras de Negócio

- **Validación Estricta con Zod**: El sistema no arranca si falta alguna variable crítica (ej: `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`). 🟢
- **Auto-Transformación de IDs**: Las variables de ID de usuario (string en env) se transforman automáticamente a arreglos numéricos para su uso en los middlewares del bot. 🟢
- **Resiliencia de Firebase**: Si falla la carga de credenciales JSON, el sistema intenta buscar un archivo físico de respaldo (`service-account.json`). 🟢
- **Persistencia de Errores de Modelo**: Un error de autenticación (401) bloquea un modelo temporalmente en `model_state.json` hasta un reset manual o timeout. 🟢

## Fluxo Principal

1. Se invoca el script de inicio (`npm start`).
2. `src/config/env.ts` analiza las variables de entorno mediante un esquema Zod.
3. Si la validación falla, se loguea el error y el proceso termina (Fail-fast).
4. `src/config/firebase.ts` inicializa el SDK usando el JSON de la variable `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Se inicializa el `ModelTracker` cargando el último estado conocido de disponibilidad de modelos.
6. El sistema queda listo para recibir tráfico de Telegram.

## Fluxos Alternativos

- **Variables mal formateadas:** El schema de Zod lanza excepciones descriptivas indicando exactamente qué variable falla y por qué (ej: "URL inválida").
- **Despliegue en Nube (Cloud mode):** El sistema detecta si está en modo producción para silenciar ciertos logs o activar webhooks en lugar de polling.

## Dependências

- **Zod** — Esquema y validación de tipos.
- **Firebase Admin SDK** — Conexión con la infraestructura de Google.
- **dotenv** — Carga de variables locales.

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confianza |
| :--- | :--- | :--- | :---: |
| Seguridad | No dependencia de archivos JSON físicos para secretos en producción. | `src/config/firebase.ts:15` | 🟢 |
| Estabilidad | Validación de entorno al arranque evita errores en tiempo de ejecución. | `src/config/env.ts` | 🟢 |
| Observabilidad | Logs claros ante fallos de configuración. | `src/config/env.ts:25` | 🟢 |
| Flexibilidad | Soporte para múltiples esquemas de ruteo de prompts. | `src/config/prompts.ts` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que falta la variable `TELEGRAM_BOT_TOKEN`
Cuando se intenta iniciar el servidor
Entonces el proceso debe terminar inmediatamente con un error de validación de Zod.

Dado que las credenciales de Firebase se pasan como un string JSON en `FIREBASE_SERVICE_ACCOUNT_JSON`
Cuando se inicializa el componente
Entonces el sistema debe parsear el JSON y conectar exitosamente con Firestore.
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
| :--- | :--- | :--- |
| Validación de variables críticas | Must | Evita comportamientos erráticos o caídas en runtime. |
| Gestión de credenciales inyectadas | Must | Necesario para despliegues seguros en PaaS como Render. |
| Model Tracking | Should | Mejora la experiencia evitando modelos caídos, pero no es crítico para el arranque. |
| Registro centralizado de prompts | Should | Mejora el mantenimiento de la personalidad del bot. |

## Rastreabilidade de Código

| Arquivo | Función / Clase | Cobertura |
| :--- | :--- | :---: |
| `src/config/env.ts` | `envSchema.parse` | 🟢 |
| `src/config/firebase.ts` | `admin.initializeApp` | 🟢 |
| `src/agent/modelTracker.ts` | `ModelTracker` | 🟢 |
