const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) { console.log('No se encontro Replit'); await b.close(); return; }
  await replitPage.bringToFront();
  await new Promise(r => setTimeout(r, 1000));

  // Hacer clic en el textarea xterm
  var textarea = await replitPage.$('.xterm-helper-textarea');
  if (!textarea) { console.log('No hay textarea'); await b.close(); return; }

  // Click para asegurar foco
  await textarea.click();
  await new Promise(r => setTimeout(r, 500));

  // Limpiar con Ctrl+A + Delete
  await replitPage.keyboard.press('Control+a');
  await new Promise(r => setTimeout(r, 200));
  await replitPage.keyboard.press('Delete');
  await new Promise(r => setTimeout(r, 200));

  // Escribir con insertText (más directo que type)
  await replitPage.keyboard.insertText('git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js');
  await new Promise(r => setTimeout(r, 500));

  // Presionar Enter
  await replitPage.keyboard.press('Enter');
  console.log('Comando enviado con insertText');

  await new Promise(r => setTimeout(r, 5000));
  await b.close();
})();
