# Matriz de Permisos — Opengravity

El sistema utiliza un control de acceso basado en listas blancas de IDs de Telegram y una capa de seguridad interactiva para acciones peligrosas.

## Roles del Sistema

| Rol | Identificación | Descripción |
| :--- | :--- | :--- |
| **Owner** | `TELEGRAM_ALLOWED_USER_IDS` | Usuario con control total sobre el bot y acceso a la ejecución de comandos. |
| **Agent** | Sistema Interno | Posee "Superpoderes" pero limitados por la interacción humana. |
| **Anonymous** | Cualquier otro ID | El middleware bloquea cualquier interacción. |

## Matriz de Ejecución de Herramientas

| Herramienta | Acción | Requiere Confirmación | Justificación |
| :--- | :--- | :--- | :--- |
| `get_current_time` | Lectura | No | Inocuo. |
| `mcp_trendradar_*` | Lectura | No | Solo lectura de datos web. |
| `read_file` | Lectura | No | Acceso a lectura del workspace. |
| `write_file` | Escritura | **Sí** | Riesgo de sobreescritura de código fuente. |
| `execute_terminal_command` | Ejecución | **Sí** | Riesgo de borrado de archivos o ejecución de código malicioso. |
| `execute_google_workspace_action` | Acción Externa | No* | Actualmente no está en la lista de `sensitiveTools`, pero accede a datos privados. |
| `save_user_fact` | Escritura | No | Persistencia en el perfil de usuario. |

> [!IMPORTANT]
> La lista de herramientas sensibles está hardcodeada en `src/agent/loop.ts:219`. Cualquier nueva herramienta que modifique el estado del servidor debe añadirse a este arreglo para garantizar la seguridad.
