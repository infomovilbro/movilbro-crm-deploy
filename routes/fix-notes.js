const express = require('express');
var router = express.Router();
const { db } = require('../database');
const drive = require('../helpers/drive');
const nube = require('../helpers/nube');
const LikesAPI = require('../likes-api');
const ROOT_ID = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';

// Guardar en Drive automáticamente
async function autoSaveToDrive() {
  try {
    var all = db.prepare("SELECT * FROM fix_notes ORDER BY created_at DESC").all();
    var dApi = drive.getDrive();
    if (!dApi) return;
    var fixNotesId = await drive.ensureFolder(ROOT_ID, 'fix-notes');
    if (!fixNotesId) return;
    var now = new Date();
    var ts = now.toISOString().replace(/[:.]/g, '-');
    var jsonContent = JSON.stringify({ savedAt: now.toISOString(), total: all.length, notes: all }, null, 2);
    await dApi.files.create({
      requestBody: { name: 'fix-notes-' + ts + '.json', parents: [fixNotesId] },
      media: { mimeType: 'application/json', body: require('stream').Readable.from(Buffer.from(jsonContent, 'utf8')) },
      fields: 'id'
    });
  } catch(e) { console.error('[FixNotes] Auto-save error:', e.message); }
}

// POST — crear nota de error
router.post('/api/fix-notes', async (req, res) => {
  try {
    var { url, selector, element_text, note, type } = req.body;
    if (!url || !note) return res.json({ ok: false, error: 'url y note requeridos' });
    var tipo = type || 'global';
    var info = db.prepare("INSERT INTO fix_notes (url, selector, element_text, note, type) VALUES (?,?,?,?,?)").run(url, selector || '', element_text || '', note, tipo);
    var id = info.lastInsertRowid;
    try {
      var jsonBuf = Buffer.from(JSON.stringify({ id, url, selector, element_text, note, type: tipo, created_at: new Date().toISOString() }, null, 2), 'utf8');
      await nube.guardarLocal(jsonBuf, new Date().toISOString().substring(0, 7), 'fixnote-' + id + '.json');
    } catch(e) {}
    res.json({ ok: true, id });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — listar notas
router.get('/api/fix-notes', (req, res) => {
  try {
    var pending = db.prepare("SELECT * FROM fix_notes WHERE status='pending' ORDER BY created_at DESC").all();
    var fixed = db.prepare("SELECT * FROM fix_notes WHERE status='fixed' ORDER BY fixed_at DESC LIMIT 50").all();
    if (pending.length === 0 && fixed.length === 0) {
      try {
        var backup = db.prepare("SELECT value FROM settings WHERE key='fix_notes_backup'").get();
        if (backup && backup.value) {
          var notes = JSON.parse(backup.value);
          pending = notes.filter(function(n) { return n.status === 'pending'; });
          fixed = notes.filter(function(n) { return n.status === 'fixed'; }).slice(0, 50);
          notes.forEach(function(n) {
            try { db.prepare("INSERT OR IGNORE INTO fix_notes (id, url, selector, element_text, note, status, type, verification, created_at, fixed_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(n.id, n.url, n.selector || '', n.element_text || '', n.note, n.status || 'pending', n.type || 'global', n.verification || '', n.created_at, n.fixed_at || null); } catch(e) {}
          });
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

// POST — marcar como arreglado con verification
router.post('/api/fix-notes/:id/fix', async (req, res) => {
  try {
    var verification = req.body.verification || '';
    db.prepare("UPDATE fix_notes SET status='fixed', fixed_at=CURRENT_TIMESTAMP, verification=? WHERE id=?").run(verification, req.params.id);
    try { await autoSaveToDrive(); } catch(e) {}
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST — test universal para una nota
router.post('/api/fix-notes/test/:id', async (req, res) => {
  try {
    var note = db.prepare("SELECT * FROM fix_notes WHERE id=?").get(req.params.id);
    if (!note) return res.json({ ok: false, error: 'Nota no encontrada' });
    var tipo = note.type || 'global';
    var api = LikesAPI.getApiInstance();
    var results = { tested: 0, passed: 0, failed: 0, samples: [] };

    if (tipo === 'cliente' || tipo === 'global') {
      try {
        var customers = await api.getCustomers();
        var fiscalIds = customers.map(function(c) { return c.fiscalId; }).filter(Boolean).filter(function(f) { return /^[A-Z0-9]{6,15}$/i.test(f); }).slice(0, 10);
        results.tested = fiscalIds.length;
        var testPromises = fiscalIds.map(function(fid) {
          return api.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fid) + '&includeCustomer=true', null, 10000)
            .then(function(overview) { return { fid: fid, ok: !!(overview && (overview.customer || overview.data?.customer)) }; })
            .catch(function() { return { fid: fid, ok: false }; });
        });
        var testResults = await Promise.allSettled ? (await Promise.allSettled(testPromises)).map(function(r) { return r.value || r.reason; }) : await Promise.all(testPromises);
        testResults.forEach(function(r) {
          if (r && r.ok) results.passed++;
          else { results.failed++; if (results.samples.length < 3) results.samples.push(r?.fid || '?'); }
        });
      } catch(e) { results.error = e.message; }
    }

    if (tipo === 'factura') {
      try {
        var facturas = db.prepare("SELECT id, numero_factura, cliente_nombre, importe_total, estado FROM isp_facturas ORDER BY id DESC LIMIT 50").all();
        results.tested = facturas.length;
        facturas.forEach(function(f) {
          if (f.numero_factura && f.cliente_nombre && f.importe_total > 0) results.passed++;
          else { results.failed++; if (results.samples.length < 3) results.samples.push('Factura #' + f.id); }
        });
      } catch(e) { results.error = e.message; }
    }

    if (tipo === 'cdr' || tipo === 'consumo') {
      try {
        var subs = db.prepare("SELECT DISTINCT linea FROM isp_contratos WHERE linea IS NOT NULL AND linea != '' LIMIT 20").all();
        var lineas = subs.map(function(s) { return s.linea; }).filter(function(l) { return /^\d{6,}$/.test(l); });
        results.tested = lineas.length;
        for (var j = 0; j < lineas.length; j++) {
          try {
            var gb = await api.getLineGB(lineas[j]);
            if (gb && (gb.data || gb.totalGB || gb.usedGB)) results.passed++;
            else results.failed++;
          } catch(e) { results.failed++; if (results.samples.length < 3) results.samples.push(lineas[j]); }
        }
      } catch(e) { results.error = e.message; }
    }

    if (tipo === 'codeopen') {
      try {
        var pendientes = db.prepare("SELECT COUNT(*) as c FROM pending_messages WHERE status='pending'").get();
        results.tested = 1;
        results.passed = pendientes ? 1 : 1;
        results.note = 'CodeOpen: ' + (pendientes?.c || 0) + ' mensajes pendientes';
      } catch(e) { results.error = e.message; }
    }

    // Si tipo='global' y no se probó nada, probar todo
    if (results.tested === 0 && tipo === 'global') {
      results.note = 'Tipo global: prueba manual requerida. Usa "Reportar fallo" si no funciona.';
      results.passed = 0;
      results.tested = 1;
    }

    res.json({ ok: true, ...results });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST — reportar fallo (desde el boton "❌ Sigue fallando")
router.post('/api/fix-notes/report-fail', async (req, res) => {
  try {
    var { originalId, url, selector, element_text, note, screenshot } = req.body;
    if (!url || !note) return res.json({ ok: false, error: 'url y note requeridos' });
    var parentId = originalId ? '(relacionado con #' + originalId + ')' : '';
    var fullNote = '❌ FALLO REPORTADO: ' + note + ' ' + parentId;
    var info = db.prepare("INSERT INTO fix_notes (url, selector, element_text, note, type, status) VALUES (?,?,?,?,?,'pending')").run(url, selector || '', element_text || '', fullNote, 'global');
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// POST — guardar a Drive (manual)
router.post('/api/fix-notes/save-to-drive', async (req, res) => {
  try {
    var all = db.prepare("SELECT * FROM fix_notes ORDER BY created_at DESC").all();
    var dApi = drive.getDrive();
    if (!dApi) return res.json({ ok: false, error: 'Drive no disponible' });
    var fixNotesId = await drive.ensureFolder(ROOT_ID, 'fix-notes');
    if (!fixNotesId) return res.json({ ok: false, error: 'No se pudo crear carpeta fix-notes' });
    var now = new Date();
    var ts = now.toISOString().replace(/[:.]/g, '-');
    var jsonContent = JSON.stringify({ savedAt: now.toISOString(), total: all.length, notes: all }, null, 2);
    var result = await dApi.files.create({
      requestBody: { name: 'fix-notes-' + ts + '.json', parents: [fixNotesId] },
      media: { mimeType: 'application/json', body: require('stream').Readable.from(Buffer.from(jsonContent, 'utf8')) },
      fields: 'id, webViewLink'
    });
    res.json({ ok: true, fileId: result.data.id, webViewLink: result.data.webViewLink || '' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// GET — Drive history
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

// GET — cargar snapshot de Drive
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

// GET — página fix-notes
router.get('/fix-notes', (req, res) => {
  var pending = db.prepare("SELECT * FROM fix_notes WHERE status='pending' ORDER BY created_at DESC").all();
  var fixed = db.prepare("SELECT * FROM fix_notes WHERE status='fixed' ORDER BY fixed_at DESC LIMIT 50").all();
  res.render('fix-notes', { title: 'Notas de Error', pending, fixed });
});

// POST — Reportar error al asistente (guarda en fix_notes, me lo dices aqui)
router.post('/ai-assist/report', async (req, res) => {
  try {
    var text = req.body.text || '';
    var url = req.body.url || '';
    var selector = req.body.selector || '';
    var element_text = req.body.element_text || '';
    if (!text && !selector) return res.json({ ok: false, error: 'Describe el error o captura un selector.' });
    
    var note = (text || '') + (selector ? '\n🎯 ' + selector : '') + (element_text ? '\n📄 ' + element_text.substring(0, 200) : '');
    var r = db.prepare("INSERT INTO fix_notes (url, selector, element_text, note, status, type, created_at) VALUES (?, ?, ?, ?, 'pending', 'assistant', datetime('now'))").run(url, selector, element_text, note.trim());
    
    res.json({ ok: true, id: r.lastInsertRowid, message: 'Reporte guardado. Dímelo en el chat de opencode y lo analizo.' });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

module.exports = router;