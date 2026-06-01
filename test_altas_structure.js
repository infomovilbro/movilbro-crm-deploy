const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 120000 });
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);

  await page.goto('https://movilbro-crm.onrender.com/altas', { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Check the HTML structure to find step 1 container
  const step1html = await page.evaluate(() => {
    // Find the first step content
    const steps = document.querySelectorAll('[class*="step"], [class*="tab-pane"], [class*="wizard"], [data-step]');
    return Array.from(steps).map(s => ({
      id: s.id,
      classes: s.className,
      visible: s.offsetParent !== null,
      html: s.innerHTML.substring(0, 200)
    }));
  });
  console.log('PASOS:', JSON.stringify(step1html, null, 2));

  // Also try to find any visible form
  const visibleForm = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input:not([type=hidden])'));
    return inputs.filter(i => i.offsetParent !== null).map(i => ({
      name: i.name || i.id,
      placeholder: i.placeholder,
      type: i.type
    }));
  });
  console.log('INPUTS VISIBLES:', JSON.stringify(visibleForm, null, 2));

  await browser.close();
})();
