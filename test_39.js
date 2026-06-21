const { chromium } = require('playwright');
(async () => {
  var b; try { b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 }); } catch(e) { console.log('No CDP'); return; }
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('6f335cd7'));
  if (!p) { console.log('No CRM'); return; }
  await p.bringToFront();
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Check pending messages
  var pending = await p.evaluate(async () => {
    var r = await fetch('/codeopen/pending').then(r2 => r2.json());
    return r.pending.slice(0, 5).map(m => ({ id: m.id, body: (m.body || '').substring(0, 80), resp: (m.proposed_response || '').substring(0, 50) }));
  });
  console.log('=== PENDIENTES ===');
  pending.forEach(m => console.log('  #' + m.id + ':', m.body, '| resp:', m.resp));

  // Find message #39 and click Analyze
  var analyzeBtn = await p.$('.btn-analyze[data-id="39"], .pending-analyze[data-id="39"]');
  if (analyzeBtn) {
    console.log('\nClick Analizar en #39...');
    await analyzeBtn.click();
    await new Promise(r => setTimeout(r, 8000));
    
    var result = await p.evaluate(() => {
      var editor = document.querySelector('.response-editor[data-id="39"]');
      if (editor) return { type: 'editor', text: editor.value.substring(0, 200) };
      var err = document.querySelector('.alert-danger, [style*="--error"]');
      if (err) return { type: 'error', text: err.textContent.trim().substring(0, 100) };
      return { type: 'waiting', text: 'no response yet' };
    });
    console.log('Result after analyze:', result.type, '->', result.text);
    
    // Also check via API directly
    var apiResp = await p.evaluate(async () => {
      var r = await fetch('/codeopen/analyze/39', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return await r.json();
    });
    console.log('API analyze:', JSON.stringify(apiResp).substring(0, 300));
    
    // Check if Doc button appeared
    var hasDoc = await p.evaluate(() => !!document.querySelector('.btn-send-doc[data-id="39"]'));
    console.log('Doc button:', hasDoc ? 'YES' : 'NO');
    
    // Check re-analyze button
    var hasReAnalyze = await p.evaluate(() => !!document.querySelector('.btn-analyze[data-id="39"]'));
    console.log('Re-analizar btn:', hasReAnalyze ? 'YES' : 'NO');
  } else {
    console.log('No analyze button for #39 found');
    // Check what buttons exist
    var allBtns = await p.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="btn-"]')).map(b => b.className + ' data-id=' + (b.dataset.id || 'none'));
    });
    console.log('All buttons:', allBtns.join(', '));
  }
  
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\analyze39.png' });
  await b.close();
})();
