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

  // Check button state before filling
  const btnBefore = await page.evaluate(() => {
    const btn = document.getElementById('btnStep1Next');
    if (!btn) return 'NOT FOUND';
    return { disabled: btn.disabled, innerText: btn.innerText.trim(), className: btn.className };
  });
  console.log('Antes de rellenar:', JSON.stringify(btnBefore));

  // Check what validation is on the form
  const valRules = await page.evaluate(() => {
    const form = document.querySelector('#nuevoCliente form') || document.querySelector('#step1Form') || document.querySelector('form');
    if (!form) return 'NO FORM';
    const els = form.querySelectorAll('[required], [pattern], [minlength]');
    return Array.from(els).map(el => ({
      name: el.name || el.id,
      required: el.required || false,
      pattern: el.pattern || null,
      minLength: el.minLength || null,
      type: el.type
    }));
  });
  console.log('Reglas validacion:', JSON.stringify(valRules, null, 2));

  // Now fill required fields
  await page.fill('input[name="wNombre"]', 'Test');
  await page.fill('input[name="wApellidos"]', 'Cliente');
  await page.fill('input[name="wDni"]', '12345678Z');
  await page.fill('input[name="wTelefono"]', '666666666');
  await page.fill('input[name="wEmail"]', 'test@test.com');
  await page.fill('input[name="wDireccion"]', 'Calle Test 123');
  await page.fill('input[name="wCiudad"]', 'Madrid');
  await page.fill('input[name="wCp"]', '28001');

  // Check that values were set
  const values = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#nuevoCliente input')).map(i => ({
      name: i.name,
      value: i.value
    }));
  });
  console.log('Valores tras rellenar:', JSON.stringify(values, null, 2));

  await page.waitForTimeout(1000);

  // Check button state after filling
  const btnAfter = await page.evaluate(() => {
    const btn = document.getElementById('btnStep1Next');
    if (!btn) return 'NOT FOUND';
    return { disabled: btn.disabled, innerText: btn.innerText.trim(), className: btn.className };
  });
  console.log('Despues de rellenar:', JSON.stringify(btnAfter));

  // Check if there are JS validation errors
  const jsErrors = await page.evaluate(() => {
    const msgs = document.querySelectorAll('.text-danger, .invalid-feedback, .error-msg, [class*="validation"]');
    return Array.from(msgs).filter(m => m.offsetParent !== null).map(m => m.innerText);
  });
  console.log('Errores JS visibles:', jsErrors);

  await browser.close();
})();
