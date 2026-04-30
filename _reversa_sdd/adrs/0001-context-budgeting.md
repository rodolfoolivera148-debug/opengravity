# [ADR-01] Estrategia de Mitigación de 413 (Context Budgeting)

## Estado

Aceptado (Retroactivo)

## Contexto

El sistema utiliza Groq como proveedor principal de LLM. Groq tiene límites de Tokens por Minuto (TPM) muy estrictos en su capa gratuita (6000-12000 TPM). Dado que las definiciones de herramientas MCP son extensas (~100-200 tokens por herramienta), cargar todas las herramientas (30+) consumiría casi todo el presupuesto de contexto, provocando errores HTTP 413.

## Decisión

Se implementa una estrategia de "Presupuesto de Contexto" de dos niveles:

1. **Ruteo Dinámico**: El agente clasifica la intención y solo carga las herramientas esenciales para esa categoría.
2. **Modo Reduced (Lite)**: Si ocurre un error 413 a pesar del ruteo, el sistema captura la excepción, marca un flag `contextReduced` y reinicia la iteración con:
    - Historial recortado (solo el último 30%).
    - Resultados de herramientas truncados a 500 caracteres.
    - System Prompt simplificado sin ejemplos de éxito.

## Alternativas Consideradas (Inferidas)

- **Cambiar a modelos con contexto gigante (ej. Gemini 1.5 Pro)**: Descartado probablemente por costo o latencia. Groq ofrece inferencia casi instantánea necesaria para un chatbot de Telegram.
- **Paginación de Herramientas**: Complejo de implementar para el razonamiento del modelo.

## Consecuencias

- **Positivas**: Alta resiliencia; el sistema casi nunca se bloquea por completo ante peticiones largas.
- **Negativas**: El sistema puede "olvidar" detalles importantes de una conversación muy larga si entra en modo reducido.
