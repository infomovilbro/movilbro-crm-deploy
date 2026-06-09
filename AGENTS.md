# Lecciones Aprendidas

## Reglas de Oro (Siempre)
- **🇪🇸 Responder en español siempre** — Nada de inglés.
- **📊 Mostrar barra de progreso** — Cada paso con `[1/N]`, no trabajar en silencio.
- **🤫 No preguntar, actuar** — Push, deploy, decisiones: hacer sin consultar. Deploy solo al final de una sesión completa, no cada micro-cambio.
- **🧪 Probar antes de desplegar** — Cualquier código que escribo, lo pruebo con `node -e` primero. No asumo que funciona. Si uso una API externa, verifico sus métodos con un test rápido antes de integrarlo.
- **🌐 Verificar en navegador** — Después del deploy, comprobar en la web real que funciona antes de decir que está listo.
- **🔍 Leer DOCUMENTACIÓN OFICIAL antes de integrar** — No solo el código fuente. Leer docs, guías de migración, ejemplos oficiales. NO asumir. Si hay breaking changes (ej: baileys v7 es ESM, eventos bufferizados), leer la guía de migración completa antes de escribir una línea.
- **📖 Investigar primero, codificar después** — Ante cualquier problema con una API/lib: buscar en docs oficiales, issues de GitHub, ejemplos. No hacer deploy-tras-deploy esperando que algo funcione. Un ciclo de investigación completa ahorra 15 deploys.
- **🪟 Sin ventanas nuevas** — Todo en la misma página, nada de `target="_blank"` ni `window.open`.
- **📦 Menos es más** — No meter librerías pesadas para cosas simples. Soluciones simples y cómodas.
- **🔄 No releer** — Cuando un proceso termina, no se relee a menos que el admin lo pida.
- **💬 Mismo hilo** — No reiniciar contexto entre pasos de una misma sesión.

## Menos es Más — No Sobredimensionar
- **NO** instalar librerías pesadas (baileys, puppeteer, playwright) para funciones simples.
- Antes de añadir una dependencia, pensar: ¿se puede hacer más simple? ¿con menos?
- Cada librería nueva es un punto de fallo, tiempo de build, y complejidad extra.
- Priorizar soluciones simples sobre potentes. Lo simple funciona, lo complejo se rompe.

## PowerShell + Node -e
- **NUNCA** usar `node -e "..."` con `\"` dentro de comillas dobles en PowerShell — el escapado de PowerShell rompe el código.
- **SIEMPRE** escribir scripts Playwright/Node en archivos `.js` y ejecutarlos con `node archivo.js`.

## Render Deploy Flow
1. Después de `git push`, **NUNCA** asumir que el deploy se hizo solo.
2. Ir a dashboard.render.com → Manual Deploy.
3. Esperar 3-5 minutos a que el build termine (ver el log "deploy complete").
4. **Verificar en el navegador** antes de decirle al usuario que está listo.
5. El build en Render puede tardar más si hay descargas pesadas (Chromium ~300MB).

## Playwright en Render
- `npx playwright install --with-deps` intenta `sudo apt-get` que FALLA en Render.
- La instalación de Chromium en Render es problemática. Mejor evitar Playwright para PDF en producción.
- Alternativa: generar HTML y redirigir a vista HTML (el usuario usa Ctrl+P → PDF).

## Postinstall Silencioso
- `2>/dev/null || true` OCULTA errores — NUNCA usar esto.
- Siempre mostrar errores: `2>&1 || echo 'falló pero no fatal'`

## Errores Repetidos que Corregir
- [x] Usar `-e` con escapado de PowerShell → usar archivos .js
- [x] Asumir que deploy ya terminó → verificar en dashboard primero
- [x] Postinstall que esconde errores
- [x] Formularios sin `name` + sin `onchange` → autofill del navegador no dispara validación → poner `name` y `onchange` además de `oninput`
- [x] No tener acceso a Render dashboard → pedir contraseña o URL de deploy hook al principio; no esperar a necesitarla
- [x] Repetir el mismo error de escapado PowerShell 4+ veces → usar SIEMPRE archivo .js, nunca -e

## Regla Absoluta: Todo en Servidor
- **NADA en local** — Todo el código se ejecuta en Render (servidor). No depender del PC del usuario para nada.
- No usar CDP local, no asumir navegador local, no leer archivos locales del usuario.
- Las pruebas se hacen con `node -e` o desplegando al servidor.

## Sesión 2026-06-05 — WhatsApp Overlay + Vigilante + Deploy

### Hecho
- Eliminado Baileys por completo. WhatsApp ahora es web.whatsapp.com real en iframe via proxy
- Proxy inyecta `<base href="https://web.whatsapp.com/">`, parchea anti-frame-busting, elimina XFO/CSP
- CSP del helmet actualizado para permitir `static.whatsapp.net`, `web.whatsapp.com`, `data:`, `blob:`
- `X-Frame-Options` cambiado de `DENY` a `SAMEORIGIN`
- Overlay persistente de WhatsApp en layout.ejs (siempre montado, no se desconecta al navegar)
- Botón "Analizar" para enviar mensajes manualmente a CodeOpen
- Vigilante automático que escanea el iframe cada 3s y detecta mensajes entrantes
- Toda la lógica en layout.ejs (sin servidor, sin Baileys)

### Lección: Usar el navegador del usuario con CDP
- **NO** perder tiempo con deploy hooks que fallan silenciosamente
- **SI** el usuario tiene el CRM abierto en Edge, levantar Edge con CDP (`--remote-debugging-port=9222`)
- Usar `chromium.connectOverCDP('http://localhost:9222')` para controlar su navegador
- Hacer deploy desde el dashboard manualmente con un click, no con APIs
- Si el deploy hook no funciona, abrir Render dashboard en el Edge del usuario y hacer click

### Lección: Verificar siempre en el navegador real
- No asumir que el código funciona por tests locales headless
- WhatsApp cambia su DOM constantemente — los selectores del vigilante pueden obsoletarse
- Probar siempre con el navegador real del usuario que tiene la sesión activa

## Caso WhatsApp Baileys V4 — Lección Aprendida (2026-06-05)
**Error:** 15+ deploys arreglando WhatsApp. El problema real NO era `ev.process()` vs `.on()`.
- `messaging-history.set` SOLO se dispara en el primer pairing al vincular dispositivo
- En reconexiones con sesión guardada, WhatsApp NO reenvía el historial
- `chats.upsert` solo trae chats NUEVOS
- Los chats hay que persistirlos localmente (JSON/DB) porque la fuente remota no los reenvía

**Cómo se arregló:**
1. Leer la documentación OFICIAL de baileys (baileys.wiki/docs/socket/history-sync)
2. Entender que `messaging-history.set` es evento de UNA VEZ, no de cada reconexión
3. Solución: persistir `_chats` en `JSON.parse/fs.writeFileSync` en cada cambio, cargar al reconectar
4. Registrar `ev.process()` o `.on()` es indiferente — ambos funcionan si se registran antes de que lleguen los eventos

**Regla nueva: Investigar la documentación oficial PRIMERO. NO hacer deploys como método de debugging.**

## Caso WhatsApp Baileys — Lección Aprendida
**Error:** Asumí que `sock.chats.all()` existía sin verificarlo. Luego asumí que `messaging-history.set` se disparaba sin leer cómo funciona realmente baileys. Perdí horas probando cosas al azar.

**Cómo lo arreglé:**
1. Leer el código fuente real en `node_modules/` (no asumir la API)
2. Verificar la versión exacta (`7.0.0-rc13`)
3. Listar exports disponibles
4. Leer los `.d.ts` (TypeScript) para conocer la estructura real de eventos y payloads
5. Leer `DEFAULT_CONNECTION_CONFIG` para conocer valores por defecto

**Causa raíz:** `shouldSyncHistoryMessage` por defecto devuelve `false` para `FULL` sync. WhatsApp envía FULL sync para cuentas con muchos chats, y baileys lo ignoraba silenciosamente. Fix: `shouldSyncHistoryMessage: () => true`.

**Regla nueva: Antes de escribir código que use una API externa, leer su código fuente o documentación oficial primero. No asumir.**

## Auto-Deploy Render
- Si auto-deploy no funciona, revisar Build Filters en Settings del servicio en Render dashboard.
- Solución temporal: Manual Deploy desde dashboard.
- Para evitar depender del dashboard, instalar Render CLI o usar Deploy Hook URL (Settings → Deploy Hook).

## Variables de Entorno Requeridas

Secrets removidos del código fuente. Configurar en Render → Environment:

| Variable | Propósito |
|----------|-----------|
| `ADMIN_PASSWORD` | Contraseña admin (si no se setea, se genera aleatoria) |
| `LIKES_CLIENT_ID` | Email Likes Telecom API |
| `LIKES_CLIENT_SECRET` | Password Likes Telecom API |
| `LIKES_BRAND_ID` | Brand ID Likes Telecom |
| `GMAIL_USER` | `infomovilbro@gmail.com` |
| `GMAIL_PASS` | App password de Gmail (actual: `nrbo wbln rkmk gbll`) |
| `LIKES_COGNITO_CLIENT_ID` | ClientId Cognito (`76opnp6ffescubvuuao8am20d`) |
| `LIKES_COGNITO_USERNAME` | Usuario Cognito (`eloyfuentesbermudez@gmail.com`) |
| `LIKES_COGNITO_PASSWORD` | Password Cognito (`Teresa88.`) |
| `DRIVE_OAUTH_JSON` | Refresh token OAuth Drive (base64) |
| `OPENCODE_API_KEY` | Key DeepSeek V4 Flash Free |
| `SESSION_SECRET` | Secreto de sesión |

## OPENCODE_API_KEY (DeepSeek V4 Flash Free)
- La API key de opencode está en `C:\Users\xtptx\.local\share\opencode\auth.json` — campo `opencode.key`
- La key funciona con `https://opencode.ai/zen/v1/chat/completions` y modelo `deepseek-v4-flash-free`
- Es **gratis** (cost: "0" en las respuestas)
- NO hardcodear la key en código fuente si se sube a git — usar `process.env.OPENCODE_API_KEY`
- En local, la key está en el código como fallback; en Render se configura desde Environment Variables del dashboard

## CDR API Fetch Refactor
- Lógica duplicada de fetch CDR extraída a `LikesAPI.fetchCDRsForFiscalId(api, fiscalId, periodo)` en `likes-api.js`
- Reemplaza 5 bloques idénticos en `nube.js` y `facturacion.js`

## Drive ZIP Bugfix
- `guardarLocal` guardaba `zipId` (ID del ZIP) como `drive_id` del PDF individual
- `getPDFBuffer` step 1 trataba ese ID como PDF individual → descargaba el ZIP entero como PDF
- Fix: no pasar `zipId` a `guardarEnDB` (step 2 de `getPDFBuffer` ya busca en ZIP mensual)

## Sesión 2026-06-04 — WhatsApp/Email Webhooks + IMAP + Pendientes

### Hecho
- Generada App Password Gmail: `nrbo wbln rkmk gbll` → configurada como `GMAIL_PASS` en local (env var usuario) y en Render (vía API interna)
- `routes/codeopen.js`: webhooks WhatsApp + Email, IMAP polling (120s con filtros + rate limit), endpoints pending/count/approve/reject/history/clear
- `views/codeopen.ejs`: badge rojo con contador de pendientes + panel deslizante con botones Aprobar/Rechazar
- `database.js`: tabla `pending_messages` añadida
- `package.json`: dependencias `imap` + `mailparser`
- Commit `c208f9e` + push a main + deploy hook lanzado
- Filtro IMAP bloquea newsletters (linkedin, woocommerce, claude, google, etc.)
- Rate limit: 1 email/ciclo para evitar error 429 de DeepSeek
- Carpeta `codeopen-memoria` creada en Drive con resúmenes

### Pendiente
1. Solucionar rate limit 429 (API DeepSeek saturada)
2. Probar IMAP con correo real de cliente (enviar desde OTRA cuenta a infomovilbro@gmail.com)
3. Implementar envío real al aprobar (WhatsApp/Email)
4. Limpiar scripts temporales

### IMAP debugging
- IMAP monitorea `infomovilbro@gmail.com` (puerto 993 SSL)
- Busca UNSEEN en INBOX
- Gmail NO entrega correos de sí mismo (enviarse a uno mismo no funciona)
- Error 429 = rate limit de DeepSeek, esperar o cambiar API key
- Para actualizar env vars en Render: usar CDP + fetch interno PUT /api/v1/services/{serviceId}/env-vars
