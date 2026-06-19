const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  // Buscar el boton Run ▶ y hacer click
  var clicked = await p.evaluate(() => {
    var btns = document.querySelectorAll('button');
    for (var b of btns) {
      var txt = b.textContent.trim().toLowerCase();
      // Buscar ► Run, Run, play, iniciar
      if (txt === 'run' || txt.includes('run') || txt.includes('►') || txt.includes('▶') || txt.includes('play') || b.getAttribute('aria-label')?.toLowerCase().includes('run')) {
        b.click();
        return b.textContent.trim();
      }
    }
    return 'no found';
  });
  console.log('Boton Run clickeado:', clicked);

  // Esperar 30s a que Replit haga git pull y reinicie
  await new Promise(r => setTimeout(r, 30000));
  console.log('30s esperados');

  // Probar debug-login
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev/debug-login';
  var p2 = await ctx.newPage();
  try {
    await p2.goto(url, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    console.log('debug-login URL:', p2.url());
    var txt = await p2.evaluate(() => document.body.innerText.substring(0, 200));
    console.log('Contenido:', txt);
  } catch(e) { console.log('Error:', e.message.slice(0,100)); }

  await p2.close();
  await b.close();
})();
