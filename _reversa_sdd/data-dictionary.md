# Diccionario de Datos — Módulo `agent`

Este documento describe las estructuras de datos, interfaces y entidades utilizadas por el núcleo de inteligencia.

## Entidades de Razonamiento

### 1. Trace (Traza de Ejecución)

Registro detallado de un ciclo de pensamiento para aprendizaje.

- `category`: Categoría asignada por el router (CORE, NEWS, FIREBASE, etc.).
- `user_message`: Mensaje original del usuario.
- `thought_process`: Arreglo de cadenas con los pensamientos generados por el LLM.
- `tool_calls`: Arreglo de objetos con las llamadas a herramientas realizadas.
- `results`: Arreglo de resultados (salidas) de las herramientas.
- `model_index`: Índice del modelo utilizado en la lista de fallbacks.
- `success`: Booleano que indica si la tarea se completó sin errores críticos.
- `timestamp`: Fecha y hora de la ejecución.

### 2. User Profile (Perfil de Rodolfo)

Memoria a largo plazo sobre el usuario.

- Un arreglo de hechos (strings) extraídos mediante la herramienta `save_user_fact`.
- Ejemplos: "Rodolfo prefiere programar en TypeScript", "Rodolfo usa Windows".

### 3. ModelState (Estado del Modelo)

Monitor de salud de los proveedores de LLM.

- `name`: Identificador del modelo (ej. `llama-3.1-8b-instant`).
- `provider`: Proveedor (Groq, OpenRouter).
- `available`: Estado de disponibilidad actual.
- `retryAfter`: Timestamp de cuándo se puede reintentar el modelo tras un bloqueo.
- `remainingRequests` / `remainingTokens`: Límites de tasa (Rate Limits) reportados por Groq.

## Estructuras MCP (Model Context Protocol)

### 1. McpServerConfig

- `name`: Nombre del servidor (firebase, trendradar, colab).
- `type`: Tipo de transporte (`stdio` o `sse`).
- `command` / `args`: Comando para lanzar el servidor.
- `env`: Variables de entorno específicas del servidor.

### 2. Tool Definition (Sanitizada)

Definición de herramienta optimizada para ahorrar tokens.

- `name`: Nombre con prefijo (`mcp_server_name_original_name`).
- `description`: Descripción truncada a 250 caracteres.
- `parameters`: Esquema Zod/JSON simplificado (sin $defs complejos).

## Configuraciones e Inyecciones

### 1. Prompt Optimizations

- `last_suggestion`: La "Regla Crítica" generada por el Auditor.
- `updated_at`: Última actualización de la regla.
- `audit_log`: Referencia a los mensajes que causaron el fallo auditado.

### 2. Superpowers (Metodología)

Contenido extraído de `superpowers/skills/` que define el "modo de ser" del agente (instrucciones de comportamiento de alto nivel).

---

## Diccionario de Datos — Módulo `memory`

## Persistencia Relacional (SQLite)

### Tabla `messages`

- `id`: Autoincrement (Local).
- `user_id`: ID de Telegram del usuario.
- `role`: Tipo de emisor (`system`, `user`, `assistant`, `tool`).
- `content`: Texto plano o JSON de herramienta.
- `timestamp`: Fecha de creación.

## Persistencia NoSQL (Firestore)

### Colección `traces` (LeJEPA)

- `user_id`: Identificador de usuario.
- `category`: Contexto de la tarea (CORE, NEWS, etc.).
- `user_message`: Input original.
- `thought_process`: Cadena de pensamientos del modelo.
- `results`: Salidas de herramientas ejecutadas.
- `success`: Indica si la tarea terminó con éxito.
- `embedding`: Vector numérico (opcional) del mensaje de usuario.

### Colección `user_metadata`

- `facts`: Arreglo de cadenas (hechos sobre el usuario).
- `lastUpdate`: Fecha de sincronización.

---

## Diccionario de Datos — Módulo `config`

### Esquema de Entorno (Zod)

- `TELEGRAM_BOT_TOKEN`: Secreto del bot.
- `TELEGRAM_ALLOWED_USER_IDS`: Arreglo numérico de IDs autorizados.
- `GROQ_API_KEY`: Clave primaria del LLM.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Opcional. Objeto JSON con credenciales de admin.

---

## Diccionario de Datos — Módulo `trendradar`

### Entidad: NewsItem (Elemento de Noticia)

- `id`: Identificador único del sistema.
- `title`: Título de la noticia (originalmente en Chino/Inglés).
- `platform`: ID de la fuente (ej. `weibo`, `hacker-news`).
- `rank`: Posición en la lista de éxitos.
- `hotness`: Valor numérico de popularidad.
- `url`: Enlace directo a la fuente.

### Entidad: TrendingTopic

- `keyword`: Palabra clave o tema detectado.
- `count`: Frecuencia de aparición en el periodo solicitado.
- `weight`: Importancia relativa ponderada por plataforma.
