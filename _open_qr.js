const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  await page.goto('https://movilbro-crm.onrender.com/codeopen/baileys-qr-image', { timeout: 30000 });
  console.log('QR image opened');
  await browser.close();
})();
