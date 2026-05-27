const { chromium } = require('playwright');
const { db } = require('../../database');

async function downloadLatestCDRs() {
  console.log('Conectando al navegador Edge...');
  var browser;
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222');
  } catch(e) {
    return { ok: false, error: 'Edge no está abierto con depuración. Abre Edge con: msedge --remote-debugging-port=9222' };
  }

  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  var csvContent = null;

  // Capture download response
  page.on('response', async function(resp) {
    var url = resp.url();
    var ct = resp.headers()['content-type'] || '';
    if (url.includes('.csv') && (ct.includes('csv') || ct.includes('text') || ct.includes('octet')) && resp.status() === 200) {
      try {
        csvContent = await resp.text();
      } catch(e) {}
    }
  });

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Try to find and click the download button for cdrs_monthly.csv
  await page.evaluate(() => {
    try {
      var items = document.querySelectorAll('.file-row');
      for (var row of items) {
        var text = row.textContent || '';
        if (text.includes('cdrs_monthly.csv')) {
          // Click the arrow/action button on the right
          var btns = row.querySelectorAll('button');
          for (var btn of btns) {
            var html = btn.innerHTML;
            if (html.includes('ri-arrow') || html.includes('ri-download') || html.includes('ri-file')) {
              btn.click();
              return 'clicked action button';
            }
          }
          // Click the last button (usually the action)
          if (btns.length > 0) { btns[btns.length - 1].click(); return 'clicked last button'; }
        }
      }
      return 'no file row found';
    } catch(e) { return 'error: ' + e.message; }
  });

  await page.waitForTimeout(3000);

  // If the file opened in a detail panel, look for download
  if (!csvContent) {
    await page.evaluate(() => {
      try {
        var btns = document.querySelectorAll('button, a');
        for (var b of btns) {
          var t = (b.textContent || '').toLowerCase().trim();
          if (t === 'descargar' || t === 'download' || t === 'abrir') { b.click(); return 'clicked: ' + t; }
        }
        return 'no download button';
      } catch(e) { return 'error'; }
    });
    await page.waitForTimeout(2000);
  }

  await browser.close();

  if (!csvContent || csvContent.includes('<!DOCTYPE')) {
    return { ok: false, error: 'No se pudo descargar el CSV automáticamente' };
  }

  return { ok: true, data: csvContent };
}

function importCDRs(csvText, periodo) {
  var lines = csvText.split('\n').filter(Boolean);
  var importados = 0;
  var insert = db.prepare('INSERT OR IGNORE INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)');

  for (var i = 1; i < lines.length; i++) {
    try {
      var cols = lines[i].split(',');
      if (cols.length < 3) continue;
      var fiscalId = (cols[0] || '').trim();
      var linea = (cols[1] || '').trim();
      var concepto = (cols[2] || '').trim();
      if (!fiscalId && !linea) continue;
      insert.run(
        fiscalId, linea, concepto,
        (cols[3] || 'exceso').trim(),
        parseFloat(cols[4] || 0),
        parseFloat(cols[5] || 0),
        (cols[6] || periodo || '').trim()
      );
      importados++;
    } catch(e) {}
  }
  return importados;
}

module.exports = { downloadLatestCDRs, importCDRs };
