const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit page'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click "Shell" tab
  await p.evaluate(() => {
    var btns = document.querySelectorAll('button');
    for (var b of btns) {
      if (b.textContent.trim() === 'Shell') { b.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1500));

  // Ctrl+C por si hay algo corriendo
  await p.keyboard.press('Control+c');
  await new Promise(r => setTimeout(r, 800));

  // Focus xterm textarea haciendo click directo
  var ta = await p.$('.xterm-helper-textarea');
  if (!ta) { console.log('No textarea'); await b.close(); return; }
  
  // Click en el panel xterm para activar
  var xterm = await p.$('.xterm');
  if (xterm) await xterm.click();
  await new Promise(r => setTimeout(r, 500));
  await ta.focus();
  await new Promise(r => setTimeout(r, 500));
  
  // Escribir con type lento
  await p.keyboard.type('git pull && node server.js', {delay: 30});
  await new Promise(r => setTimeout(r, 1000));

  // Enter via evaluate para asegurar
  await p.evaluate(() => {
    var t = document.querySelector('.xterm-helper-textarea');
    if (t) {
      ['keydown','keypress','keyup'].forEach(ev => {
        t.dispatchEvent(new KeyboardEvent(ev, {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
      });
    }
  });
  console.log('git pull + start enviado');

  await new Promise(r => setTimeout(r, 12000));
  console.log('Espera completada');
  await b.close();
})();
