const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.goto('https://movilbro-crm.onrender.com/', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  
  const btn = await p.$('#whatsappBtn');
  if (btn) { await btn.click(); await p.waitForTimeout(3000); }
  
  const overlay = await p.$('#waOverlay');
  const iframe = await overlay.$('iframe');
  if (iframe) {
    const frame = await iframe.contentFrame();
    if (frame) {
      // Wait longer for QR to render
      await frame.waitForTimeout(5000);
      
      // Check for QR canvas or img
      const qrSelectors = [
        'canvas[aria-label*="QR"]',
        'canvas[data-testid="qr-canvas"]',
        'img[alt*="QR"]',
        '[data-ref*="qr"]',
        '.qr-code',
        '.landing-main canvas',
        'div[data-testid="qr-code"] canvas'
      ];
      
      for (const sel of qrSelectors) {
        const el = await frame.$(sel);
        if (el) {
          console.log('QR FOUND with:', sel);
          const box = await el.boundingBox();
          console.log('QR box:', box);
          break;
        }
      }
      
      // Check if still loading
      const loading = await frame.$('.landing-loading, .loading, [data-testid="loading"]');
      console.log('Loading element:', !!loading);
      
      // Full HTML to see state
      const html = await frame.content();
      const hasQR = html.includes('QR') || html.includes('qr') || html.includes('canvas');
      console.log('HTML mentions QR/canvas:', hasQR);
      
      // Screenshot iframe
      await iframe.screenshot({ path: 'wa_iframe.png' });
      console.log('Screenshot saved');
    }
  }
  
  await p.close();
})();