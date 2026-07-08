const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 20000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Get all visible text
  const text = await page.evaluate(() => {
    return document.body.innerText;
  });
  console.log('Page text:', text);
  
  // Get all form inputs
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({name: i.name, type: i.type, placeholder: i.placeholder}));
  });
  console.log('Inputs:', JSON.stringify(inputs));
  
  await browser.close();
})();
