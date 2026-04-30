# US-02: Autocuración del Sistema ante Fallos Críticos

## Protagonista

**El Sistema (Opengravity)**, actuando de forma autónoma para corregir su comportamiento tras una falla técnica detectada.

## Declaración

Como **Opengravity**,
quiero auditar automáticamente mis propias fallas de ejecución (errores 413, límites de iteración),
para generar y aplicar reglas correctivas que eviten que el mismo error ocurra en el futuro.

## Escenarios de Aceptación

### Escenario 1: Generación de Regla tras Error 413

**Dado** que el agente ha fallado por un error de "Context Too Large" (413) incluso en modo Lite
**Cuando** se dispara la función `runFailureAudit`
**Entonces** el sistema debe:

1. Analizar la traza del fallo en Firestore.
2. Identificar el componente o herramienta que causó el exceso de tokens.
3. Crear una `AUDIT_RULE` con una instrucción clara (ej: "No uses la herramienta X para consultas de más de 100 caracteres").
4. Persistir la regla para su inyección en el próximo inicio de sesión del usuario.

### Escenario 2: Aplicación de Regla Correctiva

**Dado** que existe una regla activa en `prompt_optimizations`
**Cuando** Rodolfo envía un nuevo mensaje al bot
**Entonces** el sistema debe:

1. Recuperar las optimizaciones de prompt desde la memoria.
2. Inyectar la regla específicamente en la sección "REGLAS CRÍTICAS" del system prompt.
3. Verificar que el Agente siga la nueva restricción durante su razonamiento.

## Reglas de Negocio Relacionadas

- **Continuous Evolution**: El sistema debe priorizar las reglas del Auditor sobre las instrucciones generales del system prompt.
- **Fail-Safe**: Si el Auditor no puede generar una regla coherente, debe registrar el fallo para revisión manual sin bloquear el bot.

## Prioridad

**Should-Have**: Mejora la estabilidad a largo plazo y reduce el soporte manual.
