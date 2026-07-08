const { chromium } = require('playwright');

(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const pages = b.contexts()[0].pages();
  const p = pages[pages.length - 1] || await b.contexts()[0].newPage();
  await p.bringToFront();

  // Listen for console messages and errors
  const errors = [];
  p.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE ERR: ' + msg.text()); });
  p.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

  await p.goto('https://movilbro-crm.onrender.com/isp/nube', { timeout: 30000, waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  // Check the page state
  const title = await p.title();
  console.log('Title:', title);

  // Look for "Carpeta vacía" or any existing folders
  const bodyText = await p.textContent('body');
  if (bodyText.includes('Carpeta vac')) {
    console.log('STATUS: Muestra "Carpeta vacía" — Drive no conectado');
  } else {
    console.log('STATUS: Hay contenido en la página');
  }

  // Check for any error messages on the page
  const errorEls = await p.$$('.alert-danger, .alert-warning, .error, [class*="error"]');
  for (const el of errorEls) {
    const text = await el.textContent();
    console.log('ERROR EN PAGINA:', text.trim().substring(0, 200));
  }

  // Look for "Crear carpeta" or "Nueva carpeta" button
  const buttons = await p.$$('button, a.btn');
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text.toLowerCase().includes('carpeta') || text.toLowerCase().includes('crear') || text.toLowerCase().includes('nuev')) {
      console.log('BUTTON FOUND:', text.trim());
    }
  }

  // Try to find the create folder button and click it
  const createBtn = await p.$('button:has-text("Crear"), a:has-text("Crear"), button:has-text("Nueva carpeta"), a:has-text("Nueva carpeta")');
  if (createBtn) {
    console.log('Clicking create folder button...');
    await createBtn.click();
    await p.waitForTimeout(1000);

    // Check for modal or prompt
    const modal = await p.$('.modal.show, .modal.fade.show, [role="dialog"]');
    if (modal) {
      const modalText = await modal.textContent();
      console.log('MODAL:', modalText.trim().substring(0, 300));
    }

    // Check for prompt
    const dialog = await p.$('input[placeholder*="nombre"], input[placeholder*="carpeta"]');
    if (dialog) {
      console.log('Found folder name input');
      await dialog.fill('test-folder-' + Date.now());
      // Click confirm
      const confirmBtn = await p.$('button:has-text("Crear"), button:has-text("Aceptar"), button:has-text("Guardar")');
      if (confirmBtn) {
        await confirmBtn.click();
        await p.waitForTimeout(2000);
        console.log('Submitted folder creation');
      }
    }
  } else {
    console.log('NO create folder button found');
  }

  console.log('\nALL ERRORS:', errors.length ? errors.join('\n') : 'None');
  
  // Check network errors
  console.log('\nCurrent URL:', p.url());

  console.log('\nDone — browser left open');
})();
