const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click en el boton Shell
  await p.evaluate(() => {
    for (var el of document.querySelectorAll('button'))
      if (el.textContent.trim() === 'Shell') { el.click(); break; }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Focus en textarea xterm via evaluate (sin click, el canvas lo intercepta)
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });
  await new Promise(r => setTimeout(r, 500));

  // keyboard.type directamente en la pagina (el foco esta en el textarea)
  await p.keyboard.type('git fetch --all && git reset --hard origin/main && pkill -9 -f node && sleep 2 && node server.js', {delay: 15});
  await new Promise(r => setTimeout(r, 800));
  await p.keyboard.press('Enter');
  console.log('Comando enviado al shell');

  await new Promise(r => setTimeout(r, 40000));

  // Probar login aaa1/aaa123
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p2 = await ctx.newPage();
  try {
    await p2.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    await p2.fill('input[type="text"]', 'aaa1');
    await p2.fill('input[type="password"]', 'aaa123');
    await new Promise(r => setTimeout(r, 300));
    var btn = await p2.$('button[type="submit"]');
    if (btn) await btn.click();
    await new Promise(r => setTimeout(r, 3000));
    console.log('Login URL:', p2.url());
    console.log(p2.url().includes('tienda') ? 'EXITO' : 'FALLO');
  } catch(e) { console.log('Error:', e.message.slice(0,100)); }
  await p2.close();
  await b.close();
})();
