const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (s) => s({ coords: { latitude: 37.019, longitude: -4.561, accuracy: 10 }, timestamp: Date.now() });
  });
  const page = await context.newPage();

  console.log('=== 1. LIKES TELECOM RESOURCES ===');
  try {
    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Status:', await page.title());
    var body = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '');
    console.log('Body:', body);
    
    // Check for links
    var links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({ href: a.getAttribute('href'), text: a.textContent.trim() }));
    });
    console.log('Links:', links.filter(l => l.text).length);
    links.filter(l => l.text).forEach(l => console.log('  ' + l.text.padEnd(40) + l.href));
  } catch(e) { console.log('Error:', e.message); }

  console.log('\n=== 2. ISP GESTION - BUSCAR CDRs ===');
  try {
    await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.evaluate(() => { var el = document.getElementById('coordenadas_control_presencia'); if (el) el.value = '37.019,-4.561'; });
    await page.fill('#LoginForm_usuario', '25345979W');
    await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
    await page.click('#acceder');
    await page.waitForTimeout(4000);
    
    if (page.url().includes('login')) { console.log('Login failed'); await browser.close(); return; }
    console.log('Login OK');

    // Check listados for export/download options
    await page.goto('https://movilbro.ispgestion.com/listados', { waitUntil: 'networkidle', timeout: 15000 });
    
    // Look for export-related links
    var exportLinks = await page.evaluate(() => {
      var items = [];
      document.querySelectorAll('a, button, input[type="button"]').forEach(function(el) {
        var text = el.textContent?.trim() || el.value || '';
        var href = el.getAttribute('href') || '';
        if (text.toLowerCase().includes('csv') || text.toLowerCase().includes('export') || text.toLowerCase().includes('excel') || text.toLowerCase().includes('descarg') || href.includes('csv') || href.includes('export')) {
          items.push({ text: text.substring(0, 50), href: href.substring(0, 100) });
        }
      });
      return items;
    });
    console.log('Export links:', exportLinks.length);
    exportLinks.forEach(function(l) { console.log('  ' + l.text.padEnd(40) + l.href); });

    // Look at Clientes Consumo listado details
    var consumoLink = await page.evaluate(() => {
      var links = document.querySelectorAll('a');
      for (var a of links) {
        if (a.textContent.includes('Clientes Consumo') || a.textContent.includes('Artículos Consumos') || a.textContent.includes('Detalle exceso')) {
          return { text: a.textContent.trim(), href: a.getAttribute('href') };
        }
      }
      return null;
    });
    if (consumoLink) console.log('\nConsumo link:', consumoLink.text, consumoLink.href);

    // Check Configuracion sections
    await page.goto('https://movilbro.ispgestion.com/configuracion', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    if (!page.url().includes('Error')) {
      var configText = await page.evaluate(() => document.body?.innerText?.substring(0, 1500) || '');
      console.log('\nConfiguracion:', configText.substring(0, 500));
    }

  } catch(e) { console.log('Error:', e.message); }

  await browser.close();
})();
