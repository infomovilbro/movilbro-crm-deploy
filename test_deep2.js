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

  // Client detail - full content analysis
  await page.goto('https://movilbro-crm.onrender.com/isp/clientes/detalle/1', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const cliFull = await page.evaluate(() => document.body.innerText);
  const cliContent = cliFull.substring(600); // skip sidebar
  console.log('=== CLIENTE DETALLE (despues de sidebar) ===');
  console.log(cliContent.substring(0, 500));

  // Altas - full content analysis
  await page.goto('https://movilbro-crm.onrender.com/isp/altas', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const altFull = await page.evaluate(() => document.body.innerText);
  const altContent = altFull.substring(600);
  console.log('\n=== ALTAS (despues de sidebar) ===');
  console.log(altContent.substring(0, 500));

  await browser.close();
})();
