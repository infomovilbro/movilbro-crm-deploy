const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) { console.log('No se encontro Replit'); await b.close(); return; }
  await replitPage.bringToFront();
  await new Promise(r => setTimeout(r, 1000));

  // Ver si hay un panel de shell visible
  var shellPanel = await replitPage.$('.shell-panel, [data-testid="shell"], .terminal, .xterm');
  if (shellPanel) console.log('Panel shell visible');
  else console.log('Panel shell NO visible');

  // Buscar textarea xterm
  var textarea = await replitPage.$('.xterm-helper-textarea');
  if (textarea) {
    console.log('Textarea xterm encontrado');
    var isVisible = await textarea.isVisible();
    console.log('Visible:', isVisible);
    // Obtener el valor actual
    var val = await replitPage.evaluate(el => el.value, textarea);
    console.log('Contenido actual:', JSON.stringify(val));
  } else {
    console.log('No hay .xterm-helper-textarea');
    // Buscar cualquier textarea o input
    var inputs = await replitPage.evaluate(() => {
      return Array.from(document.querySelectorAll('textarea, input[type="text"]')).map(e => e.className + ' ' + e.placeholder);
    });
    console.log('Inputs encontrados:', inputs);
  }

  // Tomar screenshot para debug
  await replitPage.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\replit_shell.png', fullPage: true });
  console.log('Screenshot guardado');

  await b.close();
})();
