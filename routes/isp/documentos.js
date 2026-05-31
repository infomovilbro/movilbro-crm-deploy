const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nubeHelper = require('../../helpers/nube');
const router = express.Router();

router.use(requireAuth);

var NUBE_DIR = path.join(__dirname, '..', '..', 'nube');

// Ensure temp upload directory exists
var uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'documentos');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch(e) {}

var MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function listNubeFolders() {
  var folders = [];
  if (!fs.existsSync(NUBE_DIR)) return folders;
  var entries = fs.readdirSync(NUBE_DIR);
  entries.forEach(function(e) {
    var fullPath = path.join(NUBE_DIR, e);
    if (fs.statSync(fullPath).isDirectory() && !e.startsWith('_') && e !== 'plantillas') {
      folders.push({ name: e, path: fullPath });
    }
  });
  var yearFolders = entries.filter(function(e) { return /^\d{4}$/.test(e); });
  yearFolders.forEach(function(year) {
    var yearDir = path.join(NUBE_DIR, year);
    var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
    months.forEach(function(month) {
      folders.push({ name: year + '/' + month, path: path.join(yearDir, month) });
    });
  });
  return folders;
}

var upload = multer({ dest: uploadsDir });

router.get('/', (req, res) => {
  try {
    const documentos = db.prepare('SELECT d.*, cl.nombre as cliente_nombre FROM isp_documentos d LEFT JOIN clients cl ON d.client_id=cl.id ORDER BY d.created_at DESC').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    const nubeFolders = listNubeFolders();
    res.render('isp/documentos/index', { title: 'Documentos', documentos, clientes, nubeFolders });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/upload', upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No se subió ningún archivo');

    var destino = req.body.destino_nube || '';
    var nombre = req.body.nombre || req.file.originalname;
    var tipo = req.body.tipo || 'otro';
    var categoria = req.body.categoria || 'otro';
    var clientId = req.body.client_id || null;

    // Always save to nube/cloud
    if (!destino) {
      var now = new Date();
      var year = now.getFullYear().toString();
      var monthName = MESES_NOMBRE[now.getMonth()];
      destino = path.join(year, monthName);
    }
    var result = nubeHelper.guardarArchivo(req.file.path, req.file.originalname, destino);

    db.prepare('INSERT INTO isp_documentos (nombre, tipo, categoria, archivo, ruta, tamanio, client_id) VALUES (?,?,?,?,?,?,?)').run(nombre, tipo, categoria, req.file.originalname, result.destPath, req.file.size, clientId);
    res.redirect('/isp/documentos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/:id/download', (req, res) => {
  try {
    var doc = db.prepare('SELECT * FROM isp_documentos WHERE id=?').get(req.params.id);
    if (!doc) return res.status(404).send('No encontrado');
    if (!fs.existsSync(doc.ruta)) return res.status(404).send('Archivo no encontrado en disco');
    res.download(doc.ruta, doc.archivo || doc.nombre);
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

// Subir documento existente a la nube
router.post('/:id/subir-nube', (req, res) => {
  try {
    var doc = db.prepare('SELECT * FROM isp_documentos WHERE id=?').get(req.params.id);
    if (!doc) return res.json({ success: false, error: 'No encontrado' });
    if (!fs.existsSync(doc.ruta)) return res.json({ success: false, error: 'Archivo no encontrado en disco' });
    var destino = req.body.destino || '';
    if (!destino) {
      var now = new Date();
      var year = now.getFullYear().toString();
      var monthName = MESES_NOMBRE[now.getMonth()];
      destino = path.join(year, monthName);
    }
    var buf = fs.readFileSync(doc.ruta);
    var ext = path.extname(doc.archivo || doc.nombre);
    var baseName = path.basename(doc.archivo || doc.nombre, ext);
    var fileName = baseName + ext;
    var destDir = path.join(NUBE_DIR, destino);
    nubeHelper.ensureDir(destDir);
    var destPath = path.join(destDir, fileName);
    var counter = 1;
    while (fs.existsSync(destPath)) {
      destPath = path.join(destDir, baseName + '_' + counter + ext);
      counter++;
    }
    fs.writeFileSync(destPath, buf);
    db.prepare('UPDATE isp_documentos SET ruta=?, destino_nube=? WHERE id=?').run(destPath, destino, doc.id);
    res.json({ success: true, path: destPath });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/:id/delete', (req, res) => {
  try {
    var doc = db.prepare('SELECT * FROM isp_documentos WHERE id=?').get(req.params.id);
    if (doc && doc.ruta && fs.existsSync(doc.ruta)) {
      try { fs.unlinkSync(doc.ruta); } catch(e) {}
    }
    db.prepare('DELETE FROM isp_documentos WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
