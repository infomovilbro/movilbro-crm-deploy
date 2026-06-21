const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.dev') || pg.url().includes('6f335cd7'));
  if (!p) { console.log('No CRM page'); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 2000));

  // Navigate to codeopen if not there
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('URL:', p.url().substring(0, 100));

  // 1. Check WhatsApp status
  var waStatus = await p.evaluate(() => {
    var el = document.querySelector('#waStatusText');
    return el ? el.textContent.trim() : 'no element';
  });
  console.log('WA Status:', waStatus);

  // 2. Check pending count
  var pendingBadge = await p.evaluate(() => {
    var el = document.querySelector('#pendingBadge');
    return el ? el.textContent.trim() : '0';
  });
  console.log('Pending:', pendingBadge);

  // 3. Check connection status dot
  var dotColor = await p.evaluate(() => {
    var dot = document.querySelector('#statusDot');
    return dot ? dot.style.background : 'no dot';
  });
  console.log('Connection dot:', dotColor);

  // 4. Try to click Analyze button if visible
  var analyzeResult = await p.evaluate(() => {
    var btn = document.querySelector('.btn-analyze, .pending-analyze');
    if (!btn) return { found: false };
    btn.click();
    return { found: true, text: btn.textContent.trim() };
  });
  console.log('Analyze btn:', analyzeResult.found ? 'clicked (' + analyzeResult.text + ')' : 'NOT FOUND');

  if (analyzeResult.found) {
    await new Promise(r => setTimeout(r, 5000));
    
    // Check if error or success appeared
    var response = await p.evaluate(() => {
      // Look for error or response elements
      var errEl = document.querySelector('[class*="error"], .alert-danger, [style*="color: var(--error)"]');
      var respEl = document.querySelector('.response-editor, [class*="response"]');
      if (errEl) return { type: 'error', text: errEl.textContent.trim().substring(0, 100) };
      if (respEl) return { type: 'success', text: 'response editor visible' };
      // Check for toast
      var toast = document.querySelector('.toast, [class*="toast"]');
      if (toast) return { type: 'toast', text: toast.textContent.trim().substring(0, 100) };
      return { type: 'unknown', text: 'no feedback visible' };
    });
    console.log('After analyze:', response.type, '-', response.text);
  }

  // 5. Take screenshot
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\test_result.png' });

  await b.close();
})();
