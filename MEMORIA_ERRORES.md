# MEMORIA DE ERRORES Y SOLUCIONES — CRM Movilbro

> Este archivo se actualiza CADA VEZ que se descubre y corrige un error.
> Leer AL INICIAR cada sesión para no repetir errores pasados.

---

## [2026-06-20] debug-login — ruta insegura sin autenticación
**Error:** Creé una ruta `/debug-login` que logueaba sin contraseña.
**Lección: NUNCA crear backdoors de seguridad.**

## [2026-06-20] Deploy a Replit — flujo rápido
**Problema:** Intentar escribir en el Shell de Replit via CDP es poco fiable.
**Solución definitiva (para futuros cambios):**
1. **Local:** `deploy.bat` (doble click) → add + commit + push
2. **Replit Shell:** `bash deploy.sh` → git fetch + reset + restart
3. Esperar 10s y listo

**Nota:** `deploy.sh` solo funciona después del primer `git pull` que lo traiga.
**Comando manual si no existe deploy.sh:**
```
git fetch --all && git reset --hard origin/main && pkill -9 -f node; sleep 2; node server.js
```

## [2026-06-20] Replit Shell — CDP typing es poco fiable
**Error:** Intenté 5+ scripts diferentes para escribir en Replit Shell via CDP (evaluate, keyboard.type, insertText, InputEvent). El texto se escribía pero el comando no se ejecutaba correctamente y el servidor no arrancaba.
**Causa:** xterm.js en Replit recibe eventos de teclado de forma compleja. La simulación via CDP no es 100% fiable. Además, el force push hace que `git pull` falle (historias divergen).
**Solución (la real):**
1. Cambiar el default port en `server.js` de 3005 a **5000** (hecho)
2. Actualizar `.replit` a formato `[workflows]` para que el botón Run aparezca (hecho)
3. Pushear a GitHub (hecho)
4. **Pedir al usuario que ejecute en Replit Shell:**
   ```
   git fetch --all && git reset --hard origin/main && node server.js
   ```
5. O mejor: no depender del shell. Modificar el código para que funcione sin comandos manuales.

**Lección grabada a fuego: NO usar CDP para escribir en Replit Shell.** Es poco fiable y lento. En su lugar:
- Modificar el código directamente (default port, .replit correcto)
- Pushear a GitHub
- Pedir al usuario que pegue el comando en Shell
- O usar la API de Replit / botón Run

---

## [2026-06-05] WhatsApp Baileys — messaging-history.set solo se dispara una vez
**Error:** 15+ deploys arreglando WhatsApp. El problema NO era `ev.process()` vs `.on()`.
**Causa:** `messaging-history.set` SOLO se dispara en el primer pairing. En reconexiones con sesión guardada, WhatsApp NO reenvía el historial.
**Solución:** Persistir `_chats` en JSON/DB en cada cambio, cargar al reconectar.

---

## [2026-06-05] WhatsApp Baileys — shouldSyncHistoryMessage false por defecto
**Error:** Asumí que `sock.chats.all()` existía. Perdí horas.
**Causa:** `shouldSyncHistoryMessage` devuelve `false` para FULL sync por defecto.
**Solución:** `shouldSyncHistoryMessage: () => true`

---

## [2026-06-05] Drive ZIP — ZipId usado como drive_id del PDF
**Error:** `guardarLocal` guardaba `zipId` (ID del ZIP) como `drive_id` del PDF individual. `getPDFBuffer` descargaba el ZIP entero como PDF.
**Solución:** No pasar `zipId` a `guardarEnDB`.

---

## [2026-06-04] PowerShell — node -e con escapado de comillas
**Error:** Usar `node -e "..."` con `\"` dentro de PowerShell rompe el código.
**Solución:** SIEMPRE escribir scripts en archivos `.js` y ejecutar con `node archivo.js`.

---

## [2026-06-04] Formularios — autofill no dispara validación
**Error:** Formularios sin `name` + sin `onchange` → autofill del navegador no dispara validación.
**Solución:** Poner `name` y `onchange` además de `oninput`.

---

## [2026-06-04] Postinstall — 2>/dev/null || true esconde errores
**Error:** Usar `2>/dev/null || true` OCULTA errores.
**Solución:** Siempre mostrar errores: `2>&1 || echo 'falló pero no fatal'`

---

## [2026-06-04] Playwright en Render — install falla con sudo
**Error:** `npx playwright install --with-deps` intenta `sudo apt-get` que FALLA en Render.
**Solución:** Evitar Playwright para PDF en producción. Generar HTML + Ctrl+P.

---

## [2026-06-04] Deploy — asumir que auto-deploy funciona
**Error:** Después de `git push`, asumir que el deploy se hizo solo.
**Solución:** Ir a dashboard.render.com → Manual Deploy. Verificar en navegador después.

---

---

## [2026-06-21] Likes API — hardcoded fallback eliminado (CRM roto en entornos nuevos)
**Error:** El commit `6be3fb8` eliminó las credenciales hardcodeadas del constructor de `LikesAPI`. El flujo quedó: `env vars → settings DB → string vacío`. En entornos sin env vars (deploy nuevo, Render sin configurar, etc.) la API no autenticaba.
**Causa:** Se asumió que las env vars SIEMPRE estarían configuradas, pero en un deploy nuevo la DB se llena con strings vacíos y no hay fallback.
**Solución:** Poner las credenciales hardcodeadas como **último fallback** en el constructor, después de `config` y `process.env`:
```
this.email = config.email || process.env.LIKES_CLIENT_ID || 'eloyfuentesbermudez@gmail.com';
this.password = config.password || process.env.LIKES_CLIENT_SECRET || 'Teresa88.';
this.brandId = config.brandId || process.env.LIKES_BRAND_ID || '264';
```
**Lección: NUNCA eliminar el hardcoded fallback.** La prioridad es: `env vars → settings DB → hardcoded`. El hardcoded es el salvavidas para cualquier entorno.

## [2026-06-21] api-proxy.js — variable creds undefined
**Error:** La ruta `routes/api-proxy.js` usaba la variable `creds` en toda la lógica (para `brandId`, `apiUrl`, etc.) pero `creds` NUNCA se asignaba. La función `getApiFromDb()` que debía crearla existía pero jamás se llamaba. Cualquier request a `/api-proxy/*` cascaba con `ReferenceError: creds is not defined`.
**Solución:** Eliminar `getApiFromDb()` y reemplazar todas las referencias a `creds.*` por `api.*` (usando la instancia real de `LikesAPI` que ya tiene `brandId` y `apiUrl`).
**Lección: NO crear funciones helpers que no se llaman. Si una variable se usa en toda una ruta, asegurarse de que está asignada.**

## [2026-06-21] 6 rutas crean new LikesAPI() directo sin getApiInstance()
**Error:** `subscriptions.js`, `api.js`, `kyc.js`, `tickets.js`, `stats.js` tenían su propio `getApi()` que leía solo de settings DB, ignorando env vars. El hardcoded fallback del constructor las cubre, pero si en el futuro se quita el hardcoded, volverán a fallar.
**Solución implementada:** El constructor ahora tiene hardcoded fallback que cubre todos los casos.
**Lección: Usar SIEMPRE `LikesAPI.getApiInstance()` en lugar de crear `new LikesAPI()` directo.**

---

## Reglas grabadas a fuego
1. **NUNCA** `node -e "..."` con PowerShell
2. **NUNCA** asumir que deploy se completó solo
3. **SIEMPRE** verificar en navegador real
4. **SIEMPRE** leer documentación oficial antes de integrar APIs
5. **Replit Shell**: no usar CDP — pedir al usuario que pegue el comando
6. **No hacer deploy-tras-deploy** como debugging — investigar primero
7. **NUNCA crear rutas de login sin contraseña** — usar auth real
8. **NUNCA crear scripts locales** — todo servidor, nada en PC del usuario
9. **SIEMPRE verificar sintaxis** con `node -e "require('./archivo')"` antes de push
10. **SIEMPRE poner `async`** en route handlers que usen `await`
11. **NADA en local** — no asumir CDP, no leer archivos locales, no crear .bat/.ps1
12. **NUNCA eliminar hardcoded fallback de credenciales** — la prioridad es `env vars → settings DB → hardcoded`. El hardcoded es el salvavidas para cualquier entorno.
13. **Usar SIEMPRE `getApiInstance()`** — no crear `new LikesAPI()` directo desde settings. La instancia global ya maneja env vars + DB + hardcoded.
14. **CUALQUIER variable EJS dentro de `<script>` tag → SIEMPRE con comillas:** `<%= var %>` → `'<%= var %>'` o `<%- JSON.stringify(var) %>`. El caso más crítico es `_cid` (fiscal ID) porque un DNI numérico (`74800315Z`) rompe todo el JS inline.
15. **LOS FILTROS `<select>` necesitan `data-*`** en los elementos a filtrar. Sin `data-estado` o similar en el HTML, el JS `querySelectorAll('[data-estado]')` no encuentra nada.
16. **NO hacer server-side skip en EJS para filtering** — `if (est === 'terminada') return;` en EJS impide que el filtro JS del cliente pueda mostrar esas líneas después.
17. **UN SOLO COMMIT = UN SOLO DEPLOY.** No separar fix y docs. AGENTS.md + MEMORIA_ERRORES.md + código → todo en el mismo commit. Push una vez a master para un solo deploy. Si hay cambios docs después del fix, esperar al próximo batch.
18. **NO push a ambos branches (main + master).** Push SOLO a master: `git push origin master:master`. Cada push = 1 build. Push a main + master = 2 builds = doble de minutos gastados. Master es la rama de deploy, main se queda atrás y no importa.

## [2026-07-14] _cid sin comillas en script — SyntaxError bloquea TODO el JS inline en clientes con DNI numérico
**Error:** El fiscal ID (`_cid`) se renderizaba sin comillas dentro de etiquetas `<script>` en `view.ejs`.
Para clientes con DNI que empieza con dígito (ej: `74800315Z`), el JavaScript interpretaba el valor como
identifier inválido → **SyntaxError** → **todo el bloque inline de ~60KB se descartaba**.
Para clientes con NIF que empieza con letra (ej: `X8365586A`) funcionaba porque `X` es letra.

**Afectaba a 189 clientes:** PIN/PUK, selector de líneas, scoring, consumo, loadNubeInvoices,
cambiarPagoLinea, guardarIBAN — todo muerto.

**Causa:** `<%= _cid %>` en 4 lugares dentro de `<script>` tags sin comillas:
- `guardarIBAN(<%= _cid %>)` → `guardarIBAN(74800315Z)` → SyntaxError
- `loadNubeInvoices(<%= _cid %>)` → `loadNubeInvoices(74800315Z)` → SyntaxError
- `fetch('/clientes/' + <%= _cid %> + '/line/'` → `'/clientes/' + 74800315Z` → SyntaxError

**Reglas nuevas:**
1. Cualquier `<%= variable %>` dentro de `<script>` tag → SIEMPRE con comillas: `'<%= variable %>'` o `<%- JSON.stringify(variable) %>`
2. `_cid` (fiscal ID) es el más crítico porque varía por cliente (NIF letra vs DNI número)
3. Siempre probar con al menos DOS tipos de cliente antes de commitear cambios en `view.ejs`
4. Los filtros `<select>` necesitan `data-estado` en los elementos a filtrar — sin `data-*` no hay nada que ocultar
5. Server-side `if (cond) return;` en EJS impide client-side filtering — si no se renderiza, no se puede filtrar

**Solución:** `guardarIBAN('<%= _cid %>')`, `loadNubeInvoices('<%= _cid %>')`, `fetch('/clientes/' + '<%= _cid %>' + '/line/'`

---

## [2026-07-03] QR WhatsApp roto 6 VECES por duplicación de rutas + formato incorrecto
**Error:** Hay DOS endpoints `/codeopen/baileys-qr` — uno público en `server.js` y otro protegido en `routes/codeopen.js`. El público se registra primero y gana. El frontend espera `{status: {connected, state, hasQR, error}, qr: dataURL}` pero el público devolvía `getStatus()` directo (sin wrapper `status`).
**Regla ABSOLUTA (NUNCA ROMPER):**
1. **NO TOCAR** los endpoints QR en `server.js` (línea ~379) ni en `codeopen.ejs` — ni el formato, ni los nombres, ni nada. Preguntar al admin.
2. **NO crear** rutas QR duplicadas. Las de `routes/codeopen.js` están eliminadas.
3. **NO modificar** `pollWAStatus()` en `codeopen.ejs` — el frontend espera `{status: {connected, state, hasQR, error}}`.
4. **NO asumir** que el QR funciona solo porque `hasQR: true`. Verificar en el DOM real con `page.evaluate()` que waQRImage tenga `naturalWidth > 0` y `complete: true`.
5. **NO commitear** código QR sin verificar el flujo completo: endpoint → frontend → imagen renderizada.

## [2026-08-04] Tab-panes ANIDADOS dentro de #info - bug visual invisible en test

### S�ntoma
- El usuario pulsa los tabs (Instalaciones, �rdenes, etc.) y ve VAC�O, aunque el c�digo tenga contenido.
- Los tests con page.evaluate() (leer innerHTML) NO detectaban el problema: el HTML exist�a, pero estaba OCULTO visualmente.

### Causa ra�z
- En iews/clients/view.ejs, el <div class="tab-pane" id="info"> NUNCA se cerraba con </div>.
- Por eso #lineas, #ordenes, #facturas, #instalaciones, #kyc, #contrato quedaban ANIDADOS DENTRO de #info.
- Cuando el handler de tabs quitaba ctive a #info, �ste quedaba display:none, y TODOS los panes hijos se ocultaban tambi�n.
- offsetParent === null en el pane = no visible visualmente (aunque display:block y getComputedStyle digan block).

### Fix
- A�adir el </div> que cierra #info antes de abrir #lineas.

### C�MO DETECTARLO (regla para el futuro)
- NO basta con page.evaluate(() => el.innerHTML).
- SIEMPRE verificar el.offsetParent !== null (visible real) Y el.getBoundingClientRect().height > 0.
- Comprobar que cada .tab-pane es HIJO DIRECTO de .tab-content (hermanos entre s�).
- Hacer click real (playwright click) + snapshot, no solo .click() por JS.

### Verificaci�n
- git show 3162c30 = el fix del cierre del div.
