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
      if (el.textContent.trim() === 'Shell') { el.click(); return; }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Ctrl+C
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.dispatchEvent(new KeyboardEvent('keydown', {key:'c', code:'KeyC', ctrlKey:true, keyCode:67, which:67, bubbles:true}));
  });
  await new Promise(r => setTimeout(r, 1000));

  // Focus
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });

  // Escribir comando lento
  var cmd = 'git fetch --all && git reset --hard origin/main && pkill -9 -f node && sleep 2 && node server.js';
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
  console.log('Comando escrito, esperando 40s para el deploy...');

  // Enter
  await p.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) return;
    ta.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    ta.dispatchEvent(new KeyboardEvent('keypress', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
    ta.dispatchEvent(new InputEvent('input', {data: null, inputType: 'insertLineBreak', bubbles: true}));
    ta.dispatchEvent(new KeyboardEvent('keyup', {key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true}));
  });

  // Esperar 40s para git fetch + reset + node start
  await new Promise(r => setTimeout(r, 40000));
  console.log('40s cumplidos, probando login...');

  // Probar debug-login primero
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev/debug-login';
  var p2 = await ctx.newPage();
  try {
    await p2.goto(url, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 3000));
    console.log('URL debug-login:', p2.url());
    var txt = await p2.evaluate(() => document.body.innerText.substring(0, 200));
    console.log('Contenido:', txt);
  } catch(e) { console.log('Error debug-login:', e.message.slice(0,100)); }

  await new Promise(r => setTimeout(r, 2000));

  // Si debug-login no funcionó, probar login normal
  if (!p2.url().includes('tienda')) {
    await p2.goto(url.replace('/debug-login', ''), { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    await p2.fill('input[type="text"]', 'aaa1');
    await p2.fill('input[type="password"]', 'aaa123');
    await new Promise(r => setTimeout(r, 500));
    var btn = await p2.$('button[type="submit"]');
    if (btn) await btn.click();
    await new Promise(r => setTimeout(r, 3000));
    console.log('Login normal URL:', p2.url());
  }

  await p2.close();
  await b.close();
})();
