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
  await new Promise(r => setTimeout(r, 1500));

  // Ctrl+C
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', {key:'c', code:'KeyC', ctrlKey:true, keyCode:67, which:67, bubbles:true}));
  });
  await new Promise(r => setTimeout(r, 500));

  // git fetch + reset (force pull)
  var cmd = 'git fetch --all && git reset --hard origin/main && node server.js';
  for (var ch of cmd) {
    await p.evaluate((char) => {
      var ta = document.querySelector('.xterm-helper-textarea');
      if (!ta) return;
      ta.focus();
      ta.value += char;
      ta.dispatchEvent(new InputEvent('input', {data: char, inputType: 'insertText', bubbles: true}));
    }, ch);
    await new Promise(r => setTimeout(r, 20));
  }
  console.log('Comando git fetch+reset enviado');
  await new Promise(r => setTimeout(r, 500));

  // Enter
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) return;
    ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    ta.dispatchEvent(new KeyboardEvent('keypress', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    ta.dispatchEvent(new InputEvent('input', {data: null, inputType: 'insertLineBreak', bubbles: true}));
    ta.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
  });
  console.log('Enter enviado');

  await new Promise(r => setTimeout(r, 20000));
  console.log('Hecho - verificando...');
  await b.close();
})();
