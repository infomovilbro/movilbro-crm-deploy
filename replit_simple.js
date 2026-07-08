const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click boton Shell
  await p.evaluate(() => {
    var btns = document.querySelectorAll('button');
    for (var b of btns) { if (b.textContent.trim() === 'Shell') { b.click(); break; } }
  });
  await new Promise(r => setTimeout(r, 1500));

  // Click en el terminal
  var term = await p.$('.xterm');
  if (term) await term.click();
  await new Promise(r => setTimeout(r, 500));

  // Ctrl+A para seleccionar todo, Delete para borrar
  await p.keyboard.press('Control+a');
  await new Promise(r => setTimeout(r, 200));
  await p.keyboard.press('Delete');
  await new Promise(r => setTimeout(r, 200));

  // Escribir comando
  await p.keyboard.type('git fetch --all && git reset --hard origin/main && pkill -9 -f node && sleep 2 && node server.js', {delay: 10});
  await new Promise(r => setTimeout(r, 500));
  await p.keyboard.press('Enter');
  console.log('Comando enviado');

  await new Promise(r => setTimeout(r, 35000));

  // Verificar debug-login YA NO existe, probar login normal
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
    var ok = p2.url().includes('tienda');
    console.log('Login exitoso?', ok ? 'SI' : 'NO');
    if (!ok) {
      var err = await p2.evaluate(() => document.querySelector('.alert-danger')?.textContent || 'sin error');
      console.log('Error:', err);
    }
  } catch(e) { console.log('Error:', e.message.slice(0,100)); }
  await p2.close();
  await b.close();
})();
