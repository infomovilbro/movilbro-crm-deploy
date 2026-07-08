const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  var lines = await p.evaluate(() => {
    var rows = document.querySelectorAll('.xterm-rows .xterm-row, .xterm-rows > div');
    return Array.from(rows).map(r => r.textContent).filter(t => t.trim());
  });
  console.log('=== TERMINAL OUTPUT ===');
  for (var l of lines) console.log(l);
  if (lines.length === 0) console.log('(vacio)');
  await b.close();
})();
