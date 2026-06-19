const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = pages.find(pg => pg.url().includes(url));
  if (!p) { p = await ctx.newPage(); await p.goto(url, { timeout: 20000 }); }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));
  var html = await p.evaluate(() => document.body.innerHTML.substring(0, 500));
  var title = await p.title();
  console.log('Titulo:', title);
  console.log('Body preview:', html.substring(0, 200));
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\replit_after.png' });
  await b.close();
})();
