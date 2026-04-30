# TrendRadar MCP Server

## Visión Geral

TrendRadar es el subsistema de inteligencia externa de Opengravity. Operando como un servidor MCP independiente, monitoriza, agrega y analiza noticias globales y feeds técnicos (técnicas de OSINT), permitiendo que el Agente tenga acceso a datos en tiempo real de múltiples plataformas.

## Responsabilidades

- **Multi-Platform Crawling**: Monitoriza fuentes de alta densidad (Weibo, Zhihu, Baidu) y feeds RSS globales (Hacker News, Yahoo Finance).
- **Tool Exposure**: Ofrece herramientas de búsqueda, filtrado y lectura de artículos optimizadas para LLMs vía protocolo MCP.
- **News Aggregation**: Consolida noticias duplicadas o similares de diferentes fuentes mediante algoritmos de similitud de cadenas.
- **Date Natural Resolution**: Traduce expresiones de tiempo humanas (ej: "la semana pasada") a rangos ISO válidos para consultas de BD.

## Interface

- **Protocolo**: Model Context Protocol (MCP) sobre Stdio.
- **Entrada**: Tool calls (ej: `mcp_trendradar_search_news`).
- **Salida**: JSON formateado o Markdown enriquecido para el Agente.
- **Tecnología**: Python 3.11+, FastMCP, SQLite (para almacenamiento de noticias rastreadas).

## Regras de Negócio

- **Token Economy**: Los resultados de búsqueda están limitados a un máximo configurable (ej: 20-50 items) para no saturar el contexto del Agente. 🟢
- **Smart Aggregation**: El sistema agrupa noticias si la similitud de los títulos supera el umbral de 0.7. 🟢
- **Fuzzy Date Matching**: Utiliza `resolve_date_range` para normalizar cualquier referencia temporal antes de atacar la base de datos. 🟢
- **Platform Priority**: Las fuentes con mayor "hotness" o ranking tienen prioridad en la entrega de resultados al Agente. 🟡

## Fluxo Principal

1. El Agente solicita información (ej: "Qué es tendencia en IA en China").
2. El Agente llama a la herramienta `search_news` del servidor MCP.
3. TrendRadar analiza los parámetros y resuelve el rango de fechas.
4. Consulta la base de datos local de noticias rastreadas (que se puebla mediante tareas programadas o bajo demanda).
5. Aplica algoritmos de agregación para eliminar duplicados.
6. Devuelve un resumen estructurado al Agente.

## Fluxos Alternativos

- **Búsqueda sin resultados en DB:** El Agente puede disparar un rastreo inmediato mediante `trigger_crawl` con total autonomía si la consulta no devuelve resultados históricos. 🟢 (Confirmado por el usuario)
- **Error de interpretación de fecha:** Si la expresión temporal es ambigua, TrendRadar devuelve el error amigable solicitando aclaración al Agente.

## Dependências

- **FastMCP 2.0** — Framework para servidores MCP en Python.
- **LiteLLM** — Utilizado internamente para análisis de sentimiento o resúmenes de noticias.
- **SQLite** — Almacén de noticias e histórico de RSS.

## Requisitos Não Funcionais

| Tipo | Requisito inferido | Evidência no código | Confianza |
| :--- | :--- | :--- | :---: |
| Latencia | Consultas rápidas sobre caché local SQLite (indexado). | `trendradar/mcp_server/data_service.py` | 🟢 |
| Extensibilidad | Configuración de fuentes centralizada en `config.yaml`. | `trendradar/config/config.yaml` | 🟢 |
| Precisión | Normalización de campos multilingües (Chino/Inglés). | `trendradar/mcp_server/server.py` | 🟡 |
| Seguridad | Validación estricta de parámetros con `validators.py`. | `trendradar/mcp_server/utils/validators.py` | 🟢 |

## Critérios de Aceitação

```gherkin
Dado que el Agente solicita `search_news` con el término "Tesla"
Cuando TrendRadar tiene noticias de Weibo y Hacker News sobre Tesla
Entonces debe devolver una lista agregada donde se vea la popularidad (hotness) en ambas plataformas.

Dado que la consulta incluye un rango de fecha "yesterday"
Cuando se procesa la herramienta
Entonces el servidor debe traducir automáticamente a la fecha ISO de ayer antes de la consulta SQL.
```

## Prioridade (MoSCoW)

| Requisito | MoSCoW | Justificativa |
| :--- | :--- | :--- |
| Exposición de herramientas de búsqueda | Must | Razón de ser del componente. |
| Integración RSS Global | Must | Provee contexto fuera de la burbuja técnica china. |
| Agregación de noticias similares | Should | Evita que el Agente reciba 10 veces la misma noticia, ahorrando tokens. |
| Análisis de sentimiento AI | Could | Valor añadido pero no bloqueante para la información básica. |

## Rastreabilidade de Código

| Arquivo | Función / Clase | Cobertura |
| :--- | :--- | :---: |
| `trendradar/mcp_server/server.py` | `@mcp.tool()` | 🟢 |
| `trendradar/mcp_server/tools/data_query.py` | `search_news` | 🟢 |
| `trendradar/config/config.yaml` | Definición de fuentes | 🟢 |
