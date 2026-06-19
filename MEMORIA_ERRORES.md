# MEMORIA DE ERRORES Y SOLUCIONES — CRM Movilbro

> Este archivo se actualiza CADA VEZ que se descubre y corrige un error.
> Leer AL INICIAR cada sesión para no repetir errores pasados.

---

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

## Reglas grabadas a fuego
1. **NUNCA** `node -e "..."` con PowerShell
2. **NUNCA** asumir que deploy se completó solo
3. **SIEMPRE** verificar en navegador real
4. **SIEMPRE** leer documentación oficial antes de integrar APIs
5. **Replit Shell**: usar evaluate() con eventos nativos, no keyboard.type()
6. **No hacer deploy-tras-deploy** como debugging — investigar primero
