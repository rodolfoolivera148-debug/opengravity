# [ADR-02] Auditoría de Aprendizaje (Auto-evolución)

## Estado

Aceptado (Retroactivo)

## Contexto

Los agentes de IA a menudo repiten los mismos errores técnicos si el System Prompt no es lo suficientemente específico para el entorno actual.

## Decisión

Implementar un sistema de auditoría post-mortem activado por fallos.

- Cuando el loop del agente falla (error de red persistente, límite de iteraciones o error crítico), se dispara `runFailureAudit`.
- El Auditor revisa la traza (trace) almacenada en Firestore.
- El Auditor genera una "Regla Crítica" (ej: "Nunca intentes listar el directorio X porque está protegido").
- Esta regla se guarda en `prompt_optimizations` y se inyecta en el prompt de sistema de todas las llamadas futuras para ese usuario.

## Alternativas Consideradas (Inferidas)

- **Ajuste manual de prompts**: Lento y requiere que el desarrollador esté atento a los logs.
- **Fine-tuning**: Costoso y requiere grandes conjuntos de datos.

## Consecuencias

- **Positivas**: El sistema se vuelve más robusto con el uso sin intervención humana. "Evolución por contraste" (éxito vs fallo).
- **Negativas**: Riesgo de que el Auditor genere reglas demasiado restrictivas o basadas en una interpretación errónea de un fallo puntual.
