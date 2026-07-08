const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = await ctx.newPage();
  try {
    await p.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    var title = await p.title();
    var txt = await p.evaluate(() => document.body.innerText.substring(0, 400));
    console.log('Titulo:', title);
    console.log('Contenido:', txt);
  } catch(e) { console.log('Error:', e.message.slice(0,100)); }
  await p.close();
  await b.close();
})();
