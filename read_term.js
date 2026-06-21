const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var p = b.contexts()[0].pages().find(pg => pg.url().includes('replit.com'));
  if (!p) return;
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  var txt = await p.evaluate(() => {
    // Try multiple selectors
    var rows = document.querySelector('.xterm-screen .xterm-rows');
    if (rows) return rows.innerText || rows.textContent;

    var viewport = document.querySelector('.xterm-viewport');
    if (viewport) return viewport.innerText || viewport.textContent;

    var screen = document.querySelector('.xterm-screen');
    if (screen) return screen.innerText || screen.textContent;

    var helper = document.querySelector('.xterm-helper-textarea');
    if (helper) return 'textarea: ' + helper.value;

    // Try any text in the terminal wrapper
    var wrapper = document.querySelector('[class*=xtermWrapper]');
    if (wrapper) return wrapper.innerText.substring(0, 5000);

    return 'no terminal content found';
  });
  console.log('=== TERMINAL ===');
  console.log(txt);

  await b.close();
})();
