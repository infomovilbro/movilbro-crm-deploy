const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();

  // Buscar la pagina del CRM
  var crmUrl = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = pages.find(pg => pg.url().includes(crmUrl));
  if (!p) {
    p = await ctx.newPage();
    await p.goto(crmUrl + '/codeopen', { timeout: 15000, waitUntil: 'domcontentloaded' });
  }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('URL:', p.url());
  var title = await p.title();
  console.log('Title:', title);

  // 1. Verificar boton Analizar visible
  var analyzeBtns = await p.evaluate(() => {
    var btns = document.querySelectorAll('.pending-analyze, .btn-analyze');
    return Array.from(btns).map(b => ({ text: b.textContent.trim(), visible: b.offsetParent !== null }));
  });
  console.log('\n[1] Botones Analizar:', analyzeBtns.length > 0 ? analyzeBtns.length + ' encontrados' : 'NINGUNO');

  // 2. Verificar dropdown modelos
  var modelBtns = await p.evaluate(() => {
    var items = document.querySelectorAll('#cerebroDropdown div');
    return Array.from(items).map(i => i.textContent.trim()).filter(t => t.length > 0 && t.length < 100);
  });
  console.log('[5/6] Modelos disponibles:', modelBtns.length > 1 ? modelBtns.slice(0, 5).join(' | ') : 'sin modelos');

  // 3. Verificar que el numero de telefono aparece
  var phoneText = await p.evaluate(() => {
    var els = document.querySelectorAll('[class*="contact"], [class*="wa-contact"]');
    for (var el of els) {
      if (el.textContent.match(/\d{9,}/)) return el.textContent.trim().substring(0, 100);
    }
    return null;
  });
  console.log('[8] Numero telefono visible:', phoneText ? 'SI' : 'NO');

  // 4. Verificar estado WhatsApp
  var waStatus = await p.evaluate(() => {
    var statusEl = document.querySelector('#waStatusText');
    return statusEl ? statusEl.textContent.trim() : 'no encontrado';
  });
  console.log('Estado WhatsApp:', waStatus);

  // 5. Verificar que hay sesion conectada (Baileys restored)
  console.log('[1/10] WhatsApp Connected:', waStatus.includes('Conect') ? 'SI (visible)' : 'pendiente');

  // 6. Tomar screenshot
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\verify_screen.png', fullPage: false });
  console.log('\nScreenshot guardado');

  await b.close();
})();
