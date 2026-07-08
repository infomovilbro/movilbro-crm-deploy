const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  // Check deploy status
  await p.goto('https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680/events', { timeout: 30000 });
  await p.waitForTimeout(3000);
  const text = await p.textContent('body');
  const isLive = text.includes('Deploy live') || text.includes('Live');
  const isBuilding = text.includes('Building') || text.includes('building');
  console.log('Deploy:', isLive ? 'LIVE' : isBuilding ? 'BUILDING' : 'UNKNOWN');
  
  // Test QR endpoint
  const p2 = await b.contexts()[0].newPage();
  const resp = await p2.goto('https://movilbro-crm.onrender.com/codeopen/baileys-qr', { timeout: 30000 });
  console.log('QR endpoint status:', resp.status());
  const qrText = await p2.textContent('body');
  console.log('QR response:', qrText.substring(0, 200));
  
  await p.close();
})();