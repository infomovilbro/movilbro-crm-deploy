const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click Shell tab
  await p.evaluate(() => {
    for (var el of document.querySelectorAll('button')) {
      if (el.textContent.trim() === 'Shell') { el.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // Ctrl+C via evaluate
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', {key:'c', code:'KeyC', ctrlKey:true, keyCode:67, which:67, bubbles:true}));
  });
  await new Promise(r => setTimeout(r, 500));

  // Escribir con evaluate
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) throw new Error('No textarea');
    ta.focus();
    ta.value = '';
    var cmd = 'git pull && node server.js';
    for (var ch of cmd) {
      ta.value += ch;
      ta.dispatchEvent(new Event('input', {bubbles:true}));
    }
  });
  console.log('Texto escrito');
  await new Promise(r => setTimeout(r, 500));

  // Enter con evaluate
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) {
      ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    }
    // Small delay then keyup
    setTimeout(() => {
      ta.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    }, 50);
  });
  console.log('Enter enviado');
  await new Promise(r => setTimeout(r, 10000));

  // Verificar que el textarea se vacio
  var val = await p.evaluate(() => { var t = document.querySelector('.xterm-helper-textarea'); return t ? t.value : 'no'; });
  console.log('Textarea post-enter:', JSON.stringify(val));

  await b.close();
})();
