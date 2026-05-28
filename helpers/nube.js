const fs = require('fs');
const path = require('path');

var NUBE_DIR = path.join(__dirname, '..', 'nube');

var MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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
  var { chromium } = require('playwright');
  var browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    var page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle' });
    var pdfBuf = await page.pdf({ format: 'A4', margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }, printBackground: true });
    return pdfBuf;
  } finally {
    if (browser) await browser.close();
  }
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
  var numFactura = (factura.serie || 'F') + '-' + String(factura.numero_factura || factura.id).padStart(5, '0');
  var nombreArchivo = 'Factura-' + numFactura + '.pdf';
  var local = await guardarLocal(pdfBuf, factura.periodo, nombreArchivo);
  return { local, nombreArchivo, pdfBuf };
}

module.exports = { generarPDF, guardarLocal, listarPDFs, procesarFactura, getYearMonthPaths, NUBE_DIR };
