const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (let i = 0; i < 15; i++) {
    await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 90000 });
    await page.fill('input[name="email"]', 'aaa');
    await page.fill('input[name="password"]', 'aaa');
    const [resp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
      page.click('button[type="submit"]')
    ]);
    await page.waitForTimeout(1000);
    const url = page.url();
    const hasError = await page.evaluate(() => !!document.querySelector('.alert-danger'));

    if (!hasError && url.includes('/tienda')) {
      console.log('LOGIN OK');
      // Test PDF - should redirect to HTML view now
      const pdfResp = await page.goto('https://movilbro-crm.onrender.com/isp/nube/pdf/1236', { timeout: 60000 });
      const ct = pdfResp.headers()['content-type'] || '';
      const status = pdfResp.status();
      console.log('PDF status:', status, 'type:', ct);
      console.log('Final URL:', page.url());
      if (page.url().includes('/view')) {
        console.log('REDIRIGIO a HTML view - fallback funciona');
      } else {
        const body = await page.evaluate(() => document.body.innerText.substring(0, 300));
        console.log('Body:', body);
      }
      break;
    }
    console.log('Esperando deploy... intento ' + (i + 1));
    await page.waitForTimeout(30000);
  }
  await browser.close();
})();
