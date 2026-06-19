const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = await ctx.newPage();
  await p.goto(url, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Intentar login
  await p.fill('input[type="text"]', 'aaa1');
  await p.fill('input[type="password"]', 'aaa123');
  await new Promise(r => setTimeout(r, 300));
  var btn = await p.$('button[type="submit"]');
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 2000));

  // Capturar TODO el contenido
  var html = await p.evaluate(() => document.body.innerHTML);
  console.log('=== HTML tras login (primeros 2000 chars) ===');
  console.log(html.substring(0, 2000));

  await p.close();
  await b.close();
})();
