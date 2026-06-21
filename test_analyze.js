const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('6f335cd7'));
  if (!p) return;
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Navigate to codeopen
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
  }

  // Click analyze button
  var result = await p.evaluate(() => {
    var btn = document.querySelector('.btn-analyze, .pending-analyze');
    if (!btn) return 'no button';
    btn.click();
    return 'clicked';
  });
  console.log('Analyze:', result);

  // Wait and check for response
  await new Promise(r => setTimeout(r, 8000));

  var state = await p.evaluate(() => {
    var resp = document.querySelector('.response-editor');
    if (resp) return 'editor visible: ' + resp.value.substring(0, 100);
    var err = document.querySelector('[style*="--error"], .alert-danger');
    if (err) return 'error: ' + err.textContent.trim().substring(0, 100);
    return 'no feedback';
  });
  console.log('State:', state);

  // Also check the analyze response via fetch
  var apiResult = await p.evaluate(async () => {
    try {
      var r = await fetch('/codeopen/analyze/12', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      var d = await r.json();
      return d.error || d.response || JSON.stringify(d).substring(0, 100);
    } catch(e) { return 'fetch error: ' + e.message; }
  });
  console.log('API analyze result:', apiResult);

  var errDetail = await p.evaluate(async () => {
    try {
      var r = await fetch('/codeopen/analyze/12', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'deepseek-v4-flash-free' }) });
      var d = await r.json();
      return d.error || d.response || JSON.stringify(d).substring(0, 200);
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('API details:', errDetail);

  await b.close();
})();
