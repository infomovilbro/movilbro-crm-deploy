# MEMORIA CRM MOVILBRO — Pegar en sesión nueva

## Ubicación
- Código: `C:\Users\xtptx\Desktop\2006\`
- GitHub: `https://github.com/infomovilbro/movilbro-crm-deploy`
- Render (prod): `https://movilbro-crm.onrender.com` (sin builds, deploy manual desde dashboard)
- Replit: `https://replit.com/@infomovilbro/movilbro-crm-deploy`
- **Replit Preview (ACTUAL):** `https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev`

## Puerto 5000 OBLIGATORIO
- `server.js` línea 69: `PORT = process.env.PORT || 3005` → por defecto 3005
- **Replit SOLO muestra preview en puerto 5000**. Arrancar con:
  - Shell: `PORT=5000 node server.js`
  - O crear Workflow en Replit con comando `PORT=5000 node server.js`
- `.replit` actual es formato ANTIGUO (no tiene `[workflows]`). Si la UI nueva de Replit no muestra botón Run, falta el workflow.

## Cómo arrancar
```bash
cd /home/runner/workspace && git pull && PORT=5000 node server.js
```
O desde PowerShell local:
```powershell
cd C:\Users\xtptx\Desktop\2006; $env:PORT=5000; node server.js
```

## CDP — Navegador del usuario
```js
const { chromium } = require('playwright');
var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
var ctx = b.contexts()[0];
var page = ctx.pages()[0];
```
Si no hay CDP activo:
```powershell
Start-Process msedge --remote-debugging-port=9222 --new-window URL
```

## Credenciales
| Variable | Valor |
|----------|-------|
| CRM Login | `info@movilbro.com` / pass aleatoria al arrancar (usar `/setup-key?key=adminpass`) |
| Likes API | Usuario: `eloyfuentesbermudez@gmail.com` / Pass: `Teresa88.` / BrandID: `264` |
| Gmail | `infomovilbro@gmail.com` / AppPass: `nrbo wbln rkmk gbll` |
| Cognito | ClientId: `76opnp6ffescubvuuao8am20d` / User: `eloyfuentesbermudez@gmail.com` / Pass: `Teresa88.` |
| OpenCode API | Key en `C:\Users\xtptx\.local\share\opencode\auth.json` campo `opencode.key` |
| Drive | Service Account en `.opencode/drive-key.json` |

## Estructura del proyecto
- `server.js` — Entry point Express (puerto 3005 / 5000)
- `routes/` — Controladores: `isp.js`, `tienda.js`, `codeopen.js`, `portal.js`, etc.
- `views/` — Vistas EJS con layout principal `views/layout.ejs`
- `database.js` — SQLite (`better-sqlite3`) con migraciones
- `likes-api.js` — API Likes Telecom (fetch CDRs, auth, etc.)
- `helpers/` — Utilidades (Drive, PDF, facturación)
- `services/` — Servicios (IMAP, WhatsApp overlay)
- `middleware/` — Auth, validación
- `public/` — Estáticos (CSS, JS, iconos)

## Reglas de oro
1. 🇪🇸 Responder en español siempre
2. 🤫 No preguntar, actuar — hacer sin consultar
3. 🧪 Probar con `node -e` o `node archivo.js` antes de integrar (NUNCA `node -e "..."` con PowerShell — escapado roto)
4. 🌐 Verificar en navegador real después del deploy
5. 🔍 Leer documentación OFICIAL antes de integrar APIs
6. 📦 Menos es más — no meter librerías pesadas para cosas simples
7. 🪟 Sin `target="_blank"` ni `window.open` — todo en misma página
8. 🔄 No releer a menos que el admin lo pida

## Módulos del CRM
- **ISP** — Panel, Facturación, CDRs, Nube, Contratos, Portabilidades, Incidencias
- **Tienda/POS** — Caja, Agenda, Inventario, Presupuestos, Prepago, Plantilla, Cierres
- **CodeOpen AI** — Webhooks WhatsApp+Email, IMAP polling cada 120s, pendientes con badge rojo, aprobar/rechazar
- **WhatsApp Overlay** — iframe persistente de web.whatsapp.com via proxy, vigilante cada 3s, botón Analizar
- **Portal Cliente** — Portal de usuarios

## Flujo de trabajo (Replit)
1. Editar código en local
2. `deploy.bat` (doble click) → git add + commit + push
3. En Replit Shell: `bash deploy.sh` → git fetch + reset + restart
4. Esperar 10s, verificar en navegador

## Flujo de trabajo (Render)
1. `git push origin version-render:main --force`
2. Ir a dashboard.render.com → Manual Deploy
3. Esperar build 3-5 min, verificar en navegador

## Lecciones clave aprendidas
- WhatsApp Baileys: `messaging-history.set` SOLO se dispara en primer pairing. Persistir chats localmente.
- Baileys: `shouldSyncHistoryMessage: () => true` necesario para FULL sync.
- Drive ZIP: no pasar `zipId` como `drive_id` del PDF (el ZIP no es un PDF).
- Playwright en Render: falla porque `playwright install --with-deps` requiere sudo. Alternativa: generar HTML + Ctrl+P.
- IMAP: Gmail no entrega correos de sí mismo. Rate limit 429 de DeepSeek — 1 email/ciclo.
- Formularios: necesitan `name` + `onchange` además de `oninput` para que autofill del navegador dispare validación.
- Postinstall: NUNCA usar `2>/dev/null || true` — esconde errores.
