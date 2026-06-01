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
