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
  if (page.url().includes('login')) { console.log('Login FAILED'); await browser.close(); return; }
  console.log('✅ ISP Login OK');

  // Check the Exportar vista button in contratos
  await page.goto('https://movilbro.ispgestion.com/contratosmadre', { waitUntil: 'networkidle', timeout: 15000 });

  var exportInfo = await page.evaluate(() => {
    try {
      // Find Exportar vista button and get its onclick/event handlers
      var all = document.querySelectorAll('a, button, input');
      for (var el of all) {
        var text = el.textContent?.trim() || el.value || '';
        if (text.includes('Exportar')) {
          var html = el.outerHTML;
          var onclick = el.getAttribute('onclick') || '';
          var href = el.getAttribute('href') || '';
          var id = el.id || '';
          return { text: text, html: html.substring(0, 500), onclick: onclick, href: href, id: id, tag: el.tagName };
        }
      }
      return { error: 'Export button not found' };
    } catch(e) { return { error: e.message }; }
  });
  console.log('\n=== EXPORT BUTTON ===');
  console.log(JSON.stringify(exportInfo, null, 2));

  // Check the full contratos page for any CSV/download links
  var downloadLinks = await page.evaluate(() => {
    var items = [];
    document.querySelectorAll('a[href], a[onclick]').forEach(function(el) {
      var href = el.getAttribute('href') || '';
      var onclick = el.getAttribute('onclick') || '';
      var text = el.textContent.trim();
      if (href.toLowerCase().includes('csv') || href.toLowerCase().includes('export') || onclick.toLowerCase().includes('csv') || onclick.toLowerCase().includes('export') || text.toLowerCase().includes('csv') || text.toLowerCase().includes('export')) {
        items.push({ text: text, href: href, onclick: onclick.substring(0, 100) });
      }
    });
    return items;
  });
  console.log('\n=== ALL DOWNLOAD LINKS ===');
  downloadLinks.forEach(function(l) { console.log('  ' + l.text.padEnd(30) + l.href); });

  // Check the page source for any CSV references
  var pageSource = await page.content();
  var csvMatches = pageSource.match(/[^\s\"\']+\.csv[^\s\"\']*/gi);
  if (csvMatches) {
    console.log('\n=== CSV REFERENCES IN PAGE ===');
    csvMatches.slice(0, 10).forEach(function(m) { console.log('  ' + m); });
  }

  // Try to trigger the Exportar vista click and capture the download
  if (exportInfo && exportInfo.id) {
    console.log('\nTrying to click export button...');
    await page.click('#' + exportInfo.id);
    await page.waitForTimeout(3000);
    var url = page.url();
    console.log('URL after click:', url);
    
    // Check if a new tab/window was opened or a download started
    var pages = browser.contexts()[0].pages();
    console.log('Open pages:', pages.length);
    for (var p of pages) {
      console.log('  ' + p.url());
    }
  }

  await browser.close();
})();
