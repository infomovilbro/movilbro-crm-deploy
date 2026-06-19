# MEMORIA DE ERRORES Y SOLUCIONES — CRM Movilbro

> Este archivo se actualiza CADA VEZ que se descubre y corrige un error.
> Leer AL INICIAR cada sesión para no repetir errores pasados.

---

## [2026-06-20] Replit Shell — CDP no escribía en el textarea correcto
**Error:** Al usar `page.keyboard.type()` o `page.keyboard.insertText()` en el textarea `.xterm-helper-textarea`, el texto aparecía pero el Enter no se ejecutaba.
**Causa:** xterm.js usa un textarea oculto que captura eventos keydown. `keyboard.press('Enter')` no siempre dispara el evento correcto porque el foco se pierde.
**Solución:**
1. Primero hacer click en el tab "Shell" explícitamente
2. Ctrl+C para cancelar cualquier comando corriendo
3. Focus en `.xterm-helper-textarea`
4. Escribir con `evaluate()` seteando `ta.value` + dispatchear `new Event('input', {bubbles: true})`
5. Para Enter: dispatchear `new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles: true})`
6. Verificar que el textarea quedó vacío (señal de que se procesó)

**Lección:** No usar `keyboard.type()` ni `keyboard.press('Enter')` en Replit Shell. Usar `page.evaluate()` con eventos nativos.

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
