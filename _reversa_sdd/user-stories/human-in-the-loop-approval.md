# US-03: Aprobación Humana para Acciones Sensibles

## Protagonista

**Rodolfo**, el dueño del sistema, que desea tener control final sobre las acciones que pueden afectar su infraestructura o datos.

## Declaración

Como **Rodolfo**,
quiero que el sistema me solicite confirmación explícita antes de ejecutar comandos terminales o modificar archivos,
para evitar ejecuciones accidentales o comportamientos erróneos del agente autónomo.

## Escenarios de Aceptación

### Escenario 1: Ejecución de Comando Terminal Seguro

**Dado** que el agente decide ejecutar `npm run test` como parte de su flujo de trabajo
**Cuando** se detecta que es una herramienta sensible (`execute_terminal_command`)
**Entonces** el sistema debe:

1. Suspender la ejecución del bucle.
2. Enviar un mensaje a Telegram con el detalle del comando y dos botones: "Aprobar ✅" / "Rechazar ❌".
3. Esperar indefinidamente el clic del usuario.
4. Si Rodolfo pulsa "Aprobar", ejecutar el comando y devolver el resultado al Agente.

### Escenario 2: Rechazo de Acción Sensible

**Dado** que el agente intenta borrar un archivo crítico
**Cuando** Rodolfo recibe la solicitud de confirmación y pulsa "Rechazar ❌"
**Entonces** el sistema debe:

1. Devolver un mensaje al Agente indicando: "Acción rechazada por el usuario (Seguridad)".
2. El Agente debe procesar este rechazo como una restricción y buscar una vía alternativa para completar su tarea (o informarlo).

## Reglas de Negocio Relacionadas

- **Interactive State Map**: El sistema debe mantener un mapa de promesas pendientes para permitir que el bot responda a otros eventos mientras espera la confirmación.
- **Sensitive Tools List**: La lista de herramientas que requieren confirmación es gestionada de forma centralizada en el `AgentLoop`.

## Prioridad

**Must-Have**: Es la salvaguarda principal contra la autonomía descontrolada del agente.
