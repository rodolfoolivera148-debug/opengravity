# Diagramas de Flujo — Módulo `agent`

## Orquestación e Inicialización
Este flujo describe el arranque del sistema y la carga del ecosistema de herramientas.

```mermaid
graph TD
    Start([Inicio src/index.ts]) --> InitEnv[Cargar .env]
    InitEnv --> InitFirebase[Inicializar Firebase Admin]
    InitFirebase --> InitMCP[Inicializar McpClient]
    
    subgraph McpInitialization [Ecosistema MCP]
        InitMCP --> GetRemote[Consultar Firestore mcp_remote]
        GetRemote --> LoopServers{Para cada servidor en SERVERS}
        LoopServers --> Connect[Establecer Stdio/SSE]
        Connect --> ListTools[Listar Herramientas del Servidor]
        ListTools --> Sanitize[Sanitizar y Prefijar Herramientas]
        Sanitize --> Unified[Añadir a unifiedTools]
        Unified --> LoopServers
    end
    
    InitMCP --> StartBot[Iniciar Telegram Bot - Polling/Webhook]
    StartBot --> WaitMsg[/Esperar mensaje de Rodolfo/]
    WaitMsg --> RunLoop[Llamar runAgentLoop]
```

## Ejecución de Herramientas (executeTool)

```mermaid
graph TD
    Entry([Llamada a executeTool]) --> IsLocal{¿Es herramienta local?}
    
    IsLocal -- Sí --> SwitchLocal{Switch name}
    SwitchLocal -- write_file --> FS[Escritura en Disco]
    SwitchLocal -- gogcli --> GOG[Exec gog.exe]
    SwitchLocal -- terminal --> SHELL[Exec Shell Command]
    
    IsLocal -- No --> IsMCP{¿Es MCP?}
    IsMCP -- Sí --> Interceptor{¿Es TrendRadar?}
    
    Interceptor -- Sí --> FixArgs[Traducir ES->EN, limpiar alucinaciones]
    FixArgs --> CallTR[Llamar a CallTool]
    CallTR --> FormatMD[Convertir JSON a Markdown]
    
    Interceptor -- No --> CallStd[Llamar a CallTool estándar]
    
    FS --> Return[Retornar Resultado]
    GOG --> Return
    SHELL --> Return
    FormatMD --> Return
    CallStd --> Return
```
