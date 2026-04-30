# US-01: Investigación Autónoma de Tendencias e Inteligencia

## Protagonista

**Rodolfo**, el dueño del sistema, que necesita estar informado sobre cambios tecnológicos globales y locales (de China o el mundo OSINT).

## Declaración

Como **Rodolfo**,
quiero solicitar que OpenGravity investigue un tema específico,
para recibir un informe consolidado que incluya datos reales, análisis de sentimiento y resumen de múltiples fuentes.

## Escenarios de Aceptación

### Escenario 1: Investigación de éxito (Happy Path)

**Dado** que Rodolfo está autenticado en el bot de Telegram
**Cuando** solicita: "¿Cuáles son las 3 noticias más importantes de tecnología en China hoy?"
**Entonces** el sistema debe:

1. Clasificar la petición como categoría `NEWS`.
2. Invocar la herramienta del servidor MCP `mcp_trendradar_get_latest_news`.
3. Procesar el resultado, agregando duplicados.
4. Responder en español con un resumen estructurado.

### Escenario 2: Fallo en fuente de datos (Graceful Degradation)

**Dado** que el servidor MCP TrendRadar no está disponible por problemas de red
**Cuando** Rodolfo solicita una investigación
**Entonces** el sistema debe:

1. Intentar el fallback de herramientas locales o persistencia histórica.
2. Informar a Rodolfo sobre la indisponibilidad de datos en tiempo real.
3. Ofrecer información basada en la memoria semántica (LeJEPA) de investigaciones previas similares.

### Escenario 3: Análisis profundo con lectura de artículos

**Dado** que una noticia es de alto interés
**Cuando** Rodolfo pide "Dame más detalles sobre la noticia de la nueva IA de Alibaba"
**Entonces** el sistema debe:

1. Usar `mcp_trendradar_search_news` para encontrar el enlace exacto.
2. Usar `mcp_trendradar_read_article` para extraer el contenido completo.
3. Resumir los puntos clave usando el razonamiento del LLM.

## Reglas de Negocio Relacionadas

- **Token Economy**: El resumen debe ser conciso para no agotar los límites TPM de Groq.
- **LeJEPA**: El éxito de esta investigación debe guardarse como una traza para acelerar futuras consultas similares.

## Prioridad

**Must-Have**: Es la funcionalidad principal del componente TrendRadar.
