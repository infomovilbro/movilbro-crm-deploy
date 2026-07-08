const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('movilbro-crm-deploy'));
  if (!page) { return; }
  
  const text = await page.evaluate(() => document.body.innerText.substring(0, 3000));
  console.log(text);
  
  await browser.close();
})().catch(e => {});
