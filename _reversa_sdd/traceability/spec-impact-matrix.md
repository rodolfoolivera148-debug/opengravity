# Matriz de Impacto de Especificaciones (Spec Impact Matrix) — Opengravity

Esta matriz identifica cómo los cambios en un componente afectan a otros módulos del sistema. Es vital para el mantenimiento autónomo por parte de agentes de IA.

| Componente Impactado → | `agent` | `bot` | `memory` | `trendradar` | `config` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **↓ Cambio en...** | | | | | |
| **Protocolo MCP** | 💥 Alto | - | - | 💥 Alto | - |
| **Esquema Firestore** | 💥 Alto | - | 💥 Alto | - | - |
| **Límites de Groq** | 💥 Alto | - | - | - | ⚠️ Medio |
| **API de Telegram** | - | 💥 Alto | - | - | - |
| **Estructura de Trazas** | ⚠️ Medio | - | 💥 Alto | - | - |
| **Google Auth (gogcli)**| ⚠️ Medio | - | - | - | ⚠️ Medio |

## Leyenda de Impacto

- **💥 Alto**: Requiere refactorización inmediata en el componente destino.
- **⚠️ Medio**: Requiere actualización de configuración o prompts.
- **-**: Sin impacto directo.

## Análisis de Dependencias Críticas

1. **`agent` ↔ `trendradar`**: Cualquier cambio en el nombre de una herramienta en Python (`trendradar`) romperá el `AgentLoop` si no se actualiza la lista de `ESSENTIAL_TRENDRADAR_TOOLS`.
2. **`memory` ↔ `agent`**: El sistema de autocuración de prompts depende de que la estructura de la tabla `AUDIT_RULE` sea consistente.
3. **`config` ↔ `llm`**: Los cambios en las variables de entorno de Render impactan directamente la disponibilidad de modelos.
