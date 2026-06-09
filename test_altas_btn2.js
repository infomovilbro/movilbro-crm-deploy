const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));

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

  // Fill form (correct field names: wNombre, wDni, etc.)
  await page.fill('input[name="wNombre"]', 'Test Cliente');
  await page.fill('input[name="wApellidos"]', 'Prueba');
  await page.fill('input[name="wDni"]', '12345678Z');
  await page.fill('input[name="wTelefono"]', '666666666');
  await page.fill('input[name="wEmail"]', 'test@test.com');
  await page.fill('input[name="wDireccion"]', 'Calle Test 123');
  await page.fill('input[name="wCiudad"]', 'Madrid');
  await page.fill('input[name="wCp"]', '28001');
  
  // Wait a moment for validation to run
  await page.waitForTimeout(500);

  // Check button state
  const btn = await page.$('button:has-text("Siguiente: Producto")');
  if (btn) {
    const disabled = await btn.isDisabled();
    const classes = await btn.evaluate(el => el.className);
    console.log('Boton disabled:', disabled, 'classes:', classes);
    
    if (!disabled) {
      console.log('BOTON HABILITADO! Haciendo click...');
      await btn.click();
      await page.waitForTimeout(2000);
      console.log('URL:', page.url());
      const content = await page.evaluate(() => document.body.innerText.substring(800, 1500));
      console.log('Contenido paso 2:', content);
    } else {
      // Check what validation errors exist
      const errors = await page.evaluate(() => {
        const errEls = document.querySelectorAll('.invalid-feedback, .error, .text-danger, [class*="error"]');
        return Array.from(errEls).map(e => e.innerText.trim()).filter(t => t);
      });
      console.log('Errores validacion:', errors);
      
      // Check for any validation attributes
      const validation = await page.evaluate(() => {
        const form = document.querySelector('form') || document;
        const inputs = form.querySelectorAll('input, select, textarea');
        return Array.from(inputs).map(el => ({
          name: el.name || el.id,
          required: el.required,
          pattern: el.pattern || null,
          minLength: el.minLength || null,
          value: el.value ? el.value.substring(0, 20) : '(empty)',
          validationMessage: el.validationMessage || ''
        })).filter(i => i.name);
      });
      console.log('Campos con validacion:', JSON.stringify(validation.filter(v => v.required || v.pattern), null, 2));
    }
  } else {
    console.log('BOTON NO ENCONTRADO');
  }

  await browser.close();
})();
