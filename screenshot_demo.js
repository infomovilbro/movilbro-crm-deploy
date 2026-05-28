const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas', { waitUntil: 'networkidle', timeout: 15000 });
  var loggedIn = !page.url().includes('login');
  console.log('Logged in:', loggedIn ? 'YES' : 'NO');

  if (loggedIn) {
    // Create demo CDRs for Ivan
    await page.evaluate(async () => {
      await fetch('/isp/cdrs/create', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'fiscal_id=25345335W&linea=633879873&concepto=GB+extra+consumidos+(0.7+GB)&tipo=exceso&importe=3.50&unidades=0.7&periodo=2026-05' });
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      await fetch('/isp/cdrs/create', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'fiscal_id=25345335W&linea=633879873&concepto=Llamadas+internacionales+(12+min)&tipo=llamadas&importe=2.40&unidades=12&periodo=2026-05' });
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      await fetch('/isp/cdrs/create', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'fiscal_id=25345335W&linea=633879873&concepto=SMS+premium+(5+SMS)&tipo=sms&importe=1.25&unidades=5&periodo=2026-05' });
    });

    // Go to facturacion page and click Generar
    await page.goto('https://movilbro-crm.onrender.com/isp/facturacion', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Click the generar button by id
    await page.evaluate(() => {
      var btn = document.getElementById('btnGenerarFacturas');
      if (btn) btn.click();
    });

    // Wait for generation
    console.log('Generando facturas...');
    await page.waitForTimeout(25000);

    // Go to facturas list
    await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Scroll to the bottom to see the latest invoice
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Take screenshot
    await page.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\isp\\prueba2\\movilbro-crm\\facturas_demo.png', fullPage: true });
    console.log('Screenshot saved!');

    // Get the latest invoice URL
    var lastLink = await page.evaluate(() => {
      var links = document.querySelectorAll('a[href*="facturas/"]');
      var last = null;
      for (var a of links) {
        var h = a.getAttribute('href');
        if (h && h.includes('facturas/') && !h.includes('facturas/create')) last = h;
      }
      return last;
    });
    if (lastLink) console.log('Ultima factura: https://movilbro-crm.onrender.com' + lastLink);
  }

  await browser.close();
})();
