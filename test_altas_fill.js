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

  // Try to fill via evaluate instead of page.fill
  const filled = await page.evaluate(() => {
    const setVal = (name, val) => {
      const el = document.querySelector('input[name="' + name + '"]');
      if (!el) return false;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    return {
      wNombre: setVal('wNombre', 'Test'),
      wApellidos: setVal('wApellidos', 'Cliente'),
      wDni: setVal('wDni', '12345678Z'),
      wTelefono: setVal('wTelefono', '666666666'),
      wEmail: setVal('wEmail', 'test@test.com'),
      wDireccion: setVal('wDireccion', 'Calle Test 123'),
      wCiudad: setVal('wCiudad', 'Madrid'),
      wCp: setVal('wCp', '28001')
    };
  });
  console.log('Filled via JS:', JSON.stringify(filled));

  await page.waitForTimeout(1000);

  // Check button
  const btnState = await page.evaluate(() => {
    const btn = document.getElementById('btnStep1Next');
    if (!btn) return 'NOT FOUND';
    return { disabled: btn.disabled, text: btn.innerText.trim() };
  });
  console.log('Boton despues:', JSON.stringify(btnState));

  // If still disabled, try to click anyway
  if (btnState.disabled) {
    console.log('Boton sigue disabled - revisando eventos...');
    // Check what JS enables the button
    const eventListeners = await page.evaluate(() => {
      const inputs = document.querySelectorAll('#nuevoCliente input, #nuevoCliente select');
      return Array.from(inputs).map(i => ({
        name: i.name,
        id: i.id,
        oninput: typeof i.oninput,
        onchange: typeof i.onchange,
        onkeyup: typeof i.onkeyup
      }));
    });
    console.log('Listeners:', JSON.stringify(eventListeners, null, 2));
  } else {
    console.log('BOTON HABILITADO! Haciendo click...');
    await page.click('#btnStep1Next');
    await page.waitForTimeout(2000);
    // Check which step is now visible
    const step2vis = await page.evaluate(() => {
      return document.getElementById('btnStep2Next') ? document.getElementById('btnStep2Next').offsetParent !== null : 'NO BTN2';
    });
    console.log('Paso 2 visible:', step2vis);
  }

  await browser.close();
})();
