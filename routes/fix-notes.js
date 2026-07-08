const express = require('express');
var router = express.Router();
const { db } = require('../database');
const drive = require('../helpers/drive');
const nube = require('../helpers/nube');
const ROOT_ID = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';

// POST — guardar nota de error
router.post('/api/fix-notes', async (req, res) => {
  try {
    var { url, selector, element_text, note } = req.body;
    if (!url || !note) return res.json({ ok: false, error: 'url y note requeridos' });
    var info = db.prepare("INSERT INTO fix_notes (url, selector, element_text, note) VALUES (?,?,?,?)").run(url, selector || '', element_text || '', note);
    var id = info.lastInsertRowid;
    // Guardar tambien en nube (local + DB + Drive) como los demas documentos
    try {
      var now = new Date();
      var periodo = now.toISOString().substring(0, 7);
      var jsonBuf = Buffer.from(JSON.stringify({ id, url, selector, element_text, note, created_at: now.toISOString() }, null, 2), 'utf8');
      var nomArchivo = 'fixnote-' + id + '-' + now.toISOString().replace(/[:.]/g, '-').substring(0, 19) + '.json';
      await nube.guardarLocal(jsonBuf, periodo, nomArchivo);
    } catch(e) { console.error('[FixNotes] Error guardando en nube:', e.message); }
    res.json({ ok: true, id });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — listar notas pendientes
router.get('/api/fix-notes', (req, res) => {
  try {
    var pending = db.prepare("SELECT * FROM fix_notes WHERE status='pending' ORDER BY created_at DESC").all();
    var fixed = db.prepare("SELECT * FROM fix_notes WHERE status='fixed' ORDER BY fixed_at DESC LIMIT 50").all();
    // Si no hay notas en DB, restaurar desde backup
    if (pending.length === 0 && fixed.length === 0) {
      try {
        var backup = db.prepare("SELECT value FROM settings WHERE key='fix_notes_backup'").get();
        if (backup && backup.value) {
          var notes = JSON.parse(backup.value);
          pending = notes.filter(function(n) { return n.status === 'pending'; });
          fixed = notes.filter(function(n) { return n.status === 'fixed'; }).slice(0, 50);
          // Restaurar a la tabla
          notes.forEach(function(n) {
            try { db.prepare("INSERT OR IGNORE INTO fix_notes (id, url, selector, element_text, note, status, created_at, fixed_at) VALUES (?,?,?,?,?,?,?,?)").run(n.id, n.url, n.selector || '', n.element_text || '', n.note, n.status || 'pending', n.created_at, n.fixed_at || null); } catch(e) {}
          });
          console.log('[FixNotes] Restauradas', notes.length, 'notas desde backup');
        }
      } catch(e) {}
    }
    res.json({ ok: true, pending, fixed });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// DELETE — eliminar nota
router.delete('/api/fix-notes/:id', (req, res) => {
  try { db.prepare("DELETE FROM fix_notes WHERE id=?").run(req.params.id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST — marcar como arreglado
router.post('/api/fix-notes/:id/fix', (req, res) => {
  try { db.prepare("UPDATE fix_notes SET status='fixed', fixed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id); res.json({ ok: true }); }
  catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST — guardar todas las notas en Drive con estructura fix-notes/YYYY/MM/DD/
router.post('/api/fix-notes/save-to-drive', async (req, res) => {
  try {
    var all = db.prepare("SELECT * FROM fix_notes ORDER BY created_at DESC").all();
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    var ts = now.toISOString().replace(/[:.]/g, '-');
    var fileName = 'fix-notes-' + ts + '.json';
    var jsonContent = JSON.stringify({ savedAt: now.toISOString(), total: all.length, notes: all }, null, 2);
    var buf = Buffer.from(jsonContent, 'utf8');

    var dApi = drive.getDrive();
    if (!dApi) return res.json({ ok: false, error: 'Drive no disponible' });

    var fixNotesId = await drive.ensureFolder(ROOT_ID, 'fix-notes');
    if (!fixNotesId) return res.json({ ok: false, error: 'No se pudo crear carpeta fix-notes' });
    var yearId = await drive.ensureFolder(fixNotesId, String(y));
    var monthId = await drive.ensureFolder(yearId, m);
    var dayId = await drive.ensureFolder(monthId, d);
    if (!dayId) return res.json({ ok: false, error: 'No se pudo crear carpeta de día' });

    var result = await dApi.files.create({
      requestBody: { name: fileName, parents: [dayId] },
      media: { mimeType: 'application/json', body: require('stream').Readable.from(buf) },
      fields: 'id, webViewLink'
    });
    res.json({ ok: true, fileId: result.data.id, fileName, webViewLink: result.data.webViewLink || '' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — listar estructura de snapshots disponibles en Drive (años > meses > días > archivos)
router.get('/api/fix-notes/drive-history', async (req, res) => {
  try {
    var dApi = drive.getDrive();
    if (!dApi) return res.json({ ok: true, years: [] });
    var fnRes = await dApi.files.list({ q: "'" + ROOT_ID + "' in parents and name='fix-notes' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    var fnFolder = fnRes.data.files && fnRes.data.files[0];
    if (!fnFolder) return res.json({ ok: true, years: [] });

    var yearRes = await dApi.files.list({ q: "'" + fnFolder.id + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id, name)', orderBy: 'name desc', pageSize: 50 });
    var years = [];
    for (var yi = 0; yi < (yearRes.data.files || []).length; yi++) {
      var yr = yearRes.data.files[yi];
      var moRes = await dApi.files.list({ q: "'" + yr.id + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id, name)', orderBy: 'name desc', pageSize: 50 });
      var months = [];
      for (var mi = 0; mi < (moRes.data.files || []).length; mi++) {
        var mo = moRes.data.files[mi];
        var dyRes = await dApi.files.list({ q: "'" + mo.id + "' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id, name)', orderBy: 'name desc', pageSize: 50 });
        var days = [];
        for (var di = 0; di < (dyRes.data.files || []).length; di++) {
          var dy = dyRes.data.files[di];
          var flRes = await dApi.files.list({ q: "'" + dy.id + "' in parents and mimeType='application/json' and trashed=false", fields: 'files(id, name, createdTime)', orderBy: 'name desc', pageSize: 100 });
          days.push({ name: dy.name, files: (flRes.data.files || []).map(function(f) { return { id: f.id, name: f.name, created: f.createdTime }; }) });
        }
        months.push({ name: mo.name, days: days });
      }
      years.push({ name: yr.name, months: months });
    }
    res.json({ ok: true, years: years });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — cargar un snapshot específico de Drive
router.get('/api/fix-notes/drive-snapshot/:year/:month/:day/:file', async (req, res) => {
  try {
    var dApi = drive.getDrive();
    if (!dApi) return res.json({ ok: false, error: 'Drive no disponible' });

    var fnRes = await dApi.files.list({ q: "'" + ROOT_ID + "' in parents and name='fix-notes' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    var fnFolder = fnRes.data.files && fnRes.data.files[0];
    if (!fnFolder) return res.json({ ok: false, error: 'No hay carpeta fix-notes' });

    var y = req.params.year, m = req.params.month, d = req.params.day, f = req.params.file;
    var yrRes = await dApi.files.list({ q: "'" + fnFolder.id + "' in parents and name='" + y + "' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    var yrF = yrRes.data.files && yrRes.data.files[0];
    if (!yrF) return res.json({ ok: false, error: 'Año no encontrado' });
    var moRes = await dApi.files.list({ q: "'" + yrF.id + "' in parents and name='" + m + "' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    var moF = moRes.data.files && moRes.data.files[0];
    if (!moF) return res.json({ ok: false, error: 'Mes no encontrado' });
    var dyRes = await dApi.files.list({ q: "'" + moF.id + "' in parents and name='" + d + "' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
    var dyF = dyRes.data.files && dyRes.data.files[0];
    if (!dyF) return res.json({ ok: false, error: 'Día no encontrado' });

    var flRes = await dApi.files.list({ q: "'" + dyF.id + "' in parents and name='" + f + "' and trashed=false", fields: 'files(id, name)', pageSize: 1 });
    var flF = flRes.data.files && flRes.data.files[0];
    if (!flF) return res.json({ ok: false, error: 'Archivo no encontrado' });

    var buf = await drive.getFileBuffer(flF.id);
    if (!buf) return res.json({ ok: false, error: 'No se pudo leer el archivo' });
    var data = JSON.parse(buf.toString('utf8'));
    res.json({ ok: true, fileName: flF.name, data: data });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — página para ver notas
router.get('/fix-notes', (req, res) => {
  var pending = db.prepare("SELECT * FROM fix_notes WHERE status='pending' ORDER BY created_at DESC").all();
  var fixed = db.prepare("SELECT * FROM fix_notes WHERE status='fixed' ORDER BY fixed_at DESC LIMIT 50").all();
  res.render('fix-notes', { title: 'Notas de Error — Soluciones Pendientes', pending, fixed });
});

module.exports = router;
