const { chromium } = require('playwright');
const https = require('https');

async function run() {
  // 1. Login to Render and create demo invoice
  var jar = '';
  function req(m, p, d) {
    return new Promise(function(ok, fail) {
      var u = new URL('https://movilbro-crm.onrender.com' + p);
      var opts = { hostname: u.hostname, port: 443, path: u.pathname + u.search, method: m, headers: { Cookie: jar } };
      if (d) opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      var r = https.request(opts, function(res) {
        var b = '';
        res.on('data', function(c) { b += c; });
        res.on('end', function() {
          var sc = res.headers['set-cookie'];
          if (sc) sc.forEach(function(c) { var v = c.split(';')[0]; if (jar.indexOf(v) < 0) jar += (jar ? '; ' : '') + v; });
          ok({ s: res.statusCode, b: b, loc: res.headers.location });
        });
      });
      r.on('error', fail);
      if (d) r.write(d);
      r.end();
    });
  }

  // Login
  await req('GET', '/auth/login');
  var l = await req('POST', '/auth/login', 'email=infomovilbro@gmail.com&password=movilbro2026');
  if (!l.loc) l = await req('POST', '/auth/login', 'email=eloyfuentesbermudez@gmail.com&password=eloy2026');
  if (l.loc) await req('GET', l.loc);
  else { console.log('Login FAIL'); return; }

  // Create demo invoice directly in DB (bypass generar to avoid Stripe)
  // First create demo CDRs
  var hoy = new Date().toISOString().split('T')[0];
  var cdrs = [
    { c: 'GB extra consumidos (0.7 GB)', i: 3.50 },
    { c: 'Llamadas internacionales (12 min)', i: 2.40 },
    { c: 'SMS premium (5 SMS)', i: 1.25 }
  ];
  var cdrTotal = 7.15;
  var baseTotal = 25.90;

  // Insert invoice locally via the facturacion/generar endpoint but without Stripe
  // Actually, let's just check if there's already an invoice for this fiscalId
  var d = await req('GET', '/isp/facturacion/facturas');
  console.log('Facturas page loaded:', d.s);

  // 2. Take screenshot with Playwright
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Set cookie from the login
  var cookies = jar.split('; ').map(function(c) {
    var p = c.split('=');
    return { name: p[0], value: p.slice(1).join('='), domain: 'movilbro-crm.onrender.com', path: '/' };
  });
  await context.addCookies(cookies);
  
  // Navigate to the facturas page
  await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  await page.screenshot({ path: 'facturas_list.png', fullPage: true });
  console.log('Screenshot saved: facturas_list.png');

  // Find the latest invoice link and take a detail screenshot
  var link = await page.evaluate(() => {
    var links = document.querySelectorAll('a[href*=\"facturas/\"]');
    var last = null;
    for (var a of links) {
      var h = a.getAttribute('href');
      if (h && h.match(/facturas\/\d+$/)) last = h;
    }
    return last;
  });
  
  if (link) {
    await page.goto('https://movilbro-crm.onrender.com' + link, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'factura_detalle.png', fullPage: true });
    console.log('Screenshot saved: factura_detalle.png');
    console.log('Invoice URL: https://movilbro-crm.onrender.com' + link);
  }

  await browser.close();
}

run().catch(console.error);
