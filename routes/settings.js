const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const router = express.Router();

function loadSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  return s;
}

router.get('/', requireAuth, (req, res) => {
  const settings = loadSettings();
  const users = db.prepare('SELECT id, username, nombre, email, rol FROM users').all();
  res.render('settings/index', { title: 'Configuracion', settings, users, success: req.query.success || null, error: req.query.error || null });
});

function saveFields(fields) {
  const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((pairs) => {
    for (const [k, v] of pairs) insert.run(k, v);
  });
  tx(Object.entries(fields));
}

router.post('/empresa', requireAuth, (req, res) => {
  saveFields({
    empresa_nombre: req.body.empresa_nombre,
    empresa_cif: req.body.empresa_cif,
    empresa_direccion: req.body.empresa_direccion,
    empresa_telefono: req.body.empresa_telefono,
    empresa_email: req.body.empresa_email,
    empresa_web: req.body.empresa_web
  });
  res.redirect('/configuracion?success=Empresa actualizada');
});

router.post('/ui', requireAuth, (req, res) => {
  saveFields({
    ui_sidebar_bg: req.body.ui_sidebar_bg,
    ui_sidebar_active: req.body.ui_sidebar_active,
    ui_primary_color: req.body.ui_primary_color,
    ui_module_name_panel: req.body.ui_module_name_panel,
    ui_module_name_altas: req.body.ui_module_name_altas,
    ui_module_name_analytics: req.body.ui_module_name_analytics,
    ui_module_name_clients: req.body.ui_module_name_clients,
    ui_module_name_products: req.body.ui_module_name_products,
    ui_module_name_orders: req.body.ui_module_name_orders,
    ui_module_name_subscriptions: req.body.ui_module_name_subscriptions,
    ui_module_name_tickets: req.body.ui_module_name_tickets,
    ui_module_name_coverage: req.body.ui_module_name_coverage,
    ui_module_name_billing: req.body.ui_module_name_billing,
    ui_module_name_settings: req.body.ui_module_name_settings,
    ui_external_section_name: req.body.ui_external_section_name,
    ui_module_name_history: req.body.ui_module_name_history,
    ui_module_name_whatsapp: req.body.ui_module_name_whatsapp,
    ui_module_name_email: req.body.ui_module_name_email,
    ui_module_name_stripe: req.body.ui_module_name_stripe
  });
  res.redirect('/configuracion?success=Personalizacion guardada');
});

router.post('/api', requireAuth, (req, res) => {
  saveFields({
    likes_api_url: req.body.likes_api_url,
    likes_client_id: req.body.likes_client_id,
    likes_client_secret: req.body.likes_client_secret,
    likes_brand_id: req.body.likes_brand_id
  });
  res.redirect('/configuracion?success=API configurada');
});

router.post('/usuario/nuevo', requireAuth, (req, res) => {
  const { username, password, nombre, email, rol } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)').run(username, hash, nombre, email, rol || 'user');
  } catch (e) {
    return res.redirect('/configuracion?error=El usuario ya existe');
  }
  res.redirect('/configuracion?success=Usuario creado');
});

module.exports = router;
