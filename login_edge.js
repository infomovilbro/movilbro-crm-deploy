const { chromium } = require('playwright');

(async () => {
  console.log('Launching Edge...');
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to ISP Gestion...');
  await page.goto('https://movilbro.ispgestion.com/panelMando', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  const url = page.url();
  console.log('URL:', url);

  if (url.includes('login')) {
    console.log('Not logged in - need to login');
    await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle' });
    // Try to login
    await page.evaluate(() => {
      document.getElementById('coordenadas_control_presencia').value = '37.019,-4.561';
    });
    await page.fill('#LoginForm_usuario', '25345335W');
    await page.fill('#LoginForm_contrase\u00f1a', 'Ortiz88');
    await page.click('#acceder');
    await page.waitForTimeout(5000);
    console.log('After login URL:', page.url());
  } else {
    console.log('ALREADY LOGGED IN! Extracting data...');
  }

  // Get all navigation links
  const links = await page.$$('a[href]');
  const seen = new Set();
  console.log('\n=== NAVIGATION LINKS ===');
  for (const l of links) {
    const href = await l.getAttribute('href');
    const text = (await l.textContent()).trim();
    if (href && href.startsWith('/') && !href.includes('logout') && !seen.has(href) && text.length > 0) {
      seen.add(href);
      console.log('  ' + href.padEnd(45) + text.substring(0, 60));
    }
  }

  // Save screenshot
  await page.screenshot({ path: 'isp_dashboard.png', fullPage: true });
  console.log('\nScreenshot saved: isp_dashboard.png');

  await browser.close();
})();
