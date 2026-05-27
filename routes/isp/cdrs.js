const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.use(requireAuth);

var uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'cdrs');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
var upload = multer({ dest: uploadDir });

// CDR dashboard
router.get('/', (req, res) => {
  try {
    var cdrs = db.prepare('SELECT c.*, f.cliente_nombre as cliente FROM isp_cdrs c LEFT JOIN isp_facturas f ON c.factura_id=f.id ORDER BY c.created_at DESC LIMIT 100').all();
    var total = db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(importe),0) as t FROM isp_cdrs WHERE factura_id IS NULL').get();
    var clientes = db.prepare('SELECT id, nombre, likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL').all();
    res.render('isp/cdrs/index', { title: 'CDRs y Excedentes', cdrs, total, clientes });
  } catch(e) { console.error(e); res.status(500).send('Error: ' + e.message); }
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
