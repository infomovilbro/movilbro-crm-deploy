const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  
  const page = context.pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Login page:', await page.title());
  
  // Fill login form using Playwright's fill
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await page.click('button[type="submit"]');
  
  await page.waitForTimeout(5000);
  console.log('After login URL:', page.url());
  
  // Navigate to CodeOpen  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('CodeOpen URL:', page.url());
  
  // Click WhatsApp button
  await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn');
    if (btn) btn.click();
  });
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved to desktop');
  
  await browser.close();
})();
