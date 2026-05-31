const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

var NUBE_DIR = path.join(__dirname, '..', 'nube');
var ZIPS_DIR = path.join(NUBE_DIR, '_zips');

var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var MESES_MAP = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };

function getYearMonthPaths(periodo) {
  if (!periodo) periodo = new Date().toISOString().substring(0, 7);
  var parts = periodo.split('-');
  var year = parts[0];
  var monthNum = parseInt(parts[1]);
  var monthName = MESES[monthNum - 1] || parts[1];
  var dir = path.join(NUBE_DIR, year, monthName);
  return { year, month: monthName, monthNum, dir };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function generarPDF(htmlContent, filename) {
  try {
    var { chromium } = require('playwright');
    var execPath;
    try { execPath = chromium.executablePath(); } catch(e) {}
    if (!execPath || !fs.existsSync(execPath)) {
      var fallbacks = [
        '/opt/render/.cache/ms-playwright/chromium-1223/chrome-linux/chrome',
        '/opt/render/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell'
      ];
      for (var f of fallbacks) { if (fs.existsSync(f)) { execPath = f; break; } }
    }
    if (execPath && fs.existsSync(execPath)) {
      var browser = await chromium.launch({ headless: true, executablePath: execPath, args: ['--no-sandbox','--disable-setuid-sandbox'] });
      try {
        var page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle' });
        return await page.pdf({ format: 'A4', margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }, printBackground: true });
      } finally { await browser.close(); }
    }
  } catch(e) { console.error('Playwright error:', e.message); }
  return null; // fallback: route will redirect to HTML view
}

async function guardarLocal(pdfBuf, periodo, nombreArchivo) {
  var paths = getYearMonthPaths(periodo);
  ensureDir(paths.dir);
  var filePath = path.join(paths.dir, nombreArchivo);
  fs.writeFileSync(filePath, pdfBuf);
  return { filePath, paths, nombreArchivo };
}

function listarPDFs() {
  var result = [];
  if (!fs.existsSync(NUBE_DIR)) return result;
  var years = fs.readdirSync(NUBE_DIR).filter(function(y) { return /^\d{4}$/.test(y); }).sort().reverse();
  years.forEach(function(year) {
    var yearDir = path.join(NUBE_DIR, year);
    var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
    months.forEach(function(month) {
      var monthDir = path.join(yearDir, month);
      var files = fs.readdirSync(monthDir).filter(function(f) { return f.endsWith('.pdf'); }).sort().reverse();
      files.forEach(function(file) {
        result.push({
          year, month,
          fileName: file,
          fullPath: path.join(monthDir, file),
          size: fs.statSync(path.join(monthDir, file)).size,
          modified: fs.statSync(path.join(monthDir, file)).mtime
        });
      });
    });
  });
  return result;
}

async function procesarFactura(factura, lineas, cdrsDetalle, llamadas, history) {
  var ejs = require('ejs');
  var tpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'isp', 'facturacion', 'invoice-html.ejs'), 'utf8');
  var html = ejs.render(tpl, { factura, lineas, cdrsDetalle, llamadas: llamadas || [], history: history || [], layout: false });
  var pdfBuf = await generarPDF(html, 'factura.pdf');
  if (!pdfBuf) return null; // fallback to HTML view
  var numFactura = (factura.serie || 'F') + '-' + String(factura.numero_factura || factura.id).padStart(5, '0');
  var nombreArchivo = 'Factura-' + numFactura + '.pdf';
  var local = await guardarLocal(pdfBuf, factura.periodo, nombreArchivo);
  return { local, nombreArchivo, pdfBuf };
}

// ---- ZIP STORAGE ----

function storeZipInNube(zipPath, year, month) {
  var monthDir = path.join(ZIPS_DIR, year, month);
  ensureDir(monthDir);
  var destName = path.basename(zipPath);
  var destPath = path.join(monthDir, destName);
  fs.copyFileSync(zipPath, destPath);
  return destPath;
}

function listZips() {
  var result = [];
  if (!fs.existsSync(ZIPS_DIR)) return result;
  var years = fs.readdirSync(ZIPS_DIR).filter(function(y) { return /^\d{4}$/.test(y); }).sort().reverse();
  years.forEach(function(year) {
    var yearDir = path.join(ZIPS_DIR, year);
    var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
    months.forEach(function(month) {
      var monthDir = path.join(yearDir, month);
      var files = fs.readdirSync(monthDir).filter(function(f) { return f.endsWith('.zip'); });
      files.forEach(function(file) {
        result.push({
          year, month,
          fileName: file,
          fullPath: path.join(monthDir, file),
          size: fs.statSync(path.join(monthDir, file)).size
        });
      });
    });
  });
  return result;
}

function findPDFInZips(pdfName) {
  if (!fs.existsSync(ZIPS_DIR)) return null;
  var years = fs.readdirSync(ZIPS_DIR).filter(function(y) { return /^\d{4}$/.test(y); });
  for (var year of years) {
    var yearDir = path.join(ZIPS_DIR, year);
    var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
    for (var month of months) {
      var monthDir = path.join(yearDir, month);
      var zips = fs.readdirSync(monthDir).filter(function(f) { return f.endsWith('.zip'); });
      for (var z of zips) {
        try {
          var zip = new AdmZip(path.join(monthDir, z));
          var entry = zip.getEntry(pdfName);
          if (entry) {
            return { zipPath: path.join(monthDir, z), entry: entry, data: zip.readFile(entry) };
          }
        } catch(e) {}
      }
    }
  }
  return null;
}

function getPDFDataFromZip(zipPath, pdfName) {
  try {
    var zip = new AdmZip(zipPath);
    var entry = zip.getEntry(pdfName);
    if (entry) return zip.readFile(entry);
  } catch(e) {}
  return null;
}

function getAllPDFNamesFromZips() {
  var names = {};
  if (!fs.existsSync(ZIPS_DIR)) return names;
  var years = fs.readdirSync(ZIPS_DIR).filter(function(y) { return /^\d{4}$/.test(y); });
  for (var year of years) {
    var yearDir = path.join(ZIPS_DIR, year);
    var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
    for (var month of months) {
      var monthDir = path.join(yearDir, month);
      var zips = fs.readdirSync(monthDir).filter(function(f) { return f.endsWith('.zip'); });
      for (var z of zips) {
        try {
          var zip = new AdmZip(path.join(monthDir, z));
          var entries = zip.getEntries();
          for (var e of entries) {
            if (e.entryName.endsWith('.pdf')) {
              names[e.entryName] = { zipFile: z, year: year, month: month, zipPath: path.join(monthDir, z), entryName: e.entryName };
            }
          }
        } catch(e) {}
      }
    }
  }
  return names;
}

function importZipsFromDownloads() {
  var downloadsDir = path.join(process.env.USERPROFILE || 'C:\\Users\\xtptx', 'Downloads', 'facturashastaabril2026');
  if (!fs.existsSync(downloadsDir)) return { ok: false, error: 'Directorio no encontrado: ' + downloadsDir };

  var files = fs.readdirSync(downloadsDir).filter(function(f) { return f.endsWith('.zip') && f.startsWith('facturas'); });
  var imported = [];

  files.forEach(function(file) {
    var match = file.match(/facturas\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i);
    if (!match) return;
    var monthName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    var mName = MESES[MESES_MAP[monthName] - 1];
    if (!mName) return;
    var year = match[2];
    var dest = storeZipInNube(path.join(downloadsDir, file), year, mName);
    imported.push({ file: file, year: year, month: mName, dest: dest });
  });

  return { ok: true, imported: imported };
}

function guardarArchivo(tempPath, originalName, destFolder) {
  var destDir = path.join(NUBE_DIR, destFolder || 'general');
  ensureDir(destDir);
  var destPath = path.join(destDir, originalName);
  var counter = 1;
  var nameWithoutExt = path.parse(originalName).name;
  var ext = path.parse(originalName).ext;
  while (fs.existsSync(destPath)) {
    destPath = path.join(destDir, nameWithoutExt + '_' + counter + ext);
    counter++;
  }
  fs.copyFileSync(tempPath, destPath);
  try { fs.unlinkSync(tempPath); } catch(e) {}
  return { destPath, destDir, fileName: path.basename(destPath) };
}

module.exports = { generarPDF, guardarLocal, listarPDFs, procesarFactura, getYearMonthPaths, NUBE_DIR, ZIPS_DIR, storeZipInNube, listZips, findPDFInZips, getPDFDataFromZip, getAllPDFNamesFromZips, importZipsFromDownloads, ensureDir, guardarArchivo };
