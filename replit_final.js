const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) { console.log('No se encontro Replit'); await b.close(); return; }
  await replitPage.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // 1. Buscar y clickear en el TAB "Shell" para activarlo
  var shellTab = await replitPage.evaluate(() => {
    var tabs = document.querySelectorAll('button, div, [role="tab"]');
    for (var t of tabs) {
      if (t.textContent.trim().toLowerCase() === 'shell') return true;
    }
    // Intentar con data-testid
    var st = document.querySelector('[data-testid="shell-tab"], [data-track="shell"], .shell-tab');
    return !!st;
  });
  console.log('Shell tab found:', shellTab);

  // Click en el panel/tab de shell
  await replitPage.evaluate(() => {
    var all = document.querySelectorAll('button, div[role="tab"], [data-testid]');
    for (var el of all) {
      if (el.textContent.trim() === 'Shell' || el.textContent.trim() === 'shell') {
        el.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // 2. Ctrl+C para cancelar cualquier comando corriendo
  await replitPage.keyboard.press('Control+c');
  await new Promise(r => setTimeout(r, 500));

  // 3. Click en el textarea xterm
  await replitPage.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) ta.focus();
  });
  await new Promise(r => setTimeout(r, 500));

  // 4. Escribir el comando caracter por caracter con keypress events
  var cmd = 'git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js';
  await replitPage.evaluate((comando) => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) throw new Error('No textarea');
    ta.focus();
    ta.value = '';
    // Disparar input event para cada caracter
    for (var c of comando) {
      ta.value += c;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, cmd);
  await new Promise(r => setTimeout(r, 1000));

  // 5. Enter - usar evaluate para dispatchear keydown
  await replitPage.evaluate(() => {
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) {
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }
  });
  console.log('Enter enviado via keydown');

  await new Promise(r => setTimeout(r, 3000));
  
  // Verificar que se ejecuto
  var taVal = await replitPage.evaluate(() => {
    var t = document.querySelector('.xterm-helper-textarea');
    return t ? t.value : 'no ta';
  });
  console.log('Textarea despues de Enter:', JSON.stringify(taVal));

  await new Promise(r => setTimeout(r, 10000));
  console.log('Hecho');
  await b.close();
})();
