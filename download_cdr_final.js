const { chromium } = require('playwright');
const fs = require('fs');
const { db } = require('./database');

async function downloadAndImport() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  var csvText = null;

  // Capture download
  page.on('response', async function(response) {
    var url = response.url();
    var ct = response.headers()['content-type'] || '';
    if ((ct.includes('csv') || ct.includes('octet') || url.includes('.csv') || url.includes('s3') || url.includes('amazon')) && response.status() === 200) {
      try {
        csvText = await response.text();
        console.log('CSV capturado desde:', url);
      } catch(e) {}
    }
  });

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Encontrar la fila del archivo cdrs_monthly.csv y hacer clic en el botón de descarga/expansión
  var clickResult = await page.evaluate(() => {
    try {
      var all = document.querySelectorAll('*');
      var targetRow = null;
      
      // Buscar la fila que contiene cdrs_monthly.csv
      for (var el of all) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          targetRow = el.closest('.file-row') || el.parentElement;
          while (targetRow && !targetRow.classList.contains('file-row')) {
            targetRow = targetRow.parentElement;
          }
          break;
        }
      }

      if (!targetRow) return 'Fila no encontrada';

      // Dentro de la fila, buscar el botón con icono de flecha (ri-arrow-right-s-line)
      var buttons = targetRow.querySelectorAll('button, i, [role=\"button\"]');
      for (var btn of buttons) {
        var html = btn.outerHTML;
        if (html.includes('ri-arrow-right-s-line') || html.includes('ri-download') || html.includes('ri-file-download')) {
          btn.click();
          return 'Clic en botón de descarga: ' + (btn.className || '').substring(0, 50);
        }
      }
      
      // Si no hay botón de descarga, probar a hacer clic en el icono de la fila
      var icons = targetRow.querySelectorAll('i');
      for (var ic of icons) {
        if (ic.offsetParent !== null) {
          ic.click();
          return 'Clic en icono: ' + (ic.className || '').substring(0, 50);
        }
      }

      return 'No se encontró botón de descarga. HTML de la fila: ' + targetRow.outerHTML.substring(0, 500);
    } catch(e) { return 'Error: ' + e.message; }
  });

  console.log('Resultado:', clickResult);
  await page.waitForTimeout(5000);

  if (csvText && csvText.length > 100 && !csvText.includes('<!DOCTYPE')) {
    console.log('\n✅ CSV descargado correctamente!');
    console.log('Primeras líneas:', csvText.substring(0, 500));
    
    // Importar a la base de datos
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
        var tipo = (cols[3] || 'exceso').trim();
        var importe = parseFloat(cols[4] || 0);
        var unidades = parseFloat(cols[5] || 0);
        var periodo = (cols[6] || '').trim();
        if (!fiscalId && !linea) continue;
        insert.run(fiscalId, linea, concepto, tipo, importe, unidades, periodo || new Date().toISOString().substring(0, 7));
        importados++;
      } catch(e) { console.log('Error importando línea:', e.message); }
    }
    console.log('Importados:', importados, 'CDRs');
  } else {
    console.log('\nNo se capturó el CSV.');
    // Ver si apareció un panel de detalles con un botón de descarga
    var panelContent = await page.evaluate(() => {
      var items = [];
      document.querySelectorAll('[class*=\"panel\"], [class*=\"drawer\"], [class*=\"sidebar\"], [class*=\"detail\"]').forEach(function(el) {
        if (el.offsetParent !== null) items.push(el.className.substring(0, 80));
      });
      return items;
    });
    console.log('Paneles visibles:', panelContent);
    
    var pageText = await page.evaluate(() => document.body.innerText);
    if (pageText.includes('Descargar') || pageText.includes('Download') || pageText.includes('Abrir')) {
      console.log('Hay opciones de descarga en la página');
      // Intentar hacer clic en Descargar
      await page.evaluate(() => {
        var all = document.querySelectorAll('*');
        for (var el of all) {
          var t = el.textContent.toLowerCase().trim();
          if (t === 'descargar' || t === 'download' || t === 'abrir') {
            el.click();
            return;
          }
        }
      });
      await page.waitForTimeout(3000);
    }
  }

  await browser.close();
}

downloadAndImport().catch(console.error);
