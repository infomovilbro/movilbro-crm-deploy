const { chromium } = require('playwright');
(async () => {
  var b; try { b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 }); } catch(e) { console.log('No CDP'); return; }
  var p = b.contexts()[0].pages().find(pg => pg.url().includes('6f335cd7'));
  if (!p) return;
  await p.bringToFront();
  if (p.url().includes('login')) {
    await p.fill('input[type="text"]', 'aaa1'); await p.fill('input[type="password"]', 'aaa123'); await p.click('button[type="submit"]');
    await new Promise(r => setTimeout(r, 2000));
  }

  // Test API directly via page
  var result = await p.evaluate(async () => {
    try {
      var r = await fetch('/clientes?limit=1');
      var txt = await r.text();
      if (txt.includes('API Likes')) return 'API Likes found';
      if (txt.includes('LOCAL')) return 'Only local customers';
      return 'Unknown: ' + txt.substring(0, 200);
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('Clientes test:', result);

  // Check if the API error appears
  var log = await p.evaluate(async () => {
    try {
      var r = await fetch('/isp/facturacion');
      var txt = await r.text();
      return txt.includes('Error') ? txt.substring(0, 300) : 'Page loads OK';
    } catch(e) { return 'Error: ' + e.message; }
  });
  console.log('Facturacion test:', log);

  await b.close();
})();
