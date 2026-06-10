const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const { getApiInstance } = require('../../likes-api');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.use(requireAuth);

var uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'cdrs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
var upload = multer({ dest: uploadDir });

// CDR dashboard - grouped by client with month/year navigation
router.get('/', async (req, res) => {
  try {
    var selectedPeriodo = req.query.periodo || '';
    var yearsMap = {};
    
    // Test DB connection
    if (!db) { console.error('[CDRs] db is falsy!'); return res.status(500).send('DB not available'); }
    if (typeof db.prepare !== 'function') { console.error('[CDRs] db.prepare is not a function'); return res.status(500).send('DB prepare not available'); }
    
    var grupos = [];
    var total = { c: 0, t: 0 };
    var clientes = [];
    
    try { clientes = db.prepare('SELECT id, nombre, likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL').all(); } catch(e) { console.error('[CDRs] clientes query:', e.message); }
    
    try {
      var allPeriods = db.prepare("SELECT DISTINCT periodo FROM isp_cdrs WHERE periodo IS NOT NULL AND periodo != '' ORDER BY periodo DESC").all();
      allPeriods.forEach(function(p) {
        var parts = (p.periodo || '').split('-');
        if (parts.length >= 2) {
          var y = parts[0], m = parseInt(parts[1]);
          if (!yearsMap[y]) yearsMap[y] = {};
          yearsMap[y][m] = true;
        }
      });
    } catch(periodErr) { console.error('[CDRs] period query:', periodErr.message); }

    try {
      var simpleQuery = "SELECT * FROM isp_cdrs";
      if (selectedPeriodo) simpleQuery += " WHERE periodo = '" + selectedPeriodo.replace(/'/g, "''") + "'";
      simpleQuery += " ORDER BY created_at DESC LIMIT 500";
      var cdrs = db.prepare(simpleQuery).all();
      
      var cdrsByFiscal = {};
      cdrs.forEach(function(c) {
        var key = c.fiscal_id || 'sin_fiscal';
        if (!cdrsByFiscal[key]) cdrsByFiscal[key] = { cdrs: [], total: 0 };
        cdrsByFiscal[key].cdrs.push(c);
        cdrsByFiscal[key].total += parseFloat(c.importe || 0);
      });

      Object.keys(cdrsByFiscal).forEach(function(key) {
        var firstCdr = cdrsByFiscal[key].cdrs[0];
        var nombre = firstCdr ? (firstCdr.fiscal_id || key) : key;
        grupos.push({ cliente: nombre, fiscal_id: key, cdrs: cdrsByFiscal[key].cdrs, total: cdrsByFiscal[key].total });
      });
    } catch(cdrErr) { console.error('[CDRs] main query:', cdrErr.message); }

    try {
      var totalRow = db.prepare("SELECT COUNT(*) as c, IFNULL(SUM(importe),0) as t FROM isp_cdrs WHERE factura_id IS NULL").get();
      if (totalRow) total = totalRow;
    } catch(totalErr) { console.error('[CDRs] total query:', totalErr.message); }
    
    res.render('isp/cdrs/index', { title: 'CDRs y Excedentes', groups: grupos, total: total, clientes: clientes, yearsMap: yearsMap, selectedPeriodo: selectedPeriodo, MES_NOMBRES: ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] });
  } catch(e) { console.error('[CDRs] Error completo:', e.stack || e.message); res.status(500).send('Error: ' + (e.message || e)); }
});

// Get daily CDR data for a specific line (from Likes API or DB)
router.get('/daily/:linea', async (req, res) => {
  try {
    var api = getApiInstance();
    var data = await api.getLineCDRs(req.params.linea);
    res.json({ ok: true, data: data || [] });
  } catch(e) {
    try {
      var cdrs = db.prepare("SELECT periodo, SUM(importe) as importe, SUM(unidades) as unidades, tipo FROM isp_cdrs WHERE linea=? GROUP BY periodo, tipo ORDER BY periodo").all(req.params.linea);
      res.json({ ok: true, data: cdrs, source: 'db' });
    } catch(e2) {
      res.json({ ok: false, error: e.message });
    }
  }
});

// Import CSV
router.post('/import', upload.single('csv'), (req, res) => {
  try {
    if (!req.file) return res.json({ ok: false, error: 'No se subió ningún archivo' });
    
    var content = fs.readFileSync(req.file.path, 'utf8');
    var lines = content.split('\n').filter(Boolean);
    var importados = 0, errores = 0;
    
    var insert = db.prepare('INSERT INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)');
    
    for (var i = 1; i < lines.length; i++) { // skip header
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
        
        if (!fiscalId && !linea) { errores++; continue; }
        
        // Find fiscalId from clients if only linea provided
        if (!fiscalId && linea) {
          var cli = db.prepare("SELECT likes_customer_id FROM clients WHERE id IN (SELECT client_id FROM isp_contratos WHERE linea=?)").get(linea);
          if (cli) fiscalId = cli.likes_customer_id;
        }
        
        insert.run(fiscalId || '', linea, concepto, tipo, importe, unidades, periodo || new Date().toISOString().split('T')[0].substring(0, 7));
        importados++;
      } catch(e) { errores++; }
    }
    
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, importados: importados, errores: errores });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Manual entry
router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)').run(
      req.body.fiscal_id || '', req.body.linea || '', req.body.concepto, req.body.tipo || 'exceso', parseFloat(req.body.importe || 0), parseFloat(req.body.unidades || 0), req.body.periodo || ''
    );
    res.redirect('/isp/cdrs');
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// Delete CDR
router.post('/delete', (req, res) => {
  try {
    db.prepare('DELETE FROM isp_cdrs WHERE id=?').run(req.body.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// CSV format example download
router.get('/ejemplo', (req, res) => {
  var csv = 'fiscalId,linea,concepto,tipo,importe,unidades,periodo\n0V8V24788,633879873,GB extra,exceso,2.10,0.5,2026-05\n123242134,633012242,Llamadas internacionales,exceso,5.00,15,2026-05\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=cdrs_ejemplo.csv');
  res.send(csv);
});

module.exports = router;
