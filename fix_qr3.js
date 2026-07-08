const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  await p.goto('https://movilbro-crm.onrender.com/', { timeout: 60000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  
  const btn = await p.$('#whatsappBtn');
  if (btn) { await btn.click(); await p.waitForTimeout(2000); }
  
  const overlay = await p.$('#waOverlay');
  const iframe = await overlay.$('iframe');
  if (iframe) {
    const frame = await iframe.contentFrame();
    if (frame) {
      // Wait much longer for WhatsApp Web to fully load
      await frame.waitForTimeout(15000);
      
      // Try all possible QR selectors
      const qrSelectors = [
        'canvas',
        'canvas[aria-label]',
        '[data-testid="qr-canvas"]',
        'div[data-ref] canvas',
        '.landing-main canvas',
        'section canvas'
      ];
      
      for (const sel of qrSelectors) {
        const els = await frame.$$(sel);
        if (els.length > 0) {
          console.log('Found', els.length, 'elements with:', sel);
          for (const el of els) {
            const box = await el.boundingBox();
            const aria = await el.getAttribute('aria-label');
            console.log('  box:', box, 'aria-label:', aria);
          }
        }
      }
      
      // Check page state
      const bodyClass = await frame.$eval('body', el => el.className).catch(() => 'no body');
      console.log('Body class:', bodyClass);
      
      // Check for landing vs main app
      const isLanding = await frame.$('.landing, .landing-main, [data-testid="landing"]');
      console.log('Is landing page:', !!isLanding);
      
      // Screenshot
      await iframe.screenshot({ path: 'wa_final.png', fullPage: true });
      console.log('Screenshot saved');
    }
  }
  
  await p.close();
})();