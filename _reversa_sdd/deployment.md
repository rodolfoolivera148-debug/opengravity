# Guía de Despliegue e Infraestructura — Opengravity

Opengravity está diseñado para ser "Nube-Nativo" y agnóstico al hardware del usuario, operando como un servicio de backend siempre encendido.

## Infraestructura en la Nube (Render)

El sistema se despliega actualmente en **Render.com** mediante integración continua con GitHub.

### Configuración del Servicio

- **Tipo**: Web Service
- **Entorno**: Node.js
- **Health Checks**: El sistema arranca un servidor Express mínimo en el `PORT` (3000 por defecto) para permitir la supervisión de Render.

### Variables de Entorno Críticas

| Variable | Propósito |
| :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | Identidad del bot en Telegram. |
| `TELEGRAM_ALLOWED_USER_IDS` | Lista blanca de seguridad. |
| `GROQ_API_KEY` | Motor de inferencia primario. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Credenciales para Firestore. |
| `WEBHOOK_URL` | URL pública para recibir eventos de Telegram. |

## Contenedorización (Docker)

El `Dockerfile` en la raíz permite empaquetar el sistema de forma portable.

```dockerfile
# Resumen del proceso de build
1. Base: node:20-slim
2. Instalación de dependencias (npm install)
3. Compilación de TypeScript (npm run build)
4. Ejecución del servidor
```

## Persistencia de Herramientas (gogcli)

Opengravity utiliza un binario compilado (`gog.exe`) para interactuar con Google Workspace.

- **Local**: Se asume que el binario está en la raíz.
- **Nube**: Se requiere que el binario sea parte del artefacto de despliegue o se descargue durante el build.
