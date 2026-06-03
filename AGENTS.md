# Lecciones Aprendidas

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
| `GMAIL_PASS` | App password de Gmail |
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
