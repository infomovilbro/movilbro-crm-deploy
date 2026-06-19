const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 120000 });
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);
  await page.goto('https://movilbro-crm.onrender.com/isp/clientes/detalle/178', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const txt = await page.evaluate(() => document.body.innerText);
  console.log(txt.substring(600).substring(0, 800));
  await browser.close();
})();
