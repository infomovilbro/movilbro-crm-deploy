const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) { console.log('No se encontro pagina de Replit'); await b.close(); return; }
  console.log('URL:', replitPage.url());
  await replitPage.bringToFront();
  // Buscar el textarea del shell
  var shell = await replitPage.$('.xterm-helper-textarea');
  if (!shell) {
    // Intentar con Ctrl+` para abrir shell
    await replitPage.keyboard.press('Control+`');
    await new Promise(r => setTimeout(r, 2000));
    shell = await replitPage.$('.xterm-helper-textarea');
  }
  if (!shell) { console.log('No se encontro shell'); await b.close(); return; }
  await shell.focus();
  await new Promise(r => setTimeout(r, 500));
  // Limpiar y escribir comando
  await replitPage.keyboard.press('Control+a');
  await replitPage.keyboard.press('Delete');
  await replitPage.keyboard.type('git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js', {delay: 20});
  await new Promise(r => setTimeout(r, 500));
  await replitPage.keyboard.press('Enter');
  console.log('Comando enviado. Esperando arranque...');
  await new Promise(r => setTimeout(r, 8000));
  console.log('Listo, el servidor deberia estar reiniciandose');
  await b.close();
})();
