const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // Login
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 120000 });
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);

  // Check client detail page
  await page.goto('https://movilbro-crm.onrender.com/isp/clientes/detalle/1', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const cliFull = await page.evaluate(() => document.body.innerText);
  const cliHasInfo = cliFull.includes('Información') && cliFull.includes('Líneas');
  const cliHasKYC = cliFull.includes('Documentos KYC') || cliFull.includes('KYC');
  const cliHasOrdenes = cliFull.includes('Órdenes') || cliFull.includes('ordenes');
  const tabs = await page.evaluate(() => {
    const els = document.querySelectorAll('.nav-link, .tab, button[role=tab]');
    return Array.from(els).map(e => e.innerText.trim());
  });
  console.log('CLIENTE tabs:', tabs.join(' | '));
  console.log('CLIENTE Tiene Informacion:', cliHasInfo, '| KYC:', cliHasKYC, '| Ordenes:', cliHasOrdenes);

  // Check altas page
  await page.goto('https://movilbro-crm.onrender.com/isp/altas', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const altFull = await page.evaluate(() => document.body.innerText);
  const altHasSteps = altFull.includes('Paso') || altFull.includes('Cliente') || altFull.includes('Producto');
  const altHasPendientes = altFull.includes('Pendientes') || altFull.includes('pendientes');
  console.log('ALTAS Contiene formulario:', altHasSteps, '| Pendientes:', altHasPendientes);
  console.log('ALTAS preview:', altFull.substring(0, 500));

  await browser.close();
})();
