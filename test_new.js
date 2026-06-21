const { chromium } = require('playwright');
(async () => {
  var b; try { b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 }); } catch(e) { console.log('No CDP'); return; }
  var p = b.contexts()[0].pages().find(pg => pg.url().includes('6f335cd7'));
  if (!p) { console.log('No CRM page'); return; }
  await p.bringToFront();
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
  }

  // 1. Analyze via API directly (faster)
  console.log('1. Analyzing #39 via API...');
  var api = await p.evaluate(async () => {
    var r = await fetch('/codeopen/analyze/39', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return await r.json();
  });
  console.log('   Response:', JSON.stringify(api).substring(0, 400));
  
  // Also analyze #38
  console.log('2. Analyzing #38 via API...');
  var api2 = await p.evaluate(async () => {
    var r = await fetch('/codeopen/analyze/38', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return await r.json();
  });
  console.log('   Response:', JSON.stringify(api2).substring(0, 400));

  // 3. Check if UI updated for #39
  var ui = await p.evaluate(() => {
    var editor = document.querySelector('.response-editor[data-id="39"]');
    var docBtn = document.querySelector('.btn-send-doc[data-id="39"]');
    var reBtn = document.querySelector('.btn-analyze[data-id="39"]');
    return {
      hasEditor: !!editor,
      editorText: editor ? editor.value.substring(0, 150) : '',
      hasDocBtn: !!docBtn,
      hasReAnalyze: !!reBtn,
      reBtnText: reBtn ? reBtn.textContent.trim() : ''
    };
  });
  console.log('3. UI state:', JSON.stringify(ui));

  await b.close();
})();
