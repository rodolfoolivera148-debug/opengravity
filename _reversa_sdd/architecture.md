# Arquitectura del Sistema — Opengravity

## Visión General

Opengravity es un **Agente de IA Personal Autónomo** diseñado para ejecutarse en la nube y comunicarse exclusivamente a través de Telegram. Su arquitectura se basa en un **Reasoning Loop** desacoplado que utiliza el **Model Context Protocol (MCP)** para interactuar con herramientas externas.

## Atributos de Calidad

1. **Resiliencia**: Capacidad de conmutación por error (fallback) entre modelos de lenguaje (Groq -> OpenRouter).
2. **Seguridad**: Validación estricta de IDs de usuario y confirmación humana para acciones de escritura/ejecución.
3. **Autoaprendizaje**: Sistema de trazas que permite al agente aprender de sus éxitos pasados (LeJEPA) y fallos auditados.
4. **Eficiencia de Contexto**: Gestión dinámica de tokens mediante ruteo de categorías y truncadura agresiva.

## Diagrama C4 Contexto (Nivel 1)

```mermaid
C4Context
    title Diagrama de Contexto de Opengravity

    Person(rodolfo, "Rodolfo (Owner)", "Usuario autorizado que interactúa mediante lenguaje natural.")
    System(opengravity, "OpenGravity AI", "Agente autónomo que razona, aprende y ejecuta herramientas.")

    System_Ext(telegram, "Telegram Bot API", "Interfaz de mensajería y ruteo de webhooks.")
    System_Ext(groq, "Groq / OpenRouter", "Motores de inferencia LLM (Cerebro del agente).")
    System_Ext(firebase, "Firebase (Firestore)", "Persistencia de memoria a largo plazo y trazas de aprendizaje.")
    System_Ext(google, "Google Workspace / AI", "Gestión de documentos, correo y generación de embeddings.")
    System_Ext(trendradar, "TrendRadar (MCP)", "Servidor de inteligencia web y noticias.")

    Rel(rodolfo, telegram, "Envía peticiones y confirma acciones")
    Rel(telegram, opengravity, "Envía webhooks", "HTTPS")
    Rel(opengravity, telegram, "Envía respuestas", "HTTPS")
    Rel(opengravity, groq, "Peticiones de razonamiento", "HTTPS/API")
    Rel(opengravity, firebase, "Sincroniza memoria y trazas", "Firestore Protocol")
    Rel(opengravity, google, "Gestiona archivos y genera vectores", "API / gogcli")
    Rel(opengravity, trendradar, "Consulta tendencias y noticias", "MCP / Stdio-HTTP")
```
