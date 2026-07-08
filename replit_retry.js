const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit page'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click Shell tab
  await p.evaluate(() => {
    var els = document.querySelectorAll('button, [role="tab"]');
    for (var el of els) {
      if (el.textContent.trim() === 'Shell') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Ctrl+C
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, keyCode: 67, which: 67, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 500));

  // Focus + escribir
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) throw new Error('No textarea');
    ta.focus();
    ta.value = '';
    var cmd = 'git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js';
    for (var c of cmd) {
      ta.value += c;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 500));

  // Enter con keydown + keyup
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
  });
  console.log('Comando reenviado');

  await new Promise(r => setTimeout(r, 15000));
  console.log('Espera completada');
  await b.close();
})();
