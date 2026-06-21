const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('6f335cd7') || pg.url().includes('replit.dev'));
  if (!p) { console.log('No CRM page'); return; }
  await p.bringToFront();
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 10000 });
  }
  await new Promise(r => setTimeout(r, 3000));

  // 1. Check Baileys status
  var baileys = await p.evaluate(async () => {
    var r = await fetch('/codeopen/baileys-qr').then(r => r.json());
    return r.status ? 'connected:' + r.status.connected + ' state:' + r.status.state : 'error';
  });
  console.log('Baileys:', baileys);

  // 2. Try analyze message #18
  var analyzeResult = await p.evaluate(async () => {
    try {
      var r = await fetch('/codeopen/analyze/18', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      var d = await r.json();
      return d.response || d.error || JSON.stringify(d).substring(0, 200);
    } catch(e) { return 'fetch error: ' + e.message; }
  });
  console.log('Analyze #18:', analyzeResult);

  // 3. Check if analysis showed up in UI
  await new Promise(r => setTimeout(r, 3000));

  var uiState = await p.evaluate(() => {
    var el = document.querySelector('.response-editor, [class*="error"]');
    return el ? el.textContent.trim().substring(0, 100) : 'no editor visible';
  });
  console.log('UI after analyze:', uiState);

  // 4. Check models status
  var models = await p.evaluate(async () => {
    var r = await fetch('/codeopen/models').then(r => r.json());
    return Object.keys(r.models).filter(k => !r.models[k].needsKey).join(', ');
  });
  console.log('Free models:', models);

  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\test_final.png' });
  await b.close();
})();
