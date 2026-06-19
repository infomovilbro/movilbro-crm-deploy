const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) { console.log('No se encontro Replit'); await b.close(); return; }
  await replitPage.bringToFront();
  await new Promise(r => setTimeout(r, 1000));

  // Inyectar texto directamente en el textarea xterm via evaluate
  var cmd = 'git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js';
  await replitPage.evaluate((comando) => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) throw new Error('No textarea');
    ta.focus();
    ta.value = comando;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, cmd);
  console.log('Texto inyectado en textarea');
  await new Promise(r => setTimeout(r, 1000));

  // Presionar Enter
  await replitPage.keyboard.press('Enter');
  console.log('Enter enviado');
  await new Promise(r => setTimeout(r, 8000));
  console.log('Hecho');
  await b.close();
})();
