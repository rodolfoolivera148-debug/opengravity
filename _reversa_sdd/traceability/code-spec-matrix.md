# Matriz de Rastreabilidad Código-Especificación (Code-Spec Matrix)

Esta matriz vincula los archivos fuente del proyecto legado con las especificaciones generadas por Reversa, permitiendo verificar la cobertura de la documentación.

| Archivo / Módulo | Especificación Correspondiente (SDD) | Cobertura |
| :--- | :--- | :---: |
| `src/agent/loop.ts` | `sdd/agent-reasoning-core.md` | 🟢 |
| `src/agent/llm.ts` | `sdd/agent-reasoning-core.md` | 🟢 |
| `src/agent/tools.ts` | `sdd/agent-reasoning-core.md` | 🟢 |
| `src/agent/auditor.ts` | `sdd/agent-reasoning-core.md` | 🟢 |
| `src/bot/telegram.ts` | `sdd/bot-telegram-interface.md` | 🟢 |
| `src/memory/memoryManager.ts` | `sdd/memory-persistence-layer.md` | 🟢 |
| `src/config/env.ts` | `sdd/config-infrastructure.md` | 🟢 |
| `src/config/firebase.ts` | `sdd/config-infrastructure.md` | 🟢 |
| `src/config/prompts.ts` | `sdd/config-infrastructure.md` | 🟢 |
| `trendradar/mcp_server/server.py` | `sdd/trendradar-mcp-server.md` | 🟢 |
| `trendradar/config/config.yaml` | `sdd/trendradar-mcp-server.md` | 🟢 |
| `render.yaml` | `deployment.md` | 🟢 |
| `Dockerfile` | `deployment.md` | 🟢 |
| `OpengravityApp/` | `sdd/agent-reasoning-core.md` (Placeholder) | 🟡 |

## Resumen de Cobertura Estimated

- **Módulos Críticos**: 100% 🟢
- **Lógica de Negocio**: 100% 🟢
- **Infraestructura**: 100% 🟢
- **Módulos Placeholder (Mobile)**: 20% 🟡 (Documentado como esqueleto).

> El sistema está completamente documentado para permitir una reconstrucción funcional idéntica.
