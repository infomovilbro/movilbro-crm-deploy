# CRM Movilbro — Resumen Completo del Proyecto

## Stack
- **Backend:** Node.js + Express, SQLite (better-sqlite3), EJS templates
- **Hosting:** Render free tier (512 MB RAM, 1 GB disco)
- **Frontend:** Bootstrap 5, jQuery, EJS views con sidebar layout
- **PDF:** Playwright (generación), Google Drive API (almacenamiento)
- **AI Chat:** OpenCode API (`https://opencode.ai/zen/v1/chat/completions`, modelo `deepseek-v4-flash-free`, **gratis**)

## Contexto
CRM autogestionado para operador móvil virtual (OMV) que revende Likes Telecom. Gestiona clientes, facturación, CDRs, y pedidos. Originalmente clonado de un proyecto Django, migrado a Node.js + SQLite.

## Directorios Clave
- `routes/` — Express routers (isp/nube.js, isp/facturacion.js, altas.js, codeopen.js, etc.)
- `views/` — EJS templates
- `helpers/` — Lógica de negocio (nube.js, drive.js, sincronizacion.js, etc.)
- `nube/` — PDFs locales (se borran tras subir a Drive para ahorrar disco)
- `.opencode/` — Config local (drive-key.json, render-hook.txt)
- `public/` — CSS/JS estáticos

## Base de Datos (SQLite: movilbro.db)
Tablas principales:
- `users` — login del sistema
- `clients` — clientes con datos fiscales
- `products` — productos/servicios
- `orders` — pedidos a Likes Telecom
- `subscriptions` — líneas/suscripciones activas
- `isp_facturas` + `isp_facturas_lineas` — facturación
- `isp_cdrs` — CDRs (registros de llamadas/datos)
- `isp_llamadas` — llamadas detalladas
- `archivos` — PDFs con columna drive_id (enlace a Google Drive)
- `chat_history` — historial de /codeopen por sesión
- `shared_context` — hechos globales compartidos entre CLI y CRM

## API Likes Telecom
- Endpoints para clientes, pedidos, suscripciones, CDRs
- Autenticación vía token (en isp/altas.js)
- Sincronización automática cada 40 min + botón "Sync now"

## Google Drive Integration
- **Service Account:** `crm-movilbro-drive@certain-art-498222-h8.iam.gserviceaccount.com`
- **Key File:** `.opencode/drive-key.json`
- **Root Folder ID:** `1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx`
- **Estructura:** `nube/{año}/{Mes}/Factura-{serie}-{numero}.pdf`
- **Flujo:** generar PDF → guardar en Drive → borrar local → servir desde Drive

## /codeopen AI Chat
- Ruta: `routes/codeopen.js`, Vista: `views/codeopen.ejs`
- API primaria: OpenCode API (gratis, DeepSeek V4 Flash Free)
- API key: `process.env.OPENCODE_API_KEY` (configurada en Render como env var)
- Endpoint: `https://opencode.ai/zen/v1/chat/completions`
- Memoria compartida: `chat_history` (por sesión) + `shared_context` (global)
- Sistema multi-agente (Orion, Nova, Kronos, Atlas, Ether) para respuestas complejas

## Estado del Disco (~700 MB usado de 1 GB)
- `node_modules/`: ~300 MB
- `nube/`: ~273 MB (se vaciará con Drive)
- `.git/`: ~60 MB
- Código/DB: ~30 MB

## Pendientes
1. Cambiar modelo de /codeopen (el usuario va a decidir cuál)
2. Compartir carpeta Drive con service account ✅ (hecho)
3. Verificar deploy en Render
4. Implementar ZIP para descargas desde Drive (baja prioridad)
5. Fix camera-capture.js (línea 31 rota, rompe dev mode)

## URLs Útiles
- Render Dashboard: https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680
- Render Deploy Hook: `https://api.render.com/deploy/srv-d87dr3mq1p3s73b3a680?key=5k-d_2_3YAs`
- Google Drive Root: `https://drive.google.com/drive/u/0/folders/1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx`
- OpenCode API: `https://opencode.ai/zen/v1/chat/completions` (model: `deepseek-v4-flash-free`)
- Render Service ID: `srv-d87dr3mq1p3s73b3a680`
- Render API Key: `rnd_HSHzUuGEG7Uh8aIfISbU0MyacXP5`
