const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(500);
  
  const searchVal = await p.evaluate(() => {
    const input = document.getElementById('globalSearchInput');
    if (!input) return 'NO SEARCH INPUT';
    return {
      value: input.value,
      placeholder: input.placeholder,
      outerHTML: input.outerHTML.substring(0, 500)
    };
  });
  console.log('SEARCH INPUT:', JSON.stringify(searchVal, null, 2));
  
  // Also check email config area
  const emailStatus = await p.evaluate(() => {
    const el = document.getElementById('emailConfigStatus');
    return el ? el.innerHTML : 'NOT FOUND';
  });
  console.log('EMAIL STATUS:', emailStatus);
  
  await b.close();
})().catch(e => console.error('Error:', e.message));
