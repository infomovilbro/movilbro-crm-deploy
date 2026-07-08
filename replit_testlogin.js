const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = await ctx.newPage();
  await p.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 2000));

  await p.fill('input[type="text"]', 'aaa1');
  await p.fill('input[type="password"]', 'aaa123');
  await new Promise(r => setTimeout(r, 500));

  var btn = await p.$('button[type="submit"]');
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 3000));

  console.log('URL post-login:', p.url());
  var txt = await p.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Contenido:', txt);
  await p.close();
  await b.close();
})();
