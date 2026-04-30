# Análisis Técnico de Módulos — Opengravity

## Módulo: `agent` (Core de IA)

### Resumen del Módulo `agent`

El módulo `agent` es el componente central de Opengravity. Implementa un **Reasoning Loop** (Bucle de Razonamiento) que permite al agente procesar mensajes de lenguaje natural, seleccionar herramientas dinámicamente y recuperarse de errores de contexto o límites de API de forma autónoma.

### Componentes del Agente

### 1. Reasoning Loop (`loop.ts`)

🟢 **CONFIRMADO**

Implementa la lógica de "Pensamiento e Interacción".

- **Enrutamiento:** Clasifica mensajes en categorías (FIREBASE, NEWS, WORKSPACE, etc.) para optimizar la selección de herramientas.
- **Gestión de Contexto:** Inyecta "Superpoderes" (metodología), perfiles de usuario y "Memoria de Éxito" (ejemplos de ejecuciones pasadas correctas).
- **Estrategia Lite/Full:** Si detecta un error 413 (Contexto demasiado grande), reduce agresivamente el historial y las herramientas disponibles en lugar de fallar.

### 2. MCP Client (`mcpClient.ts`)

🟢 **CONFIRMADO**

Orquestador de herramientas externas vía Model Context Protocol.

- **Interceptores:** Modifica los argumentos de herramientas de terceros (especialmente TrendRadar) para corregir alucinaciones del LLM y optimizar búsquedas (traducción ES -> EN).
- **Sanitización:** Simplifica los esquemas JSON de las herramientas para ahorrar tokens.

### 3. Failure Auditor (`auditor.ts`)

🟢 **CONFIRMADO**

Motor de evolución por contraste.

- Compara trazas de fallos con éxitos.
- Genera "Reglas Críticas" que se guardan en Firestore y se aplican como optimizaciones de prompt para el usuario.

### 4. Model Status Tracker (`modelTracker.ts`)

🟢 **CONFIRMADO**

Gestor de disponibilidad de LLMs.

- Rastrea en tiempo real los límites de Groq y OpenRouter.
- Marca modelos como no disponibles temporalmente tras errores 429 o fallos de red.

## Algoritmos del Agente

### Algoritmo de Selección de Herramientas (Context-Aware)

Para evitar saturar la ventana de contexto de modelos gratuitos (como Groq), el agente aplica un filtro:

1. Siempre incluye herramientas esenciales y locales.
2. Incluye herramientas que el LLM ya usó en el historial actual.
3. Incluye solo las herramientas de la categoría detectada por el Router.
4. Incluye herramientas sugeridas por palabras clave en el mensaje.

### Algoritmo de Autocorrección de Contexto (413)

Si el proveedor devuelve un error por exceso de tokens:

1. Reduce el historial al 30% más reciente.
2. Trunca resultados de herramientas previos a 500 caracteres.
3. Activa el modo "LITE" que usa prompts reducidos y solo herramientas críticas.

## Escala de Confianza

- **Estructura del Loop:** 🟢 CONFIRMADO
- **Integración Firestore:** 🟢 CONFIRMADO
- **Lógica de Auditoría:** 🟢 CONFIRMADO
- **Configuración Science Lab:** 🟡 INFERIDO (Parece ser una funcionalidad remota aún en desarrollo o restringida).

---

## Módulo: `bot` (Interfaz Telegram)

### Resumen del Módulo `bot`

El módulo `bot` gestiona la interfaz de usuario a través de Telegram utilizando el framework **Grammy**. Su función principal es la comunicación bidireccional, la gestión de la seguridad mediante confirmaciones humanas y el reporte de estado del sistema.

### Componentes del Bot

### 1. Interfaz de Telegram (`telegram.ts`)

🟢 **CONFIRMADO**

- **Middleware de Acceso:** Filtra mensajes permitiendo solo IDs de usuario autorizados en `env.TELEGRAM_ALLOWED_USER_IDS`.
- **Procesamiento Asíncrono:** Ejecuta `runAgentLoop` dentro de una función asíncrona no esperada (`IIFE`) para no bloquear el polling de Telegram, permitiendo recibir callbacks mientras el agente "piensa".
- **Gestión de Mensajes Largos:** Implementa un fallback que convierte respuestas de más de 3800 caracteres en archivos `.txt` descargables.

### 2. Sistema de Confirmación Human-in-the-loop

🟢 **CONFIRMADO**

- **Lógica Asíncrona:** Utiliza un `Map<string, resolver>` para pausar la ejecución de herramientas sensibles sin bloquear el hilo principal.
- **Timeout de Seguridad:** Las peticiones de confirmación expiran automáticamente tras 5 minutos de inactividad, rechazando la acción por defecto.

## Comandos del Sistema

- `/start`: Inicializa la conversación.
- `/status`: Consulta en tiempo real las estadísticas de evolución (tasa de éxito y regla activa del Auditor) desde la memoria persistente.
- `/reset`: Limpia el estado del rastreador de modelos, permitiendo reintentar modelos bloqueados.
- `/api`: Realiza un "smoke test" rápido de conectividad con Groq y OpenRouter.

### Algoritmos del Bot

### Algoritmo de Confirmación No Bloqueante

1. El agente detecta una herramienta sensible y llama a `requestConfirmation`.
2. Se genera un `confirmationId` único.
3. Se almacena la función `resolve` de una nueva Promesa en un `Map` global indexado por el ID.
4. Se envía el mensaje con teclado inline al usuario.
5. Cuando el usuario hace clic, el manejador de `callback_query` recupera el resolutor del `Map` y lo ejecuta con el valor correspondiente (`true`/`false`), desbloqueando la ejecución original.

---

## Módulo: `OpengravityApp` (Aplicación Móvil - Placeholder)

### Resumen del Módulo `OpengravityApp`

El módulo `OpengravityApp` se identifica como un andamiaje (scaffold) inicial para una aplicación móvil basada en **React Native**.

### Estado Actual

🟢 **CONFIRMADO**

- **Estructura:** El directorio contiene únicamente un archivo `package.json` con scripts de inicio de React Native y un directorio `node_modules`.
- **Funcionalidad:** No se ha encontrado código fuente (`App.js`, `src/`) ni activos nativos (`ios/`, `android/`). Se clasifica como un **módulo en desarrollo o placeholder**.

---

# Conclusión de la Excavación - Escala de Confianza

- **Núcleo de Razonamiento (Agent):** 🟢 CONFIRMADO (Código completo analizado)
- **Interfaz de Comunicación (Bot):** 🟢 CONFIRMADO (Código completo analizado)
- **Capa de Persistencia (Memory):** 🟢 CONFIRMADO (Código completo analizado)
- **Infraestructura (Config):** 🟢 CONFIRMADO (Código completo analizado)
- **Suministro de Datos (TrendRadar):** 🟢 CONFIRMADO (Extensas herramientas MCP analizadas)
- **Aplicación Móvil (App):** 🔴 SIN IMPLEMENTACIÓN (Estructura de placeholder detectada)

---

## Módulo: `memory` (Persistencia y Autoaprendizaje)

### Resumen del Módulo `memory`

El módulo `memory` implementa un sistema de persistencia híbrido. Utiliza **better-sqlite3** para el almacenamiento local de alta velocidad y **Firebase Firestore** para la sincronización en la nube, búsqueda semántica y almacenamiento a largo plazo del perfil de usuario.

### Componentes de Persistencia

#### 1. Base de Datos Híbrida (`memoryManager.ts`)

🟢 **CONFIRMADO**

- **Mensajería:** Los mensajes se guardan primero en SQLite y se intentan sincronizar con Firestore en segundo plano. Si falla la red, el bot sigue operando con la base de datos local.
- **Búsqueda Semántica:** Utiliza el modelo `text-embedding-004` de Google para vectorizar las trazas de éxito, permitiendo la "Memoria de Éxito" (inspirada en LeJEPA) que guía al agente con ejemplos relevantes.

#### 2. Almacenamiento Local (`db.ts`)

🟢 **CONFIRMADO**

- **Modo Nube vs Local:** En entornos tipo Render, utiliza una base de datos `:memory:` (efímera) ya que Firestore es la fuente primaria. En local, utiliza un archivo persistente (`env.DB_PATH`).
- **Esquema Minimalista:** Una sola tabla `messages` gestiona la ventana de contexto corta.

### Áreas de Conocimiento

#### 1. Perfil de Usuario (`user_metadata`)

🟢 **CONFIRMADO**

- Gestiona hechos atómicos sobre el usuario (e.g., preferencias, ubicación, proyectos) que el agente extrae dinámicamente mediante herramientas.

#### 2. Optimización de Prompts (`prompt_optimizations`)

🟢 **CONFIRMADO**

- Almacena las "Reglas Críticas" generadas por el Auditor. Estas reglas tienen prioridad y se inyectan en cada ciclo de pensamiento para evitar la repetición de errores técnicos específicos.

## Algoritmos del Módulo Memory

### Algoritmo de Recuperación de Contexto Semántico

1. El Agente solicita contexto para un mensaje y categoría específicos.
2. `memoryManager` busca en Firestore las trazas (éxitos) que coincidan con la categoría.
3. Si los embeddings están configurados, puede realizar una búsqueda por similitud vectorial.
4. Los 2 ejemplos más relevantes se devuelven formateados para su inyección directa en el System Prompt.

---

## Módulo: `config` (Infraestructura y Secretos)

### Resumen del Módulo `config`

El módulo `config` es el guardián de la configuración del sistema. Centraliza la validación de variables de entorno y la inicialización de servicios externos como Firebase Admin SDK.

### Componentes de Configuración

#### 1. Validación de Entorno (`env.ts`)

🟢 **CONFIRMADO**

- **Esquema Zod:** Define un contrato estricto para las claves de API (Groq, OpenRouter, Google), configuraciones de base de datos y tokens de Telegram.
- **Transformación de Datos:** Convierte la cadena de texto `TELEGRAM_ALLOWED_USER_IDS` (lista separada por comas) en un arreglo numérico para facilitar las comprobaciones de seguridad en el middleware del bot.

#### 2. Ecosistema Firebase (`firebase.ts`)

🟢 **CONFIRMADO**

- **Carga de Credenciales:** Detecta si se ha proporcionado un JSON de cuenta de servicio completo a través de la variable `FIREBASE_SERVICE_ACCOUNT_JSON` para inicializar el SDK sin depender de archivos locales. Esto permite despliegues seguros en PaaS como Render.

---

## Módulo: `trendradar` (Suministro de Inteligencia - MCP)

### Resumen del Módulo `trendradar`

`trendradar` es un subsistema independiente basado en Python que expone capacidades de búsqueda y análisis de tendencias globales a través del estándar **MCP (Model Context Protocol)**. Es el componente que provee datos externos al agente Opengravity.

### Herramientas de Inteligencia (MCP Tools)

#### 1. Consulta de Datos (`mcp_server/server.py`)

🟢 **CONFIRMADO**

- **Búsqueda Unificada:** `search_news` permite buscar simultáneamente en plataformas de noticias y feeds RSS.
- **Resolución de Fechas:** `resolve_date_range` traduce expresiones naturales como "el mes pasado" en rangos ISO precisos antes de realizar consultas de base de datos.
- **Agregación:** `aggregate_news` utiliza algoritmos de similitud para consolidar noticias que tratan sobre el mismo tema en diferentes plataformas.

#### 2. Análisis de Tendencias y Sentimientos

🟢 **CONFIRMADO**

- **Análisis de Vida:** Detecta el ciclo de vida de un tema (emergente, pico, declive).
- **Sentiment Analysis:** Clasifica noticias según su carga emocional y peso mediático.

### Configuración y Fuentes

- **Config.yaml:** Centraliza más de 20 fuentes de noticias y la configuración de los modelos LLM (vía LiteLLM) usados para los reportes internos de TrendRadar.

## Algoritmos del Módulo TrendRadar

### Algoritmo de Agregación de Noticias

1. Recupera noticias candidatas de múltiples plataformas (Zhihu, Weibo, etc.).
2. Aplica un cálculo de similitud de cadenas entre títulos.
3. Si supera el `similarity_threshold` (0.7 por defecto), las agrupa bajo un ID de evento único.
4. Calcula el "Peso Combinado" sumando las métricas de hotness de cada plataforma.
