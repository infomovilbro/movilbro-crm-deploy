const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  // 1. Login
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 120000 });
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);
  console.log('1. LOGIN: ' + (page.url().includes('/tienda') ? 'OK' : 'FAIL'));
  if (!page.url().includes('/tienda')) { await browser.close(); return; }

  // 2. Facturacion page
  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion', { timeout: 30000 });
  await page.waitForTimeout(2000);
  const facTitle = await page.evaluate(() => document.title || document.querySelector('h1, h2, h3')?.innerText || '');
  console.log('2. FACTURACION: ' + (facTitle.includes('Factura') || facTitle.includes('factura') || page.url().includes('facturacion') ? 'OK (' + facTitle.substring(0,50) + ')' : 'POSIBLE FALLO - titulo: ' + facTitle.substring(0,50)));

  // 3. HTML invoice view (invoice 1236)
  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas/1236/view', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const invBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const invOk = invBody.includes('Factura') || invBody.includes('IVA') || invBody.includes('TOTAL');
  console.log('3. FACTURA HTML: ' + (invOk ? 'OK' : 'POSIBLE FALLO'));
  if (!invOk) console.log('   Contenido: ' + invBody.substring(0,100));

  // 4. Client detail page (cliente id 1)
  await page.goto('https://movilbro-crm.onrender.com/isp/clientes/detalle/1', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const cliBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const cliOk = cliBody.includes('Información') || cliBody.includes('Cliente') || cliBody.includes('Líneas');
  console.log('4. CLIENTE DETALLE: ' + (cliOk ? 'OK' : 'POSIBLE FALLO - ' + cliBody.substring(0,80)));

  // 5. Altas page
  await page.goto('https://movilbro-crm.onrender.com/isp/altas', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const altBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const altOk = altBody.includes('Alta') || altBody.includes('Cliente') || altBody.includes('Nueva');
  console.log('5. ALTAS: ' + (altOk ? 'OK' : 'POSIBLE FALLO - ' + altBody.substring(0,80)));

  // 6. Portabilidades page
  await page.goto('https://movilbro-crm.onrender.com/isp/portabilidades', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const porBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const porOk = porBody.includes('Portabilidad') || porBody.includes('portabilidad');
  console.log('6. PORTABILIDADES: ' + (porOk ? 'OK' : 'POSIBLE FALLO - ' + porBody.substring(0,80)));

  // 7. Incidencias/Tickets page
  await page.goto('https://movilbro-crm.onrender.com/isp/incidencias', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const incBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const incOk = incBody.includes('Incidencias') || incBody.includes('Ticket') || incBody.includes('ticket');
  console.log('7.INCIDENCIAS: ' + (incOk ? 'OK' : 'POSIBLE FALLO - ' + incBody.substring(0,80)));

  // 8. CDRs page
  await page.goto('https://movilbro-crm.onrender.com/isp/cdrs', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const cdrBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const cdrOk = cdrBody.includes('CDR') || cdrBody.includes('Llamadas') || cdrBody.includes('llamadas');
  console.log('8. CDRs: ' + (cdrOk ? 'OK' : 'POSIBLE FALLO - ' + cdrBody.substring(0,80)));

  // 9. Nube page
  await page.goto('https://movilbro-crm.onrender.com/isp/nube', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const nubBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const nubOk = nubBody.includes('Nube') || nubBody.includes('Archivos') || nubBody.includes('Carpeta');
  console.log('9. NUBE: ' + (nubOk ? 'OK' : 'POSIBLE FALLO - ' + nubBody.substring(0,80)));

  // 10. Calendario page
  await page.goto('https://movilbro-crm.onrender.com/isp/calendario', { timeout: 30000 });
  await page.waitForTimeout(1000);
  const calBody = await page.evaluate(() => document.body.innerText.substring(0, 200));
  const calOk = calBody.includes('Calendario') || calBody.includes('calendario');
  console.log('10. CALENDARIO: ' + (calOk ? 'OK' : 'POSIBLE FALLO - ' + calBody.substring(0,80)));

  // 11. PDF fallback verification
  await page.goto('https://movilbro-crm.onrender.com/isp/nube/pdf/1236', { timeout: 30000 });
  const pdfRedirected = page.url().includes('/view');
  console.log('11. PDF FALLBACK: ' + (pdfRedirected ? 'OK (redirige a HTML view)' : 'POSIBLE FALLO'));

  console.log('\n--- VERIFICACION COMPLETADA ---');
  await browser.close();
})();
