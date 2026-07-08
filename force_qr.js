const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  // Try to trigger init by hitting a route that forces it
  await p.goto('https://movilbro-crm.onrender.com/codeopen/baileys-qr', { timeout: 30000 });
  await p.waitForTimeout(5000);
  
  const resp = await p.goto('https://movilbro-crm.onrender.com/codeopen/baileys-qr', { timeout: 30000 });
  const text = await p.textContent('body');
  console.log('QR after wait:', text);
  
  await p.close();
})();