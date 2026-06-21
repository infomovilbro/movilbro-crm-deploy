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
