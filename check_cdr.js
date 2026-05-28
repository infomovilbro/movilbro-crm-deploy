const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Login
  await page.goto('https://movilbro.ispgestion.com/site/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => {
    var el = document.getElementById('coordenadas_control_presencia');
    if (el) el.value = '37.019,-4.561';
  });
  await page.fill('#LoginForm_usuario', '25345979W');
  await page.fill('#LoginForm_contrase\u00f1a', '030220251259aB@');
  await page.click('#acceder');
  await page.waitForTimeout(4000);

  var url = page.url();
  console.log('Login:', url.includes('login') ? 'FAILED' : 'OK');

  if (!url.includes('login')) {
    // Look for consumption/CDR/billing sections in the menu
    console.log('\n=== NAVIGATING ISP GESTION ===');
    
    var sections = [
      { name: 'Contratos', url: '/contratosmadre' },
      { name: 'Listados', url: '/listados' },
      { name: 'Configuracion', url: '/configuracion' },
      { name: 'Flujos', url: '/flujos' },
      { name: 'Tickets', url: '/llamadas' },
    ];

    for (var s of sections) {
      try {
        await page.goto('https://movilbro.ispgestion.com' + s.url, { waitUntil: 'networkidle', timeout: 15000 });
        var text = await page.evaluate(() => document.body?.innerText || '');
        var title = await page.title();
        console.log('\n[' + s.name + '] ' + title);
        
        // Look for CDR/consumption related words
        var cdrWords = ['consumo', 'cdr', 'gb', 'excedente', 'llamada', 'detalle', 'factura', 'importe', 'linea', 'tráfico', 'uso', 'kbps', 'mb', 'minutos', 'sms'];
        for (var w of cdrWords) {
          if (text.toLowerCase().includes(w)) {
            var match = text.match(new RegExp('[^\\n]*' + w + '[^\\n]*', 'i'));
            if (match) console.log('  → ' + w + ': ' + match[0].trim().substring(0, 120));
          }
        }

        // Get all links on page
        var links = await page.evaluate(() => {
          var items = [];
          document.querySelectorAll('a[href]').forEach(function(a) {
            var h = a.getAttribute('href');
            var t = a.textContent.trim();
            if (h && t && h.startsWith('/') && t.length < 60) items.push({ href: h, text: t });
          });
          var seen = new Set();
          return items.filter(function(i) { var k = i.href + i.text; if (seen.has(k)) return false; seen.add(k); return true; });
        });
        
        // Look for links related to consumption
        var cdrLinks = links.filter(function(l) {
          var keywords = ['consumo', 'cdr', 'gb', 'detalle', 'linea', 'trafico', 'factura', 'importe', 'minutos'];
          return keywords.some(function(k) { return l.text.toLowerCase().includes(k) || l.href.toLowerCase().includes(k); });
        });
        if (cdrLinks.length > 0) {
          console.log('  CDR-related links:');
          cdrLinks.forEach(function(l) { console.log('    ' + l.href.padEnd(40) + l.text); });
        }
      } catch(e) { console.log('[' + s.name + '] Error: ' + e.message.substring(0, 60)); }
    }

    // Try specific CDR-related URLs
    console.log('\n=== PROBING CDR URLs ===');
    var cdrUrls = [
      '/linea/consumo', '/lineas/consumo', '/linea/detalle', '/consumos',
      '/report/consumo', '/reporte/consumo', '/informes/consumo',
      '/linea/trafico', '/cdr', '/cdrs',
      '/clientes/consumo', '/cliente/consumo',
      '/contratosmadre/consumo', '/contratosmadre/trafico',
      '/facturacion/detalle', '/facturas/detalle',
      '/altas/linea', '/linea',
      '/lista/lineas', '/listado/lineas',
      '/informes', '/informes/consumo'
    ];
    for (var cu of cdrUrls) {
      try {
        await page.goto('https://movilbro.ispgestion.com' + cu, { waitUntil: 'domcontentloaded', timeout: 10000 });
        var ft = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
        if (!ft.includes('418') && !ft.includes('No tienes permiso') && !ft.includes('Error')) {
          console.log('✅ ' + cu + ' - ACCESSIBLE');
          console.log('   ' + ft.replace(/\n/g, '\n   ').substring(0, 200));
        } else {
          console.log('❌ ' + cu + ' - No access');
        }
      } catch(e) { console.log('❌ ' + cu + ' - Error'); }
    }
  }

  await browser.close();
})();
