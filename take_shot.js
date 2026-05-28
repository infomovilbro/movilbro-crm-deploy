const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Login
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'eloyfuentesbermudez@gmail.com');
  await page.fill('input[name="password"]', 'eloy2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  if (page.url().includes('login')) {
    console.log('Login FAILED - trying recovery...');
    await page.fill('input[name="email"]', 'eloyfuentesbermudez@gmail.com');
    await page.click('button:has-text("Recuperar")');
    await page.waitForTimeout(2000);
    var body = await page.content();
    var match = body.match(/Tu nueva contrase[^\s]+[\s]*[^<]*/);
    if (match) console.log('Password shown:', match[0]);
    console.log('Could not login');
    await browser.close();
    return;
  }

  console.log('Login OK');

  // Create demo invoice
  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click generar button
  await page.evaluate(() => {
    var btn = document.getElementById('btnGenerarFacturas');
    if (btn) btn.click();
  });
  console.log('Generating...');
  await page.waitForTimeout(30000);

  // Go to facturas
  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click on the last invoice link
  await page.evaluate(() => {
    var links = document.querySelectorAll('a[href*="facturas/"]');
    var last = null;
    for (var a of links) {
      var h = a.getAttribute('href');
      if (h && h.includes('facturas/') && !h.includes('create')) last = h;
    }
    if (last) window.location.href = 'https://movilbro-crm.onrender.com' + last;
  });
  await page.waitForTimeout(3000);

  // Take screenshot of the invoice detail
  await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\isp\\prueba2\\movilbro-crm\\factura_demo.png', fullPage: true });
  console.log('Screenshot taken!');
  console.log('File: factura_demo.png');

  await browser.close();
})();
