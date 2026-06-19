const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = pages.find(pg => pg.url().includes(url));
  if (!p) return;
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));
  console.log('URL actual:', p.url());
  var txt = await p.evaluate(() => document.body.innerText.substring(0, 1000));
  console.log('Texto pagina:', txt);
  await b.close();
})();
