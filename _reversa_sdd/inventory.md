# Inventario del Proyecto — Opengravity

## Información General
- **Nombre:** Opengravity
- **Descripción:** Agente de IA personal seguro que se comunica por Telegram.
- **Lenguaje Principal:** TypeScript (Node.js)
- **Marco de Trabajo:** Grammy (Telegram), Model Context Protocol (MCP)

## Estructura de Módulos (Identificados)
- `src/`: Núcleo de la aplicación.
    - `agent/`: Motores de razonamiento y lógica del agente.
    - `bot/`: Implementación de la interfaz de Telegram.
    - `memory/`: Gestión de persistencia local.
    - `config/`: Configuraciones de la aplicación.
- `trendradar/`: Integración de servidor MCP para búsqueda y tendencias (vía Python/Node).
- `OpengravityApp/`: Aplicación móvil desarrollada en React Native.
- `superpowers/`: Prompts y habilidades (skills) para el agente.
- `dataconnect/`: Configuración de Firebase Data Connect.
- `scripts/`: Herramientas de depuración y pruebas.

## Puntos de Entrada
- **Backend:** `src/index.ts`
- **Frontend (Móvil):** `OpengravityApp/` (React Native)
- **Herramientas:** `main.py` (Script de utilidad en la raíz)

## Entorno y Despliegue
- **Firebase:** `firebase.json`, `firestore.rules`, `firestore.indexes.json`.
- **Docker:** `Dockerfile`, `.dockerignore`.
- **CI/CD:** `render.yaml` (Probable despliegue en Render.com).
- **Configuración:** `.env`, `.firebaserc`.

## Bases de Datos
- **Local:** `memory.db` (SQLite via `better-sqlite3`).
- **Nube:** Firestore (Firebase).
