# Dependencias del Proyecto — Opengravity

## Dependencias de Producción (Node.js)
| Paquete | Versión | Propósito |
| :--- | :--- | :--- |
| `@google/generative-ai` | `^0.24.1` | Integración con Google Gemini |
| `@modelcontextprotocol/sdk` | `^1.27.1` | Protocolo de contexto para herramientas IA |
| `better-sqlite3` | `^11.5.0` | Base de datos local SQLite ultrarrápida |
| `dotenv` | `^16.4.5` | Gestión de variables de entorno |
| `express` | `^5.2.1` | Servidor web minimalista |
| `firebase` | `^12.10.0` | SDK de Firebase para cliente |
| `firebase-admin` | `^13.7.0` | SDK de Firebase para entorno administrativo |
| `firebase-tools` | `^15.9.1` | Herramientas de despliegue de Firebase |
| `grammy` | `^1.32.0` | Framework para bots de Telegram |
| `openai` | `^4.7.0` | Integración con modelos de OpenAI |
| `zod` | `^3.23.8` | Validación de esquemas y tipos |

## Dependencias de Desarrollo (Node.js)
| Paquete | Versión | Propósito |
| :--- | :--- | :--- |
| `tsx` | `^4.19.2` | Ejecución directa de TypeScript |
| `typescript` | `^5.6.3` | Lenguaje de desarrollo |

## Otras Herramientas Identificadas
- **Python:** Utilizado en `trendradar` y scripts de utilidad (`main.py`, `get_oauth_token.py`).
- **React Native:** Usado en `OpengravityApp`.
- **Firebase CLI:** Requerido para la gestión del backend.
