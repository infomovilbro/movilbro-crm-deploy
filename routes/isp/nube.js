const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const path = require('path');
const fs = require('fs');
const nube = require('../../helpers/nube');
const router = express.Router();

var MES_NOMBRES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Upload ZIP - no auth required for upload (files go to nube, harmless)
var multer = require('multer');
var upload = multer({ dest: path.join(__dirname, '..', '..', 'uploads') });
var AdmZip = require('adm-zip');
router.post('/subir-zip', upload.single('zip'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'No se seleccionó ningún archivo' });
    var zipPath = req.file.path;
    var zip = new AdmZip(zipPath);
    var entries = zip.getEntries();
    var imported = 0;
    entries.forEach(function(entry) {
      if (entry.entryName.endsWith('.pdf')) {
        var match = entry.entryName.match(/(\d{4})/);
        var year = match ? match[1] : new Date().getFullYear().toString();
        var monthName = MES_NOMBRES[new Date().getMonth() + 1];
        for (var m = 1; m <= 12; m++) {
          if (entry.entryName.toLowerCase().indexOf(MES_NOMBRES[m].toLowerCase()) > -1) {
            monthName = MES_NOMBRES[m];
            break;
          }
        }
        var dir = path.join(nube.NUBE_DIR, year, monthName);
        nube.ensureDir(dir);
        var destPath = path.join(dir, path.basename(entry.entryName));
        if (!fs.existsSync(destPath)) {
          fs.writeFileSync(destPath, zip.readFile(entry));
          imported++;
        }
      }
    });
    try { fs.unlinkSync(zipPath); } catch(e) {}
    res.json({ ok: true, imported: imported, message: imported + ' PDFs importados' });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

router.use(requireAuth);

router.get('/', (req, res) => {
  var pdfs = nube.listarPDFs();
  var zipPdfs = nube.getAllPDFNamesFromZips();
  var stats = { total: pdfs.length + Object.keys(zipPdfs).length, sizeTotal: 0 };
  pdfs.forEach(function(p) { stats.sizeTotal += p.size; });

  var facturas = db.prepare('SELECT id, serie, numero_factura, cliente_nombre, periodo, fecha_emision, importe_total, estado FROM isp_facturas ORDER BY fecha_emision DESC, id DESC').all();

  var pdfMap = {};
  pdfs.forEach(function(p) { pdfMap[p.fileName] = p; });

  var yearsMap = {};

  facturas.forEach(function(f) {
    var year = f.fecha_emision ? f.fecha_emision.substring(0, 4) : '2026';
    var month = f.fecha_emision ? parseInt(f.fecha_emision.substring(5, 7)) : 5;
    if (!yearsMap[year]) yearsMap[year] = {};
    if (!yearsMap[year][month]) yearsMap[year][month] = { facturas: [], total: 0, count: 0 };
    var numFactura = (f.serie || 'F') + '-' + String(f.numero_factura || f.id).padStart(5, '0');
    var pdfName = 'Factura-' + numFactura + '.pdf';
    var pdfInfo = pdfMap[pdfName] || null;
    var inZip = zipPdfs[pdfName] || null;
    yearsMap[year][month].facturas.push({
      id: f.id,
      numFactura: numFactura,
      cliente: f.cliente_nombre,
      importe: f.importe_total,
      fecha: f.fecha_emision,
      estado: f.estado,
      pdfPath: pdfInfo ? pdfInfo.fullPath : null,
      pdfSize: pdfInfo ? pdfInfo.size : null,
      origen: 'db',
      inZip: inZip ? inZip.zipPath : null
    });
    yearsMap[year][month].total += parseFloat(f.importe_total || 0);
    yearsMap[year][month].count++;
    delete pdfMap[pdfName];
    if (inZip) delete zipPdfs[pdfName];
  });

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

  // Add PDFs that are only in ZIPS (not yet extracted)
  Object.keys(zipPdfs).forEach(function(pdfName) {
    var zipInfo = zipPdfs[pdfName];
    var year = zipInfo.year;
    var month = mesMap[zipInfo.month];
    if (!month) return;
    if (!yearsMap[year]) yearsMap[year] = {};
    if (!yearsMap[year][month]) yearsMap[year][month] = { facturas: [], total: 0, count: 0 };
    yearsMap[year][month].facturas.push({
      id: null,
      numFactura: pdfName.replace(/^Factura-/,'').replace(/\.pdf$/,''),
      cliente: pdfName.replace(/^Factura-/,'').replace(/\.pdf$/,''),
      importe: 0,
      fecha: year + '-' + String(month).padStart(2, '0') + '-01',
      estado: 'archivada',
      pdfPath: null,
      pdfSize: null,
      origen: 'zip',
      inZip: zipInfo.zipPath
    });
    yearsMap[year][month].count++;
  });

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

  // Also list ZIPS for display
  var zipFiles = nube.listZips();

  // List special folders (facturas_manuales, facturasgestoria2026, etc)
  var specialFolders = [];
  var nubeRoot = nube.NUBE_DIR;
  if (fs.existsSync(nubeRoot)) {
    fs.readdirSync(nubeRoot).forEach(function(e) {
      var fp = path.join(nubeRoot, e);
      if (fs.statSync(fp).isDirectory() && !e.startsWith('_') && !/^\d{4}$/.test(e) && e !== 'plantillas') {
        var files = fs.readdirSync(fp).filter(function(f) { return f.endsWith('.zip') || f.endsWith('.pdf'); });
        specialFolders.push({ name: e, path: fp, files: files });
      }
    });
  }

  res.render('isp/nube', {
    title: 'Nube - Facturas',
    years: years,
    totalFacturas: facturas.length,
    totalImporte: facturas.reduce(function(s, f) { return s + parseFloat(f.importe_total || 0); }, 0),
    totalPDFs: pdfs.length + Object.keys(zipPdfs).length,
    mesNombres: MES_NOMBRES,
    zipFiles: zipFiles,
    specialFolders: specialFolders
  });
});

router.get('/ver/:id', (req, res) => {
  var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
  if (!factura) return res.status(404).send('No encontrada');
  var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
  var lineas = [], cdrG = {};
  lineasRaw.forEach(function(l) {
    if (l.tipo === 'cdr') { var k=(l.linea||'')+'|'+(l.tipo||'exceso'); if(!cdrG[k]) cdrG[k]={linea:l.linea,tipo:'cdr',total:0,concepto:l.concepto}; cdrG[k].total+=parseFloat(l.importe||0); }
    else { lineas.push(l); }
  });
  for (var gk in cdrG) { var g=cdrG[gk]; lineas.push({concepto:g.concepto,tipo:'cdr',importe:Math.round(g.total*100)/100,linea:g.linea}); }
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

// View a PDF from ZIP storage by filename
router.get('/ver-zip', (req, res) => {
  var pdfName = req.query.pdf;
  if (!pdfName) return res.status(400).send('Falta nombre PDF');
  var result = nube.findPDFInZips(pdfName);
  if (!result) {
    // Try with Factura- prefix
    var altName = 'Factura-' + pdfName;
    if (!altName.endsWith('.pdf')) altName += '.pdf';
    result = nube.findPDFInZips(altName);
    if (!altName.startsWith('Factura-')) {
      var altName2 = 'Factura-' + pdfName.replace(/\.pdf$/i,'') + '.pdf';
      result = nube.findPDFInZips(altName2);
    }
  }
  if (!result) return res.status(404).send('No encontrado en ZIP');
  var isDownload = req.query.download === '1';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', (isDownload ? 'attachment' : 'inline') + '; filename="' + pdfName + '"');
  res.send(result.data);
});

router.get('/pdf/:id', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).send('No encontrada');
    var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    // Group CDR lines
    var lineas = [], cdrG = {};
    lineasRaw.forEach(function(l) {
      if (l.tipo === 'cdr') {
        var k = (l.linea||'')+'|'+(l.tipo||'exceso');
        if (!cdrG[k]) cdrG[k] = { linea: l.linea, tipo: 'cdr', total: 0, concepto: l.concepto };
        cdrG[k].total += parseFloat(l.importe||0);
      } else { lineas.push(l); }
    });
    for (var gk in cdrG) { var g=cdrG[gk]; lineas.push({ concepto: g.concepto, tipo: 'cdr', importe: Math.round(g.total*100)/100, linea: g.linea }); }
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

    // Check ZIP storage
    var zipResult = nube.findPDFInZips(nombreArchivo);
    if (zipResult) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="' + nombreArchivo + '"');
      return res.send(zipResult.data);
    }

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
    var MESES_INV = { 'Enero':1,'Febrero':2,'Marzo':3,'Abril':4,'Mayo':5,'Junio':6,'Julio':7,'Agosto':8,'Septiembre':9,'Octubre':10,'Noviembre':11,'Diciembre':12 };

    pdfs.forEach(function(p) {
      if (year !== 'todas' && p.year !== year) return;
      if (month && MESES_INV[p.month] !== parseInt(month)) return;
      if (fs.existsSync(p.fullPath)) {
        archive.file(p.fullPath, { name: p.year + '/' + p.month + '/' + p.fileName });
      }
    });

    // Also add ZIP-internal PDFs
    var zipPdfs = nube.getAllPDFNamesFromZips();
    Object.keys(zipPdfs).forEach(function(pdfName) {
      var info = zipPdfs[pdfName];
      if (year !== 'todas' && info.year !== year) return;
      if (month && MESES_INV[info.month] !== parseInt(month)) return;
      var data = nube.getPDFDataFromZip(info.zipPath, info.entryName);
      if (data) {
        archive.append(data, { name: info.year + '/' + info.month + '/' + pdfName });
      }
    });

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
      var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(f.id);
      var lineas = [], cdrG = {};
      lineasRaw.forEach(function(l) {
        if (l.tipo === 'cdr') { var k=(l.linea||'')+'|'+(l.tipo||'exceso'); if(!cdrG[k]) cdrG[k]={linea:l.linea,tipo:'cdr',total:0,concepto:l.concepto}; cdrG[k].total+=parseFloat(l.importe||0); }
        else { lineas.push(l); }
      });
      for (var gk in cdrG) { var g=cdrG[gk]; lineas.push({concepto:g.concepto,tipo:'cdr',importe:Math.round(g.total*100)/100,linea:g.linea}); }
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

// Import ZIPs from local Downloads
router.post('/importar-zips', (req, res) => {
  try {
    var result = nube.importZipsFromDownloads();
    res.json(result);
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
