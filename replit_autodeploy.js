const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Click Shell tab
  await p.evaluate(() => {
    for (var el of document.querySelectorAll('button'))
      if (el.textContent.trim() === 'Shell') { el.click(); break; }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Ctrl+C
  await p.keyboard.press('Control+c');
  await new Promise(r => setTimeout(r, 800));

  // Write command via evaluate (xterm input simulation)
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) return;
    ta.focus();
    ta.value = '';
    var cmd = 'git fetch --all && git reset --hard origin/main && pkill -9 -f node; sleep 2; node server.js';
    for (var ch of cmd) {
      ta.value += ch;
      ta.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 500));

  // Enter
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) return;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    ta.dispatchEvent(new InputEvent('input', { data: null, inputType: 'insertLineBreak', bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  });
  console.log('Comando enviado a Replit Shell');

  await new Promise(r => setTimeout(r, 30000));
  await b.close();
})();
