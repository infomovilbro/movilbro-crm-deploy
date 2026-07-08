const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.goto('https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680', { timeout: 10000 });
  await p.waitForTimeout(1500);
  const text = await p.textContent('body');
  console.log('Status:', text.includes('Live') || text.includes('Deploy live') ? 'LIVE' : text.includes('Building') ? 'BUILDING' : 'CHECK MANUAL');
  await p.close();
})();