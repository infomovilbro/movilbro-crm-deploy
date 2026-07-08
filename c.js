const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.goto('https://movilbro-crm.onrender.com/', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  console.log('Loaded:', p.url());
  // Click WhatsApp
  const btn = await p.$('#whatsappBtn');
  if (btn) { await btn.click(); await p.waitForTimeout(2000); }
  // Check overlay
  const overlay = await p.$('#waOverlay');
  if (overlay) {
    const style = await overlay.getAttribute('style');
    console.log('Overlay visible:', !style?.includes('display: none'));
    const iframe = await overlay.$('iframe');
    if (iframe) console.log('Iframe src:', await iframe.getAttribute('src'));
  }
  await p.close();
})();