const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  
  const page = context.pages()[0];
  
  // Go to CodeOpen directly - it will redirect to login
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  console.log('Current URL:', page.url());
  
  // If on login page, fill password and submit
  if (page.url().includes('/auth/login') || page.url().includes('/login')) {
    console.log('Login page detected, logging in...');
    // Try common password field names
    await page.fill('input[name="password"], input[type="password"]', 'admin123');
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForTimeout(3000);
    console.log('After login URL:', page.url());
  }
  
  // Navigate to CodeOpen
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  
  console.log('CodeOpen URL:', page.url());
  
  // Click WhatsApp button
  const waBtn = await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn') || document.querySelector('[data-whatsapp]') || document.querySelector('.wa-btn');
    if (btn) { btn.click(); return 'clicked'; }
    return 'not found';
  });
  console.log('WhatsApp button:', waBtn);
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
