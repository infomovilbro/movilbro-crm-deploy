const { db } = require('../../database');

// Intenta descargar CDRs usando el navegador Edge (si está abierto con --remote-debugging-port=9222)
async function downloadLatestCDRs() {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const ctx = browser.contexts()[0];
    const page = await ctx.newPage();

    var csvContent = null;
    var csvUrl = null;

    // Capture CSV responses
    page.on('response', async function(resp) {
      var url = resp.url();
      var ct = (resp.headers()['content-type'] || '').toLowerCase();
      if (url.includes('.csv') && resp.status() === 200) {
        try {
          csvContent = await resp.text();
          csvUrl = url;
        } catch(e) {}
      }
    });

    await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Check if logged in
    var loggedIn = await page.evaluate(() => document.body.innerText.includes('Dashboard'));
    if (!loggedIn) {
      await browser.close();
      return { ok: false, error: 'No hay sesión en Likes Telecom. Abre https://wd.likestelecom.com/resources e inicia sesión.' };
    }

    // Try to download cdrs_monthly.csv by clicking the action button
    await page.evaluate(() => {
      try {
        var rows = document.querySelectorAll('.file-row');
        for (var row of rows) {
          if (row.textContent.includes('cdrs_monthly.csv')) {
            var btns = row.querySelectorAll('button');
            for (var btn of btns) {
              var html = btn.innerHTML;
              if (html.includes('ri-arrow') || html.includes('ri-download') || html.includes('ri-file')) {
                btn.click();
                return;
              }
            }
            if (btns.length > 0) btns[btns.length - 1].click();
            return;
          }
        }
      } catch(e) {}
    });

    await page.waitForTimeout(5000);

    // If no CSV captured, look for a download button in any opened panel
    if (!csvContent) {
      await page.evaluate(() => {
        try {
          var all = document.querySelectorAll('button, a');
          for (var el of all) {
            var t = (el.textContent || '').toLowerCase().trim();
            if (t === 'descargar' || t === 'download') { el.click(); return; }
          }
        } catch(e) {}
      });
      await page.waitForTimeout(3000);
    }

    await browser.close();

    if (csvContent && !csvContent.includes('<!DOCTYPE')) {
      return { ok: true, data: csvContent };
    }
    return { ok: false, error: 'No se pudo descargar el CSV. Descárgalo manualmente desde wd.likestelecom.com/resources y súbelo en /isp/cdrs' };
  } catch(e) {
    return { ok: false, error: 'Edge no está abierto con depuración. Para descarga automática abre Edge con: msedge --remote-debugging-port=9222' };
  }
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
      insert.run(fiscalId, linea, concepto, (cols[3] || 'exceso').trim(), parseFloat(cols[4] || 0), parseFloat(cols[5] || 0), (cols[6] || periodo || '').trim());
      importados++;
    } catch(e) {}
  }
  return importados;
}

module.exports = { downloadLatestCDRs, importCDRs };
