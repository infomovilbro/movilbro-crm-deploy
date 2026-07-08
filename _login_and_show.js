const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  
  // Go to login
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // Fill credentials
  await page.evaluate(() => {
    const f = document.getElementById('loginForm');
    if (f) {
      f.querySelector('input[name="email"]').value = 'aaa';
      f.querySelector('input[name="password"]').value = 'aaa';
      f.querySelector('button[type="submit"]').click();
    }
  });
  
  await page.waitForTimeout(5000);
  console.log('Login done. URL:', page.url());
  
  // Go to CodeOpen
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('CodeOpen URL:', page.url());
  
  // Click WhatsApp button
  await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn');
    if (btn) { btn.click(); console.log('WhatsApp btn clicked'); }
    else console.log('WhatsApp btn not found');
  });
  
  await page.waitForTimeout(5000);
  
  // Check QR state
  const state = await page.evaluate(() => {
    const img = document.getElementById('waQRImage');
    if (!img) return { error: 'no img', ids: Array.from(document.querySelectorAll('[id]')).map(e => e.id).filter(id => id.toLowerCase().includes('wa') || id.toLowerCase().includes('qr')).join(',') };
    return {
      src: (img.src || '').substring(0, 80),
      naturalWidth: img.naturalWidth,
      visible: img.offsetWidth > 0
    };
  });
  console.log('QR state:', JSON.stringify(state));
  
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
