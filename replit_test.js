const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click Shell tab
  await p.evaluate(() => {
    var els = document.querySelectorAll('button');
    for (var el of els) {
      if (el.textContent.trim() === 'Shell') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Focus textarea
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });
  await new Promise(r => setTimeout(r, 300));

  // Click en el textarea para asegurar foco
  var ta = await p.$('.xterm-helper-textarea');
  if (ta) await ta.click();
  await new Promise(r => setTimeout(r, 300));

  // Escribir comando simple con keyboard.type() real
  await p.keyboard.type('echo "hola shell"', {delay: 50});
  await new Promise(r => setTimeout(r, 500));
  await p.keyboard.press('Enter');
  console.log('Comando echo enviado');

  await new Promise(r => setTimeout(r, 2000));

  // Leer terminal
  var rows = await p.evaluate(() => {
    var r = document.querySelectorAll('.xterm-rows .xterm-row');
    return Array.from(r).map(x => x.textContent);
  });
  console.log('Terminal:', rows);

  await b.close();
})();
