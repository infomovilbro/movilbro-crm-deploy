const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  
  const page = context.pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  
  // Check all buttons
  const btnInfo = await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn');
    if (!btn) return 'no whatsappBtn';
    const rect = btn.getBoundingClientRect();
    btn.click();
    return 'clicked at ' + rect.x + ',' + rect.y + ' visible:' + (rect.width > 0 && rect.height > 0);
  });
  console.log('Button:', btnInfo);
  
  await page.waitForTimeout(3000);
  
  // Check panel state
  const panelState = await page.evaluate(() => {
    const p = document.getElementById('waQRPanel');
    if (!p) return 'no panel';
    return 'panel right=' + p.style.right + ' display=' + p.style.display;
  });
  console.log('Panel:', panelState);
  
  // Also check QR image
  const qrImg = await page.evaluate(() => {
    const img = document.getElementById('waQRImage');
    if (!img) return 'no qr image element';
    return 'src=' + (img.src || 'none') + ' displayed=' + (img.offsetWidth > 0);
  });
  console.log('QR img:', qrImg);
  
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
