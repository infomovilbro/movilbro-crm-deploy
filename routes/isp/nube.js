const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const path = require('path');
const nube = require('../../helpers/nube');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  var pdfs = nube.listarPDFs();
  var stats = { total: pdfs.length, sizeTotal: 0 };
  pdfs.forEach(function(p) { stats.sizeTotal += p.size; });
  res.render('isp/nube', {
    title: 'Nube - Facturas',
    pdfs,
    stats,
    driveFolderId: nube.DRIVE_FOLDER_ID,
    driveUrl: 'https://drive.google.com/drive/u/0/folders/' + nube.DRIVE_FOLDER_ID,
    driveConfigurado: !!nube.getDriveAuth()
  });
});

router.post('/subir/:id', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.json({ ok: false, error: 'Factura no encontrada' });
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id);
    var result = await nube.procesarFactura(factura, lineas, cdrsDetalle);
    res.json({ ok: true, local: result.local, drive: result.drive, nombre: result.nombreArchivo });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/subir-todas', async (req, res) => {
  try {
    var facturas = db.prepare('SELECT * FROM isp_facturas ORDER BY fecha_emision DESC').all();
    var resultados = [];
    for (var f of facturas) {
      try {
        var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(f.id);
        var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(f.id);
        var result = await nube.procesarFactura(f, lineas, cdrsDetalle);
        resultados.push({ id: f.id, ok: true, nombre: result.nombreArchivo });
      } catch(e) {
        resultados.push({ id: f.id, ok: false, error: e.message });
      }
    }
    res.json({ ok: true, total: facturas.length, resultados });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/config', (req, res) => {
  var hasCreds = !!db.prepare("SELECT value FROM settings WHERE key='drive_credentials'").get()?.value;
  var hasToken = !!db.prepare("SELECT value FROM settings WHERE key='drive_token'").get()?.value;
  var protocol = req.protocol;
  var host = req.get('host');
  var redirectUri = protocol + '://' + host + '/isp/nube/auth-callback';
  res.render('isp/nube-config', {
    title: 'Configurar Google Drive',
    hasCreds, hasToken,
    driveFolderId: nube.DRIVE_FOLDER_ID,
    redirectUri: redirectUri,
    _protocol: protocol,
    _host: host
  });
});

router.post('/config/save-credentials', (req, res) => {
  try {
    var { client_id, client_secret, redirect_uri } = req.body;
    var creds = JSON.stringify({ client_id, client_secret, redirect_uri: redirect_uri || (req.protocol + '://' + req.get('host') + '/isp/nube/auth-callback') });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('drive_credentials', ?)").run(creds);
    res.json({ ok: true, redirect_uri: redirect_uri || (req.protocol + '://' + req.get('host') + '/isp/nube/auth-callback') });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/auth-url', (req, res) => {
  var creds = db.prepare("SELECT value FROM settings WHERE key='drive_credentials'").get()?.value;
  if (!creds) return res.json({ ok: false, error: 'Primero configura las credenciales' });
  try {
    var c = JSON.parse(creds);
    var oauth2 = new (require('googleapis').google.auth.OAuth2)(c.client_id, c.client_secret, c.redirect_uri);
    var url = oauth2.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/drive.file'], prompt: 'consent' });
    res.json({ ok: true, url });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/auth-callback', async (req, res) => {
  try {
    var code = req.query.code;
    if (!code) return res.status(400).send('Falta code');
    var creds = db.prepare("SELECT value FROM settings WHERE key='drive_credentials'").get()?.value;
    if (!creds) return res.status(400).send('Credenciales no configuradas');
    var c = JSON.parse(creds);
    var oauth2 = new (require('googleapis').google.auth.OAuth2)(c.client_id, c.client_secret, c.redirect_uri);
    var tokens = await oauth2.getToken(code);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('drive_token', ?)").run(JSON.stringify(tokens.tokens));
    res.send('<h2>Google Drive configurado correctamente</h2><p>Ya puedes cerrar esta ventana y volver al CRM.</p><script>setTimeout(function(){window.close()},2000);</script>');
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/descargar', (req, res) => {
  var filePath = req.query.path;
  if (!filePath) return res.status(400).send('Falta path');
  if (!filePath.startsWith(nube.NUBE_DIR)) return res.status(403).send('Acceso denegado');
  if (!require('fs').existsSync(filePath)) return res.status(404).send('No encontrado');
  res.download(filePath);
});

module.exports = router;
