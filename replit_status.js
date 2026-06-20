const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  // Check URL para ver si hay errores visibles
  console.log('URL:', p.url().substring(0, 120));

  // Buscar mensajes de error visibles en la pagina
  var errs = await p.evaluate(() => {
    var errs = [];
    document.querySelectorAll('[class*="error"], [class*="Error"], [class*="alert"], [class*="warning"]').forEach(el => {
      if (el.textContent.trim()) errs.push(el.textContent.trim().substring(0, 100));
    });
    return errs;
  });
  if (errs.length > 0) {
    console.log('Errores en pagina:');
    errs.forEach(e => console.log(' -', e));
  } else console.log('Sin errores visibles');

  // Intentar leer terminal
  var lines = await p.evaluate(() => {
    var r = document.querySelectorAll('.xterm-rows .xterm-row');
    return Array.from(r).map(x => x.textContent).filter(t => t.trim());
  });
  if (lines.length > 0) {
    console.log('=== TERMINAL ===');
    lines.forEach(l => console.log(l));
  } else console.log('Terminal vacia');

  await b.close();
})();
