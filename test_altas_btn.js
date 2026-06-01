const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Login
  await page.goto('https://movilbro-crm.onrender.com/auth/login', { timeout: 120000 });
  await page.fill('input[name="email"]', 'aaa');
  await page.fill('input[name="password"]', 'aaa');
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);

  // Go to altas
  await page.goto('https://movilbro-crm.onrender.com/altas', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Fill form
  console.log('Rellenando formulario...');
  await page.fill('input[name="nombre"]', 'Test Cliente');
  await page.fill('input[name="apellidos"]', 'Prueba');
  await page.fill('input[name="dni_nif"]', '12345678Z');
  await page.fill('input[name="telefono"]', '666666666');
  await page.fill('input[name="email"]', 'test@test.com');
  
  // Check for console errors
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Find and click "Siguiente: Producto" button
  const btn = await page.$('button:has-text("Siguiente")');
  if (!btn) {
    console.log('BOTON NO ENCONTRADO');
    // Try to find it
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        disabled: b.disabled,
        visible: b.offsetParent !== null,
        classes: b.className
      }));
    });
    console.log('Botones encontrados:', JSON.stringify(buttons, null, 2));
    
    // Check HTML structure near the form
    const html = await page.evaluate(() => {
      const form = document.querySelector('form');
      return form ? form.innerHTML.substring(0, 1000) : 'NO FORM';
    });
    console.log('Form HTML:', html);
  } else {
    const disabled = await btn.isDisabled();
    const visible = await btn.isVisible();
    console.log('Boton encontrado - disabled:', disabled, 'visible:', visible);
    
    if (!disabled) {
      await btn.click();
      await page.waitForTimeout(2000);
      console.log('URL despues de click:', page.url());
      const body = await page.evaluate(() => document.body.innerText.substring(600, 1200));
      console.log('Contenido paso 2:', body);
    } else {
      console.log('Boton DESHABILITADO, revisando validacion...');
    }
  }

  await browser.close();
})();
