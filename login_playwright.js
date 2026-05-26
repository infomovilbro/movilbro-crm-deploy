const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject geolocation mock BEFORE any page scripts run
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (s) => s({
      coords: { latitude: 37.019, longitude: -4.561, accuracy: 10 },
      timestamp: Date.now()
    });
  });

  console.log('1. Navigate to login...');
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('2. URL:', page.url());

  // Set hidden fields
  await page.evaluate(() => {
    document.getElementById('coordenadas_control_presencia').value = '37.019,-4.561';
  });

  console.log('3. Fill and submit form...');
  await page.fill('#LoginForm_usuario', '25345335W');
  await page.fill('#LoginForm_contrase\u00f1a', 'Ortiz88');

  // Submit and wait
  await page.waitForTimeout(500);
  await page.click('#acceder');
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log('4. URL after login:', url);

  if (url.includes('site/login')) {
    console.log('LOGIN FAILED');
    const html = await page.content();
    // Save for debugging
    require('fs').writeFileSync('login_failed.html', html);
    
    const errSummary = await page.$('.errorSummary');
    if (errSummary) console.log('Error:', (await errSummary.textContent()).trim());
    
    // Get all text on page that looks like an error
    const errorTexts = await page.evaluate(() => {
      const errs = [];
      document.querySelectorAll('.error, .alert, .help-block, [class*=error]').forEach(el => {
        if (el.textContent.trim()) errs.push(el.textContent.trim());
      });
      return errs;
    });
    console.log('Error texts:', errorTexts);

  } else {
    console.log('LOGIN OK!');
    const links = await page.$$('a[href]');
    const seen = new Set();
    for (const l of links) {
      const href = await l.getAttribute('href');
      const text = (await l.textContent()).trim();
      if (href && href.startsWith('/') && !href.includes('logout') && !seen.has(href)) {
        seen.add(href);
        console.log('  ' + href.padEnd(45) + text.substring(0, 60));
      }
    }
  }

  await browser.close();
})();
