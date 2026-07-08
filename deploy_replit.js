const { chromium } = require('playwright');

(async () => {
  console.log('[1/8] Conectando a Edge via CDP...');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  const pages = contexts[0]?.pages() || [];

  console.log(`  Paginas abiertas: ${pages.length}`);
  for (const p of pages) {
    console.log(`  - ${p.url().slice(0, 100)}`);
  }

  // Find Replit page
  const replitPage = pages.find(p => p.url().includes('replit'));
  if (!replitPage) {
    console.error('ERROR: No se encontro pagina de Replit');
    await browser.close();
    process.exit(1);
  }
  console.log(`[2/8] Replit encontrada: ${replitPage.url()}`);
  await replitPage.bringToFront();

  // Wait a bit for page to be ready
  await replitPage.waitForTimeout(2000);

  // Try to find the xterm textarea and click it
  console.log('[3/8] Buscando terminal...');

  // Try clicking Ctrl+` to open terminal first
  try {
    await replitPage.keyboard.press('Control+`');
    await replitPage.waitForTimeout(1000);
  } catch (e) {
    console.log('  Ctrl+` fallo, continuando...');
  }

  // Look for xterm textarea
  const textareaSelector = '.xterm-helper-textarea';
  const altSelectors = [
    'textarea.xterm-helper-textarea',
    '.xterm textarea',
    '.xterm-accessibility textarea',
    'textarea[aria-label="Terminal input"]',
    '.xterm-helper-textarea',
    // Try more generic Replit shell selectors
    '#terminal textarea',
    '[data-testid="terminal"] textarea',
    '.shell textarea',
    'div.xterm textarea',
  ];

  let shellInput = null;
  for (const sel of altSelectors) {
    try {
      shellInput = await replitPage.waitForSelector(sel, { timeout: 3000 });
      if (shellInput) {
        console.log(`  Terminal encontrada con selector: ${sel}`);
        break;
      }
    } catch (e) {
      // continue
    }
  }

  if (!shellInput) {
    console.log('  Terminal no encontrada con selectores comunes, buscando en DOM...');
    // Dump relevant HTML
    const hasTerminal = await replitPage.evaluate(() => {
      return {
        hasXterm: document.querySelector('.xterm') !== null,
        hasTextarea: document.querySelector('textarea') !== null,
        textareaCount: document.querySelectorAll('textarea').length,
        hasShell: document.querySelector('[class*="shell"]') !== null,
        hasTerm: document.querySelector('[class*="terminal"]') !== null,
      };
    });
    console.log(`  DOM checks:`, JSON.stringify(hasTerminal));
    await browser.close();
    process.exit(1);
  }

  console.log('[4/8] Limpiando y escribiendo comando...');
  await shellInput.click();
  await replitPage.waitForTimeout(300);

  // Clear any existing content - Ctrl+A then Delete
  await replitPage.keyboard.press('Control+a');
  await replitPage.waitForTimeout(100);
  await replitPage.keyboard.press('Delete');
  await replitPage.waitForTimeout(200);

  // Type the command character by character for reliability
  const command = 'git pull && pkill -9 -f node && sleep 1 && PORT=5000 node server.js';
  await replitPage.keyboard.type(command, { delay: 25 });
  console.log('  Comando escrito');

  await replitPage.waitForTimeout(500);

  console.log('[5/8] Presionando Enter...');
  await replitPage.keyboard.press('Enter');

  console.log('[6/8] Esperando 5 segundos para que arranque el servidor...');
  await replitPage.waitForTimeout(5000);

  // Check for server output
  const consoleOutput = await replitPage.evaluate(() => {
    const lines = document.querySelectorAll('.xterm-rows div, .xterm-rows span, .terminal .xterm-rows *');
    if (!lines.length) return 'No se encontraron lineas en terminal';
    const texts = Array.from(lines).slice(-20).map(l => l.textContent).join('\n');
    return texts;
  }).catch(() => 'No se pudo leer terminal');
  console.log(`  Salida del terminal (ultimas lineas):\n${consoleOutput}`);

  // Try to find preview iframe
  console.log('[7/8] Buscando preview de Replit...');

  const previewFound = await replitPage.evaluate(() => {
    const iframes = document.querySelectorAll('iframe');
    const previewData = Array.from(iframes).map(f => ({
      src: f.src,
      title: f.title,
      id: f.id,
      className: f.className?.slice(0, 100),
    }));
    return previewData;
  }).catch(() => []);

  console.log(`  Iframes encontrados: ${previewFound.length}`);
  for (const f of previewFound) {
    console.log(`    - title="${f.title}" src="${f.src?.slice(0, 120)}"`);
  }

  let previewUrl = null;
  if (previewFound.length > 0) {
    // Find one that looks like a preview
    for (const f of previewFound) {
      if (f.src && (f.src.includes('5000') || f.title.toLowerCase().includes('preview') || f.className?.includes('preview'))) {
        previewUrl = f.src;
        break;
      }
    }
    // Fallback to first iframe with a URL
    if (!previewUrl) {
      previewUrl = previewFound[0].src;
    }
  }

  if (!previewUrl || previewUrl === 'about:blank' || !previewUrl.startsWith('http')) {
    console.log('  No se encontro preview en iframe, buscando en pagina...');
    const links = await replitPage.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="replit"]');
      return Array.from(anchors).slice(0, 5).map(a => a.href);
    }).catch(() => []);
    console.log(`  Links Replit: ${JSON.stringify(links)}`);
    // Try to get the page URL itself - maybe it's already the preview
    previewUrl = replitPage.url();
  }

  console.log(`[8/8] Navegando a preview: ${previewUrl}`);
  const previewPage = await browser.newPage();
  await previewPage.goto(previewUrl, { waitUntil: 'networkidle', timeout: 30000 }).catch(e => {
    console.log(`  goto fallo, intentando con wait: ${e.message}`);
  });

  await previewPage.waitForTimeout(3000);
  console.log(`  URL actual: ${previewPage.url()}`);

  // Take screenshot
  await previewPage.screenshot({ path: 'preview_login.png', fullPage: true });
  console.log('  Screenshot guardado como preview_login.png');

  // Fill login form
  console.log('  Buscando formulario de login...');

  // Try different selectors
  const loginFields = await previewPage.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="text"], input[type="password"], input[name="usuario"], input[name="password"], input:not([type="hidden"])');
    return Array.from(inputs).map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
      placeholder: i.placeholder,
      className: i.className?.slice(0, 60),
    }));
  }).catch(() => []);

  console.log(`  Campos encontrados: ${JSON.stringify(loginFields)}`);

  // Fill username
  let filled = false;
  const userSelectors = ['input[name="usuario"]', 'input[name="username"]', 'input[type="text"]', '#usuario', '#username'];
  const passSelectors = ['input[name="password"]', 'input[type="password"]', '#password', '#pass'];

  for (const sel of userSelectors) {
    try {
      const el = await previewPage.waitForSelector(sel, { timeout: 2000 });
      if (el) {
        await el.click();
        await el.fill('aaa1');
        console.log(`  Usuario escrito en: ${sel}`);
        filled = true;
        break;
      }
    } catch (e) { /* continue */ }
  }

  if (!filled) {
    console.log('  No se pudo encontrar campo de usuario');
  }

  for (const sel of passSelectors) {
    try {
      const el = await previewPage.waitForSelector(sel, { timeout: 2000 });
      if (el) {
        await el.click();
        await el.fill('aaa123');
        console.log(`  Password escrito en: ${sel}`);
        break;
      }
    } catch (e) { /* continue */ }
  }

  // Find and click login button
  const btnSelectors = [
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Login")',
    'button:has-text("Ingresar")',
    'button:has-text("Acceder")',
    'input[type="submit"]',
    'button.btn-primary',
    '.btn-primary',
    'form button',
  ];

  for (const sel of btnSelectors) {
    try {
      const btn = await previewPage.waitForSelector(sel, { timeout: 2000 });
      if (btn) {
        await btn.click();
        console.log(`  Boton clic: ${sel}`);
        break;
      }
    } catch (e) { /* continue */ }
  }

  // Wait for navigation
  await previewPage.waitForTimeout(3000);

  // Take screenshot after login
  await previewPage.screenshot({ path: 'preview_after_login.png', fullPage: true });
  console.log('  Screenshot post-login guardado como preview_after_login.png');

  // Check what happened
  const afterUrl = previewPage.url();
  const afterTitle = await previewPage.title();
  const pageContent = await previewPage.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent;
    const title = document.title;
    const main = document.querySelector('main, .main, .container, .dashboard')?.textContent?.slice(0, 500);
    const error = document.querySelector('.error, .alert, .alert-danger, .text-danger')?.textContent;
    return { h1, title, main: main?.trim()?.slice(0, 300), error: error?.trim() };
  });

  console.log('\n========== RESULTADO ==========');
  console.log(`URL despues del login: ${afterUrl}`);
  console.log(`Titulo: ${afterTitle}`);
  if (pageContent.h1) console.log(`H1: ${pageContent.h1}`);
  if (pageContent.error) console.log(`ERROR: ${pageContent.error}`);
  if (pageContent.main) console.log(`Contenido principal: ${pageContent.main}`);
  console.log('================================\n');

  await browser.close();
  console.log('Script completado.');
})();
