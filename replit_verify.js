const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();

  // Buscar pagina de Replit preview o abrir nueva
  var previewUrl = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var previewPage = pages.find(p => p.url().includes(previewUrl));
  if (!previewPage) {
    previewPage = await ctx.newPage();
    await previewPage.goto(previewUrl, { timeout: 15000 });
  }
  await previewPage.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  var titulo = await previewPage.title();
  var url = previewPage.url();
  console.log('Titulo:', titulo);
  console.log('URL:', url);

  // Ver si hay formulario de login
  var loginForm = await previewPage.$('form, input[type="password"]');
  if (loginForm) console.log('Pagina de login detectada');

  // Tomar screenshot
  await previewPage.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\replit_preview.png' });
  console.log('Screenshot guardado');

  await b.close();
})();
