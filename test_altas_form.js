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
  await page.goto('https://movilbro-crm.onrender.com/altas', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      name: el.name || el.id || 'no-name',
      type: el.type || el.tagName,
      placeholder: el.placeholder || ''
    }));
  });
  console.log('INPUTS:', JSON.stringify(inputs, null, 2));
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.innerText.trim(),
      disabled: b.disabled,
      visible: b.offsetParent !== null
    }));
  });
  console.log('BUTTONS:', JSON.stringify(buttons, null, 2));
  await browser.close();
})();
