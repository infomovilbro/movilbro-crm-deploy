const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Leer el contenido de la terminal (xterm)
  var termLines = await p.evaluate(() => {
    var lines = document.querySelectorAll('.xterm-rows > div, .terminal .xterm-rows div');
    return Array.from(lines).map(l => l.textContent);
  });
  console.log('Terminal output:');
  for (var line of termLines) console.log(' >', line);

  if (termLines.length === 0) {
    // Intentar leer el textarea
    var ta = await p.evaluate(() => {
      var t = document.querySelector('.xterm-helper-textarea');
      return t ? t.value : 'no textarea';
    });
    console.log('Textarea value:', ta);
  }
  await b.close();
})();
