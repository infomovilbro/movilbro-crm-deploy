const { chromium } = require('playwright');
(async () => {
  var b;
  try {
    b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch(e) { console.log('CDP no conecta:', e.message); return; }
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com') || pg.url().includes('replit.dev'));
  if (p) {
    console.log('Replit page URL:', p.url().substring(0, 120));
    var txt = await p.evaluate(() => document.body.innerText.substring(0, 300));
    console.log('Contenido:', txt);
  } else {
    console.log('No hay pagina de Replit abierta');
    // Listar URLs disponibles
    for (var pg of pages) console.log(' -', pg.url().substring(0, 100));
  }
  await b.close();
})();
