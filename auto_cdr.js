const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { db } = require('./database');

async function downloadMonthlyCDRs() {
  console.log('Connecting to Edge...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Click on the monthly CSV to select it
  await page.evaluate(() => {
    var all = document.querySelectorAll('*');
    for (var el of all) {
      if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
        el.click();
        return;
      }
    }
  });
  await page.waitForTimeout(1000);

  // Try to find a download button or right-click option
  var csvContent = await page.evaluate(async () => {
    try {
      // Try to fetch the file through the API
      var r = await fetch('/api/v1/cdrs/download?file=cdrs_monthly.csv');
      if (r.ok) return await r.text();
      
      // Try alternative paths
      var altPaths = ['/api/download/cdrs_monthly.csv', '/api/v1/download/cdrs_monthly.csv', '/api/v1/files/cdrs_monthly.csv', '/api/v1/storage/cdrs_monthly.csv'];
      for (var p of altPaths) {
        try {
          var r2 = await fetch(p);
          if (r2.ok) {
            var t = await r2.text();
            if (!t.includes('<!DOCTYPE')) return t;
          }
        } catch(e) {}
      }
      return null;
    } catch(e) { return null; }
  });

  if (csvContent) {
    console.log('CSV downloaded, length:', csvContent.length);
    console.log('First 500 chars:', csvContent.substring(0, 500));
    
    // Parse and import to DB
    var lines = csvContent.split('\n').filter(Boolean);
    var importados = 0;
    var insert = db.prepare('INSERT OR IGNORE INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)');
    
    for (var i = 1; i < lines.length; i++) {
      try {
        var cols = lines[i].split(',');
        if (cols.length < 3) continue;
        var fiscalId = (cols[0] || '').trim();
        var linea = (cols[1] || '').trim();
        var concepto = (cols[2] || '').trim();
        var tipo = (cols[3] || 'exceso').trim();
        var importe = parseFloat(cols[4] || 0);
        var unidades = parseFloat(cols[5] || 0);
        var periodo = (cols[6] || '').trim() || new Date().toISOString().substring(0, 7);
        if (!fiscalId && !linea) continue;
        insert.run(fiscalId, linea, concepto, tipo, importe, unidades, periodo);
        importados++;
      } catch(e) {}
    }
    console.log('Imported:', importados, 'CDRs');
  } else {
    console.log('Could not download CSV. Check if the file is accessible.');
    // Try double-click to open/download
    await page.evaluate(() => {
      var all = document.querySelectorAll('*');
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return;
        }
      }
    });
    await page.waitForTimeout(3000);
    var url = page.url();
    console.log('URL after double-click:', url);
  }

  await browser.close();
}

// Run if called directly
if (require.main === module) {
  downloadMonthlyCDRs().catch(console.error);
}

module.exports = { downloadMonthlyCDRs };
