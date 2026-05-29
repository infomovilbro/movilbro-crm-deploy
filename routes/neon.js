const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');

router.get('/neon', requireAuth, (req, res) => {
  var estado = db.prepare("SELECT value FROM settings WHERE key = 'neon_neon_estado'").get();
  var encendido = estado && estado.value === 'on';
  res.render('neon/neon', { title: 'Neon', encendido });
});

router.post('/neon/toggle', requireAuth, (req, res) => {
  var actual = db.prepare("SELECT value FROM settings WHERE key = 'neon_neon_estado'").get();
  var nuevo = (actual && actual.value === 'on') ? 'off' : 'on';
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('neon_neon_estado', ?)").run(nuevo);
  res.json({ ok: true, estado: nuevo });
});

router.get('/regleta', requireAuth, (req, res) => {
  var estado = db.prepare("SELECT value FROM settings WHERE key = 'neon_regleta_estado'").get();
  var encendido = estado && estado.value === 'on';
  res.render('neon/regleta', { title: 'Regleta', encendido });
});

router.post('/regleta/toggle', requireAuth, (req, res) => {
  var actual = db.prepare("SELECT value FROM settings WHERE key = 'neon_regleta_estado'").get();
  var nuevo = (actual && actual.value === 'on') ? 'off' : 'on';
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('neon_regleta_estado', ?)").run(nuevo);
  res.json({ ok: true, estado: nuevo });
});

module.exports = router;
