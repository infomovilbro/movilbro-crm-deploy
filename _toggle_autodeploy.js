const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const p = b.contexts()[0].pages()[0];
  await p.goto('https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680/settings', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  
  // Find the autoDeployTrigger element
  const el = await p.evaluate(() => {
    const input = document.getElementById('autoDeployTrigger');
    if (!input) return 'INPUT_NOT_FOUND';
    const parent = input.closest('div') || input.parentElement;
    return {
      tag: input.tagName,
      type: input.type,
      checked: input.checked,
      outer: parent.outerHTML.substring(0, 1000)
    };
  });
  console.log(JSON.stringify(el, null, 2));
  
  await b.close();
})().catch(e => console.error('Error:', e.message));
