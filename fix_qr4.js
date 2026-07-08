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
      await frame.waitForTimeout(5000);
      
      // Get visible text
      const text = await frame.evaluate(() => document.body.innerText.substring(0, 1000));
      console.log('Iframe text:', text);
      
      // Check for chat list (already logged in)
      const chatList = await frame.$('[data-testid="chat-list"], .chat-list, .pane-side');
      console.log('Chat list found:', !!chatList);
      
      // Check for QR
      const qr = await frame.$('canvas[aria-label*="QR"], [data-testid="qr-canvas"]');
      console.log('QR canvas:', !!qr);
      
      // Screenshot
      await iframe.screenshot({ path: 'wa_check.png', fullPage: true });
    }
  }
  await p.close();
})();