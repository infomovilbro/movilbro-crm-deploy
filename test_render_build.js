const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680/events', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.fill('input[name="email"]', 'infomovilbro@gmail.com');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Continue")');
  await page.waitForTimeout(2000);
  await page.fill('input[name="password"]', '');
  await page.click('button:has-text("Log in")');
  await page.waitForTimeout(5000);
  console.log('URL:', page.url());
  const body = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('Body:', body);
  await browser.close();
})();
