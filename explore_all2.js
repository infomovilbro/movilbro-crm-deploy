const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Login to ISP Gestion
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => { var el = document.getElementById('coordenadas_control_presencia'); if (el) el.value = '37.019,-4.561'; });
  await page.fill('#LoginForm_usuario', '25345979W');
  await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
  await page.click('#acceder');
  await page.waitForTimeout(4000);
  if (page.url().includes('login')) { console.log('ISP Login FAILED'); return; }
  console.log('✅ ISP Login OK');

  // 1. Try to log into Likes Telecom resources
  console.log('\n=== LIKES TELECOM RESOURCES LOGIN ===');
  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // Check login form
  var loginForm = await page.evaluate(() => {
    var inputs = [];
    document.querySelectorAll('input').forEach(function(el) {
      inputs.push({ name: el.getAttribute('name') || '', type: el.type, placeholder: el.placeholder });
    });
    var buttons = [];
    document.querySelectorAll('button').forEach(function(el) {
      buttons.push(el.textContent.trim());
    });
    return { inputs: inputs, buttons: buttons };
  });
  console.log('Login form:', JSON.stringify(loginForm));

  // Try to login with the known email
  var emailInput = await page.$('input[type="email"], input[placeholder*="Email"]');
  if (emailInput) {
    await emailInput.fill('eloyfuentesbermudez@gmail.com');
    var submitBtn = await page.$('button[type="submit"], button:has-text("Enviar")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      var afterLogin = await page.evaluate(() => document.body?.innerText?.substring(0, 1000) || '');
      console.log('After login:', afterLogin);
      
      // Get page content
      var links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a, button')).map(function(el) {
          return { text: el.textContent.trim().substring(0, 60), href: el.getAttribute('href') || '', tag: el.tagName };
        }).filter(function(l) { return l.text.length > 0; });
      });
      console.log('Elements:', links.slice(0, 40));
    }
  }

  // 2. Test "Exportar vista" in contratos
  console.log('\n=== EXPORTAR VISTA ===');
  await page.goto('https://movilbro.ispgestion.com/contratosmadre', { waitUntil: 'networkidle', timeout: 15000 });
  
  // Click the export button
  var exportBtn = await page.$('a, button', { hasText: 'Exportar' });
  if (exportBtn) {
    console.log('Export button text:', await exportBtn.textContent());
    // Don't click it - it might download a file
  }

  // Get the Exportar link
  var exportLinks = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('a').forEach(function(a) {
      if (a.textContent.trim().includes('Exportar') || a.href.includes('export') || a.href.includes('csv')) {
        items.push({ text: a.textContent.trim(), href: a.getAttribute('href'), onclick: a.getAttribute('onclick')?.substring(0, 100) });
      }
    });
    return items;
  });
  console.log('Export links:', exportLinks);

  // 3. Check for download links in listados
  console.log('\n=== LISTADOS EXPORTS ===');
  await page.goto('https://movilbro.ispgestion.com/listados', { waitUntil: 'networkidle', timeout: 15000 });
  
  // Click on "Clientes Consumo" to see details
  var consumoLink = await page.evaluate(() => {
    var links = document.querySelectorAll('a');
    for (var a of links) {
      if (a.textContent.trim() === 'Clientes Consumo') {
        var href = a.getAttribute('href');
        var onclick = a.getAttribute('onclick');
        return { href: href, onclick: onclick?.substring(0, 100) };
      }
    }
    return null;
  });
  console.log('Consumo link:', consumoLink);

  await browser.close();
})();
