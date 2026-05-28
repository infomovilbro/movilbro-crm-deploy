const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // 1. Login to ISP Gestion
  console.log('=== LOGIN ISP GESTION ===');
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => { var el = document.getElementById('coordenadas_control_presencia'); if (el) el.value = '37.019,-4.561'; });
  await page.fill('#LoginForm_usuario', '25345979W');
  await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
  await page.click('#acceder');
  await page.waitForTimeout(4000);
  if (page.url().includes('login')) { console.log('ISP Login FAILED'); return; }
  console.log('ISP Login OK');

  // 2. Check Clientes Consumo listado
  console.log('\n=== CLIENTES CONSUMO ===');
  await page.goto('https://movilbro.ispgestion.com/listados', { waitUntil: 'networkidle', timeout: 15000 });
  
  // Find and open Clientes Consumo
  var consumoHref = await page.evaluate(() => {
    var links = document.querySelectorAll('a');
    for (var a of links) {
      var t = a.textContent.trim();
      if (t === 'Clientes Consumo' || t === 'Artículos Consumos' || t === 'Detalle exceso de Llamadas' || t.includes('EXCEDENTES')) {
        return { text: t, href: a.getAttribute('href') };
      }
    }
    return null;
  });
  
  if (consumoHref) {
    console.log('Found:', consumoHref.text, consumoHref.href);
    await page.goto('https://movilbro.ispgestion.com' + consumoHref.href, { waitUntil: 'networkidle', timeout: 15000 });
    var content = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
    console.log('Content:', content);
    
    // Look for export buttons
    var exportBtns = await page.evaluate(() => {
      var btns = [];
      document.querySelectorAll('a, button, input').forEach(function(el) {
        var t = el.textContent?.trim() || el.value || '';
        var h = el.getAttribute('href') || '';
        if (t.toLowerCase().includes('csv') || t.toLowerCase().includes('export') || t.toLowerCase().includes('excel') || t.toLowerCase().includes('descarg') || h.includes('csv') || h.includes('export') || h.includes('excel')) {
          btns.push({ text: t.substring(0, 40), href: h.substring(0, 80) });
        }
      });
      return btns;
    });
    console.log('Export buttons:', exportBtns);
  } else {
    console.log('Consumo links not found on listados');
    // Try to find them by looking at the full page
    var allText = await page.evaluate(() => document.body?.innerText || '');
    var consumoLines = allText.split('\n').filter(function(l) { return l.toLowerCase().includes('consumo') || l.toLowerCase().includes('excedente') || l.toLowerCase().includes('llamada'); });
    console.log('Lines with consumo/excedente:', consumoLines);
  }

  // 3. Check Likes Telecom resources
  console.log('\n=== LIKES TELECOM RESOURCES ===');
  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  var ltTitle = await page.title();
  var ltText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
  console.log('Title:', ltTitle);
  console.log('Body:', ltText);
  
  // Get all links on the resources page
  var ltLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(function(a) {
      return { text: a.textContent.trim().substring(0, 60), href: a.getAttribute('href') };
    }).filter(function(l) { return l.text || l.href; });
  });
  console.log('Links (' + ltLinks.length + '):');
  ltLinks.slice(0, 30).forEach(function(l) { console.log('  ' + l.text.padEnd(50) + (l.href || '').substring(0, 80)); });

  // 4. Try to login to Likes Telecom resources
  console.log('\n=== LIKES TELECOM LOGIN ===');
  // Check if there's a login page
  await page.goto('https://wd.likestelecom.com/login', { waitUntil: 'networkidle', timeout: 15000 }).catch(function() {});
  var loginTitle = await page.title();
  var loginText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
  console.log('Login page:', loginTitle, loginText);

  // 5. Check ISP Gestion for CSV download in contratos
  console.log('\n=== CONTRATOS CSV ===');
  await page.goto('https://movilbro.ispgestion.com/contratosmadre', { waitUntil: 'networkidle', timeout: 15000 });
  var csvBtns = await page.evaluate(() => {
    var btns = [];
    document.querySelectorAll('a, button').forEach(function(el) {
      var t = el.textContent?.trim() || '';
      if (t.toLowerCase().includes('csv') || t.toLowerCase().includes('export') || t.toLowerCase().includes('excel')) {
        btns.push(t.substring(0, 40));
      }
    });
    return btns;
  });
  console.log('CSV/Export buttons:', csvBtns);

  await browser.close();
})();
