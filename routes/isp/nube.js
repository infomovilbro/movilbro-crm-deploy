const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const path = require('path');
const fs = require('fs');
const nube = require('../../helpers/nube');
const router = express.Router();

router.use(requireAuth);

var MES_NOMBRES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

router.get('/', (req, res) => {
  var pdfs = nube.listarPDFs();
  var stats = { total: pdfs.length, sizeTotal: 0 };
  pdfs.forEach(function(p) { stats.sizeTotal += p.size; });

  var facturas = db.prepare('SELECT id, serie, numero_factura, cliente_nombre, periodo, fecha_emision, importe_total, estado FROM isp_facturas ORDER BY fecha_emision DESC, id DESC').all();

  var pdfMap = {};
  pdfs.forEach(function(p) { pdfMap[p.fileName] = p; });

  // Group by year from both DB invoices and filesystem PDFs
  var yearsMap = {};
  
  // Add DB invoices
  facturas.forEach(function(f) {
    var year = f.fecha_emision ? f.fecha_emision.substring(0, 4) : '2026';
    var month = f.fecha_emision ? parseInt(f.fecha_emision.substring(5, 7)) : 5;
    if (!yearsMap[year]) yearsMap[year] = {};
    if (!yearsMap[year][month]) yearsMap[year][month] = { facturas: [], total: 0, count: 0 };
    var numFactura = (f.serie || 'F') + '-' + String(f.numero_factura || f.id).padStart(5, '0');
    var pdfName = 'Factura-' + numFactura + '.pdf';
    var pdfInfo = pdfMap[pdfName] || null;
    yearsMap[year][month].facturas.push({
      id: f.id,
      numFactura: numFactura,
      cliente: f.cliente_nombre,
      importe: f.importe_total,
      fecha: f.fecha_emision,
      estado: f.estado,
      pdfPath: pdfInfo ? pdfInfo.fullPath : null,
      pdfSize: pdfInfo ? pdfInfo.size : null,
      origen: 'db'
    });
    yearsMap[year][month].total += parseFloat(f.importe_total || 0);
    yearsMap[year][month].count++;
    delete pdfMap[pdfName]; // Remove matched PDFs
  });

  // Add remaining filesystem PDFs (historical ISP invoices without DB records)
  var mesMap = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };
  Object.keys(pdfMap).forEach(function(pdfName) {
    var pdfInfo = pdfMap[pdfName];
    var year = pdfInfo.year;
    var month = mesMap[pdfInfo.month] || 5;
    if (!yearsMap[year]) yearsMap[year] = {};
    if (!yearsMap[year][month]) yearsMap[year][month] = { facturas: [], total: 0, count: 0 };
    yearsMap[year][month].facturas.push({
      id: null,
      numFactura: pdfName.replace(/^Factura-/,'').replace(/\.pdf$/,''),
      cliente: pdfName.replace(/^Factura-/,'').replace(/\.pdf$/,''),
      importe: 0,
      fecha: year + '-' + String(month).padStart(2, '0') + '-01',
      estado: 'histórica',
      pdfPath: pdfInfo.fullPath,
      pdfSize: pdfInfo.size,
      origen: 'pdf'
    });
    yearsMap[year][month].count++;
  });

  // Build years array from 2024 to current year+1
  var currentYear = new Date().getFullYear();
  var years = [];
  for (var y = 2024; y <= currentYear + 1; y++) {
    var yearData = yearsMap[y] || {};
    var meses = [];
    for (var m = 1; m <= 12; m++) {
      var mesData = yearData[m] || { facturas: [], total: 0, count: 0 };
      meses.push({
        num: m,
        nombre: MES_NOMBRES[m],
        facturas: mesData.facturas,
        total: mesData.total,
        count: mesData.count
      });
    }
    years.push({ year: y, meses: meses });
  }

  res.render('isp/nube', {
    title: 'Nube - Facturas',
    years: years,
    totalFacturas: facturas.length,
    totalImporte: facturas.reduce(function(s, f) { return s + parseFloat(f.importe_total || 0); }, 0),
    totalPDFs: pdfs.length,
    mesNombres: MES_NOMBRES
  });
});

router.get('/ver/:id', (req, res) => {
  var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
  if (!factura) return res.status(404).send('No encontrada');
  var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
  var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id);
  var llamadas = [];
  try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(req.params.id); } catch(e) {}
  var history = [];
  try {
    if (factura.fiscal_id) {
      var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(factura.fiscal_id, factura.id);
      history = histRows.reverse();
    }
  } catch(e) {}
  res.render('isp/facturacion/invoice-html', {
    title: 'Factura #' + factura.id,
    factura, lineas, cdrsDetalle, llamadas, history,
    layout: false
  });
});

router.get('/pdf/:id', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).send('No encontrada');
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id);
    var llamadas = [];
    try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(req.params.id); } catch(e) {}
    var history = [];
    try {
      if (factura.fiscal_id) {
        var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(factura.fiscal_id, factura.id);
        history = histRows.reverse();
      }
    } catch(e) {}

    var numFactura = (factura.serie || 'F') + '-' + String(factura.numero_factura || factura.id).padStart(5, '0');
    var nombreArchivo = 'Factura-' + numFactura + '.pdf';
    var paths = nube.getYearMonthPaths(factura.periodo);
    var cachedPath = path.join(paths.dir, nombreArchivo);

    if (fs.existsSync(cachedPath)) return res.download(cachedPath, nombreArchivo);

    var result = await nube.procesarFactura(factura, lineas, cdrsDetalle, llamadas, history);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + nombreArchivo + '"');
    res.send(result.pdfBuf);
  } catch(e) {
    console.error(e);
    res.status(500).send('Error: ' + e.message);
  }
});

router.get('/descargar', (req, res) => {
  var filePath = req.query.path;
  if (!filePath) return res.status(400).send('Falta path');
  if (!filePath.startsWith(nube.NUBE_DIR)) return res.status(403).send('Acceso denegado');
  if (!fs.existsSync(filePath)) return res.status(404).send('No encontrado');
  res.download(filePath);
});

// ZIP download by year/month
router.get('/zip/:year/:month?', (req, res) => {
  try {
    var archiver = require('archiver');
    var archive = archiver('zip', { zlib: { level: 9 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="facturas-' + req.params.year + (req.params.month ? '-' + req.params.month : '') + '.zip"');
    archive.pipe(res);

    var pdfs = nube.listarPDFs();
    var year = req.params.year;
    var month = req.params.month;
    var MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var MESES_INV = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };

    pdfs.forEach(function(p) {
      if (year !== 'todas' && p.year !== year) return;
      if (month && MESES_INV[p.month] !== parseInt(month)) return;
      if (fs.existsSync(p.fullPath)) {
        archive.file(p.fullPath, { name: p.year + '/' + p.month + '/' + p.fileName });
      }
    });

    // Also add PDFs from DB that are not yet cached (generate on the fly? skip for now)
    archive.finalize();
  } catch(e) {
    console.error('Zip error:', e.message);
    if (!res.headersSent) res.status(500).send('Error: ' + e.message);
  }
});

router.post('/generar-todas', async (req, res) => {
  res.json({ ok: true, message: 'Generando...' });
  var facturas = db.prepare('SELECT * FROM isp_facturas ORDER BY id ASC').all();
  for (var f of facturas) {
    try {
      var numFactura = (f.serie || 'F') + '-' + String(f.numero_factura || f.id).padStart(5, '0');
      var nombreArchivo = 'Factura-' + numFactura + '.pdf';
      var paths = nube.getYearMonthPaths(f.periodo);
      if (fs.existsSync(path.join(paths.dir, nombreArchivo))) continue;
      var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(f.id);
      var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(f.id);
      var llamadas = [];
      try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(f.id); } catch(e) {}
      var history = [];
      try {
        if (f.fiscal_id) {
          var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(f.fiscal_id, f.id);
          history = histRows.reverse();
        }
      } catch(e) {}
      await nube.procesarFactura(f, lineas, cdrsDetalle, llamadas, history);
    } catch(e) { console.error('Error #' + f.id + ': ' + e.message); }
  }
  console.log('PDFs generados');
});

module.exports = router;
