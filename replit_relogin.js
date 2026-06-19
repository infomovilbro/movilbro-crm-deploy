const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  
  // Abrir nueva pestana con el CRM
  var p = await ctx.newPage();
  await p.goto(url, { timeout: 20000 });
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('URL:', p.url());
  var title = await p.title();
  console.log('Title:', title);
  
  // Login
  var inputs = await p.$$('input');
  for (var inp of inputs) {
    var type = await inp.getAttribute('type');
    if (type === 'text' || type === 'email') await inp.fill('aaa1');
    if (type === 'password') await inp.fill('aaa123');
  }
  await new Promise(r => setTimeout(r, 300));
  
  var btn = await p.$('button[type="submit"]');
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('URL tras login:', p.url());
  var txt = await p.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Contenido:', txt);
  
  await b.close();
})();
