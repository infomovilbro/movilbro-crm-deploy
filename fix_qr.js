const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.goto('https://movilbro-crm.onrender.com/', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  
  // Click WhatsApp
  const btn = await p.$('#whatsappBtn');
  if (btn) { await btn.click(); await p.waitForTimeout(3000); }
  
  // Get iframe content
  const overlay = await p.$('#waOverlay');
  const iframe = await overlay.$('iframe');
  if (iframe) {
    const frame = await iframe.contentFrame();
    if (frame) {
      await frame.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      const frameHtml = await frame.content();
      console.log('Iframe HTML (first 2000):', frameHtml.substring(0, 2000));
      // Check for QR
      const qr = await frame.$('canvas[aria-label*="QR"], img[alt*="QR"], [data-ref*="qr"], .qr-code');
      console.log('QR element found:', !!qr);
    } else {
      console.log('No contentFrame (cross-origin?)');
    }
  }
  
  await p.close();
})();