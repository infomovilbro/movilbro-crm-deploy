const { chromium } = require('playwright');
const fs = require('fs');
const { db } = require('./database');

async function downloadAndImport() {
  console.log('Conectando al navegador...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();

  // Escuchar todas las respuestas para encontrar la URL de descarga real
  var downloadUrl = null;
  page.on('response', function(response) {
    var url = response.url();
    var type = response.headers()['content-type'] || '';
    if (type.includes('csv') || type.includes('octet-stream') || type.includes('binary') || url.includes('s3') || url.includes('amazonaws') || url.includes('.csv')) {
      downloadUrl = url;
    }
  });

  await page.goto('https://wd.likestelecom.com/resources', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Intentar descargar el CSV haciendo clic en el nombre del archivo
  var success = await page.evaluate(async () => {
    try {
      var files = document.querySelectorAll('*');
      var targetFile = null;
      for (var el of files) {
        if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
          targetFile = el;
          break;
        }
      }
      
      if (!targetFile) return 'No se encontró el archivo';

      // Obtener el ID del archivo desde los atributos del elemento o su padre
      var row = targetFile.closest('[class]');
      if (row) {
        var attrs = {};
        for (var a of row.attributes) attrs[a.name] = a.value;
        return JSON.stringify(attrs);
      }
      return 'No se encontró la fila';
    } catch(e) { return 'Error: ' + e.message; }
  });
  
  console.log('Análisis de la fila:', success);

  // Si no encontramos la URL, probamos a hacer clic de varias formas
  console.log('\nProbando diferentes métodos de clic...');
  
  var clicked = await page.evaluate(() => {
    var all = document.querySelectorAll('*');
    for (var el of all) {
      if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
        // Click normal
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
        return 'click';
      }
    }
    return 'not found';
  });
  console.log('Click realizado:', clicked);
  await page.waitForTimeout(3000);

  // Buscar botón de descarga que pueda haber aparecido
  var downloadBtn = await page.evaluate(() => {
    var btns = [];
    document.querySelectorAll('[class*=\"btn\"], button, [role=\"button\"], [class*=\"action\"], [class*=\"toolbar\"] a, [class*=\"header\"] a').forEach(function(el) {
      if (el.offsetParent !== null) {
        btns.push({
          text: el.textContent.trim().substring(0, 40),
          html: el.outerHTML.substring(0, 150)
        });
      }
    });
    return btns;
  });
  
  console.log('\nBotones visibles después del clic:');
  downloadBtn.forEach(function(b) { console.log('  ' + b.text.padEnd(25) + b.html); });

  // Probar a hacer doble clic
  await page.evaluate(() => {
    var all = document.querySelectorAll('*');
    for (var el of all) {
      if (el.textContent && el.textContent.trim() === 'cdrs_monthly.csv') {
        el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, button: 0 }));
        return;
      }
    }
  });
  console.log('\nDoble clic realizado');
  await page.waitForTimeout(3000);

  var newUrl = page.url();
  console.log('URL después del doble clic:', newUrl !== 'https://wd.likestelecom.com/resources' ? newUrl : 'Sin cambios');

  // Si todo falla, intentar obtener el contenido del CSV mediante la API con las cookies del navegador
  console.log('\nIntentando descarga directa con cookies del navegador...');
  var csvText = await page.evaluate(async () => {
    try {
      // Obtener el token de acceso del almacenamiento
      var accessToken = '';
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key.includes('accessToken')) {
          accessToken = localStorage.getItem(key);
          break;
        }
      }

      // Intentar diferentes endpoints de la API
      var endpoints = [
        '/api/v1/cdrs/download?file=cdrs_monthly.csv',
        '/api/v1/storage/download?file=cdrs_monthly.csv', 
        '/api/v1/files/download?file=cdrs_monthly.csv',
        '/api/v1/cdrs/monthly',
        '/api/v1/storage/cdrs_monthly.csv'
      ];

      for (var ep of endpoints) {
        try {
          var r = await fetch(ep, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
          });
          var text = await r.text();
          if (text && text.length > 100 && !text.includes('<!DOCTYPE')) {
            return { endpoint: ep, data: text.substring(0, 500) };
          }
        } catch(e) {}
      }
      return null;
    } catch(e) { return { error: e.message }; }
  });

  if (csvText) {
    console.log('CSV encontrado via:', csvText.endpoint || 'API');
    console.log('Contenido:', csvText.data || csvText);
  } else {
    console.log('No se pudo descargar el CSV automáticamente.');
    console.log('\nSOLUCIÓN: Descarga manualmente cdrs_monthly.csv desde');
    console.log('https://wd.likestelecom.com/resources');
    console.log('y súbelo a /isp/cdrs mediante el botón "Importar CSV"');
  }

  await browser.close();
}

if (require.main === module) downloadAndImport().catch(console.error);
module.exports = { downloadAndImport };
