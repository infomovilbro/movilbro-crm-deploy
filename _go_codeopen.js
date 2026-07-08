const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();
  
  const page = context.pages()[0];
  
  // Check current URL first
  console.log('Current URL:', page.url());
  
  // Go directly to CodeOpen
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  console.log('After navigation URL:', page.url());
  console.log('Title:', await page.title());
  
  // Check if we're logged in or at login page
  const isLoginPage = await page.evaluate(() => document.querySelector('#loginForm') !== null);
  console.log('Is login page:', isLoginPage);
  
  if (isLoginPage) {
    // Fill login
    console.log('Filling login form...');
    await page.evaluate(() => {
      document.querySelector('#loginForm input[name="email"]').value = 'aaa';
      document.querySelector('#loginForm input[name="password"]').value = 'aaa';
      document.querySelector('#loginForm button[type="submit"]').click();
    });
    await page.waitForTimeout(5000);
    console.log('After login URL:', page.url());
    
    // Go to CodeOpen
    await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    console.log('CodeOpen URL:', page.url());
  }
  
  // Try to click WhatsApp button
  await page.evaluate(() => {
    const btn = document.getElementById('whatsappBtn');
    if (btn) { btn.click(); console.log('WhatsApp btn clicked'); }
    else console.log('WhatsApp btn NOT found');
  });
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\codeopen-qr.png', fullPage: false });
  console.log('Screenshot saved');
  
  await browser.close();
})();
