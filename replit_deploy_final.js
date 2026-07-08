const { chromium } = require('playwright');
(async () => {
  console.log('Conectando CDP...');
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 10000 });
  console.log('Conectado!');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  console.log('Paginas:', pages.length);
  for (var p of pages) console.log(' -', p.url().substring(0, 100));
  
  var replitPage = pages.find(pg => pg.url().includes('replit.com'));
  if (!replitPage) {
    // Buscar por indice
    var url = 'https://replit.com/@infomovilbro/movilbro-crm-deploy';
    replitPage = await ctx.newPage();
    console.log('Abriendo Replit...');
    await replitPage.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
  }
  await replitPage.bringToFront();
  await new Promise(r => setTimeout(r, 3000));
  console.log('Replit URL:', replitPage.url().substring(0, 100));

  // Click Shell
  await replitPage.evaluate(() => {
    for (var el of document.querySelectorAll('button'))
      if (el.textContent.trim() === 'Shell') { el.click(); break; }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Ctrl+C
  await replitPage.keyboard.press('Control+c');
  await new Promise(r => setTimeout(r, 1000));

  // Focus textarea
  await replitPage.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });
  await new Promise(r => setTimeout(r, 500));

  // Escribir bash deploy.sh
  await replitPage.keyboard.type('bash deploy.sh', {delay: 10});
  await new Promise(r => setTimeout(r, 300));
  await replitPage.keyboard.press('Enter');
  console.log('bash deploy.sh enviado');

  await new Promise(r => setTimeout(r, 40000));
  console.log('Hecho');
  await b.close();
})();
