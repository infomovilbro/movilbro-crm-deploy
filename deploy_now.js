const { chromium } = require('playwright');
(async () => {
  var b; try { b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 }); } catch(e) { console.log('No CDP'); return; }
  var p = b.contexts()[0].pages().find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); return; }
  await p.bringToFront(); await new Promise(r => setTimeout(r, 2000));
  await p.evaluate(() => { for (var el of document.querySelectorAll('button')) if (el.textContent.trim() === 'Shell') { el.click(); break; } });
  await new Promise(r => setTimeout(r, 1500)); await p.keyboard.press('Control+c'); await new Promise(r => setTimeout(r, 800));
  await p.evaluate(() => { var ta = document.querySelector('.xterm-helper-textarea'); if (!ta) return; ta.focus(); ta.value = ''; var c = 'git fetch --all && git reset --hard origin/main && pkill -9 -f node; sleep 2; node server.js'; for (var ch of c) { ta.value += ch; ta.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true })); } });
  await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => { var ta = document.querySelector('.xterm-helper-textarea'); if (!ta) return; ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })); });
  console.log('Deploy enviado');
  await new Promise(r => setTimeout(r, 30000)); await b.close();
})();
