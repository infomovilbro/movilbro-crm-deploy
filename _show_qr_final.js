const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  
  const page = context.pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Force open WhatsApp panel and trigger QR poll
  await page.evaluate(() => {
    // Force panel visible
    const panel = document.getElementById('waQRPanel');
    if (panel) {
      panel.style.right = '0';
      panel.style.display = 'block';
    }
    const overlay = document.getElementById('waQROverlay');
    if (overlay) overlay.style.display = 'block';
    
    // Click whatsapp button if exists
    const btn = document.getElementById('whatsappBtn');
    if (btn) btn.click();
    
    // Force poll QR
    if (typeof pollWAStatus === 'function') pollWAStatus();
    
    // Also directly set QR image if data available
    const img = document.getElementById('waQRImage');
    if (img) img.src = '/codeopen/baileys-qr-image?' + Date.now();
  });
  
  await page.waitForTimeout(5000);
  
  // Take screenshot
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  // Open screenshot in a new tab so user can see it
  const newPage = await context.newPage();
  await newPage.goto('file:///C:/Users/xtptx/Desktop/codeopen-qr.png', { timeout: 10000 }).catch(() => {});
  console.log('Screenshot opened in new tab');
  
  await browser.close();
})();
