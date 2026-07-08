const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) await pages[i].close();

  const page = context.pages()[0];
  await page.goto('https://movilbro-crm.onrender.com/codeopen/baileys-qr', { timeout: 15000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const body = await page.evaluate(() => document.body.innerText);
  console.log('QR API body:', body.substring(0, 300));
  await browser.close();
})();
