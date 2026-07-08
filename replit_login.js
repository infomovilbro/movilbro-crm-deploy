const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = pages.find(pg => pg.url().includes(url));
  if (!p) { p = await ctx.newPage(); await p.goto(url, { timeout: 20000 }); }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Llenar login
  var inputs = await p.$$('input[type="text"], input[type="email"], input[name="username"]');
  if (inputs.length > 0) await inputs[0].fill('aaa1');
  var passInput = await p.$('input[type="password"]');
  if (passInput) await passInput.fill('aaa123');
  await new Promise(r => setTimeout(r, 500));

  // Click boton login
  var btn = await p.$('button[type="submit"], input[type="submit"]');
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 3000));

  var title = await p.title();
  console.log('Titulo tras login:', title);
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\replit_login.png' });
  await b.close();
})();
