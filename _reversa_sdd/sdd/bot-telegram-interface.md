# Bot Telegram Interface

## Visión Geral

La interfaz de Telegram actúa como el puente de comunicación entre Rodolfo y el Agente. No es solo un sistema de mensajería, sino un controlador de seguridad interactivo que permite el ruteo de webhooks y la validación de acciones sensibles en tiempo real.

## Responsabilidades

- **Session Management**: Identifica y valida a los usuarios mediante una lista blanca de IDs.
- **Interactive Security**: Gestiona promesas de aprobación para suspender/reanudar la ejecución de herramientas sensibles.
- **Robust Messaging**: Maneja el envío de mensajes largos mediante truncado inteligente o adjuntos de archivos `.txt`.
- **Chat Actions**: Muestra estados visuales (ej: "typing") para mejorar la experiencia de usuario durante procesos de razonamiento largos.
- **Status Reporting**: Provee diagnósticos del sistema y resumen de evolución mediante comandos específicos (`/status`, `/api`).

## Interface

- **Entrada**: Webhooks de Telegram Bot API (objeto `Update`).
- **Salida**: Mensajes de texto, archivos de documento (InputFile) y teclados inline.
- **Protocolo**: HTTPS / JSON.

## Regras de Negócio

- **Whitelist Estricta**: Solo los usuarios en `TELEGRAM_ALLOWED_USER_IDS` pueden interactuar con el bot. 🟢
- **No-Blocking Event Loop**: El bot procesa mensajes de texto de forma asíncrona para no bloquear la recepción de confirmaciones (clics en botones) mientras el agente piensa. 🟢
- **Límite de Longitud**: Mensajes > 3800 caracteres se envían como archivo adjunto para evitar errores de la API de Telegram. 🟢
- **Persistencia de Confirmaciones**: Los resolutores de aprobación se mantienen en un `Map` en memoria volátil; un reinicio del bot cancela las confirmaciones pendientes. 🟡

## Fluxo Principal

1. Telegram envía Webhook al endpoint configurado.
2. El middleware verifica el `userId` contra la lista blanca.
3. El manejador de mensajes muestra "typing" e invoca a `runAgentLoop`.
4. Si el agente requiere aprobación, el bot envía un mensaje con botones "Aprobar" / "Rechazar".
5. El bot registra el `resolve` de la promesa en un mapa global.
6. El usuario pulsa un botón; el manejador de `callback_query` recupera y ejecuta el `resolve`.
7. El agente recibe la respuesta y continúa su ejecución.

## Fluxos Alternativos

- **Usuario no autorizado:** El middleware ignora la actualización silenciosamente.
- **Fallo en el loop del agente:** Captura el error y envía un mensaje de aviso "❌ Error al procesar tu mensaje".
- **Comando /reset:** Llama al `ModelTracker` para desbloquear proveedores de LLM que fallaron previamente.

## Dependências

- **grammY** — Framework de Telegram Bot.
- **Agent Reasoning Core** — Ejecuta la lógica central.
- **Memory Manager** — Recupera el resumen de evolución del usuario.
- **Model Tracker** — Resetea estados de APIs.

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confianza |
| :--- | :--- | :--- | :---: |
| Performance | Respuesta inmediata del bot (typing action) antes del razonamiento. | `src/bot/telegram.ts:107` | 🟢 |
| Seguridad | Validación de tokens y IDs en middleware centralizado. | `src/bot/telegram.ts:101` | 🟢 |
| UX | Truncado automático y envío de archivos para resultados masivos. | `src/bot/telegram.ts:86` | 🟢 |
| Resiliencia | Manejo de reintentos en envío de mensajes largos. | `src/bot/telegram.ts:94` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que un usuario autorizado envía un comando /status
Cuando el bot recibe la petición
Entonces debe recuperar los datos de evolución y responder con un mensaje formateado en Markdown.

Dado que el agente intenta ejecutar un comando terminal
Cuando se requiere aprobación
Entonces el bot debe mostrar botones inline e impedir la ejecución hasta recibir el clic del usuario.
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
| :--- | :--- | :--- |
| Recepción de Webhooks | Must | Punto de entrada único del sistema. |
| Gestión de validaciones interactivas | Must | Crítico para el funcionamiento de los Superpoderes seguros. |
| Envío robusto de mensajes | Should | Evita fallos en la comunicación de respuestas largas. |
| Comandos de diagnóstico (/api, /status) | Should | Útil para mantenimiento y visibilidad del usuario. |

## Rastreabilidade de Código

| Arquivo | Función / Clase | Cobertura |
| :--- | :--- | :---: |
| `src/bot/telegram.ts` | `bot.on("message:text")` | 🟢 |
| `src/bot/telegram.ts` | `requestConfirmation` | 🟢 |
| `src/bot/telegram.ts` | `sendRobustMessage` | 🟢 |
