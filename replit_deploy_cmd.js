const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit page'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click Shell tab
  await p.evaluate(() => {
    for (var el of document.querySelectorAll('button'))
      if (el.textContent.trim() === 'Shell') { el.click(); break; }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Ctrl+C
  await p.keyboard.press('Control+c');
  await new Promise(r => setTimeout(r, 800));

  // Focus textarea
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });
  await new Promise(r => setTimeout(r, 500));

  // Escribir comando y Enter
  await p.keyboard.type('git fetch --all && git reset --hard origin/main && pkill -9 -f node; sleep 2; node server.js', {delay: 15});
  await new Promise(r => setTimeout(r, 500));
  await p.keyboard.press('Enter');
  console.log('Comando enviado');

  await new Promise(r => setTimeout(r, 30000));
  await b.close();
})();
