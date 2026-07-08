const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  var output = await p.evaluate(() => {
    var rows = document.querySelectorAll('.xterm-rows div, .xterm-rows .xterm-row');
    return Array.from(rows).map(r => r.textContent).join('\n');
  });
  console.log('=== TERMINAL ===');
  console.log(output || '(vacio)');

  // Also check if there's any error displayed
  var err = await p.evaluate(() => {
    var e = document.querySelector('.error, [class*=error], [class*=Error]');
    return e ? e.textContent : null;
  });
  if (err) console.log('Error en pagina:', err);

  await b.close();
})();
