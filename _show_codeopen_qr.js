const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Click WhatsApp button
  await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn');
    if (btn) { btn.click(); return 'clicked'; }
    return 'not found';
  });
  
  // Wait for QR poll
  await page.waitForTimeout(5000);
  
  // Check QR image state
  const qrState = await page.evaluate(() => {
    const img = document.getElementById('waQRImage');
    if (!img) return { error: 'no img element' };
    return {
      src: (img.src || '').substring(0, 100),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
      visible: img.offsetWidth > 0
    };
  });
  console.log('QR Image:', JSON.stringify(qrState));
  
  // Check what's visible in the panel
  const panelContent = await page.evaluate(() => {
    const panel = document.getElementById('waQRPanel');
    if (!panel) return 'no panel';
    // Get visible text content
    const visibleText = [];
    panel.querySelectorAll('*').forEach(el => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0 && el.children.length === 0 && el.textContent.trim()) {
        visibleText.push(el.textContent.trim().substring(0, 50));
      }
    });
    return visibleText;
  });
  console.log('Panel visible text:', JSON.stringify(panelContent));
  
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
