const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Open the WhatsApp QR panel
  await page.evaluate(() => {
    const p = document.getElementById('waQRPanel');
    if (p) { p.style.right = '0'; p.style.display = 'block'; }
    const o = document.getElementById('waQROverlay');
    if (o) o.style.display = 'block';
    const img = document.getElementById('waQRImage');
    if (img) img.src = '/codeopen/baileys-qr-image?' + Date.now();
  });
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('OK');
  await browser.close();
})();
