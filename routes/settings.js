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
    ui_module_name_stripe: req.body.ui_module_name_stripe,
    ui_nav_config: req.body.ui_nav_config || '',
    ui_custom_buttons: req.body.ui_custom_buttons || '[]'
  });
  res.redirect('/configuracion?success=Personalizacion guardada');
});

router.post('/ui-editor-save', requireAuth, express.json({ limit: '1mb' }), (req, res) => {
  const payload = req.body || {};
  const nextNav = payload.navConfig ? JSON.stringify(payload.navConfig) : '';
  const nextButtons = Array.isArray(payload.customButtons) ? JSON.stringify(payload.customButtons) : '[]';
  const nextTheme = payload.theme && typeof payload.theme === 'object' ? JSON.stringify(payload.theme) : '';
  const nextLayout = payload.layout && typeof payload.layout === 'object' ? JSON.stringify(payload.layout) : '';

  const currentRows = db.prepare("SELECT key, value FROM settings WHERE key IN ('ui_nav_config','ui_custom_buttons','ui_live_theme','ui_sidebar_bg','ui_sidebar_active','ui_primary_color')").all();
  const current = {};
  currentRows.forEach(r => current[r.key] = r.value);

  const fields = {
    ui_nav_config: nextNav,
    ui_custom_buttons: nextButtons,
    ui_live_theme: nextTheme,
    ui_live_layout: nextLayout
  };
  if (payload.sidebarBg) fields.ui_sidebar_bg = payload.sidebarBg;
  if (payload.sidebarActive) fields.ui_sidebar_active = payload.sidebarActive;
  if (payload.primaryColor) fields.ui_primary_color = payload.primaryColor;
  if (payload.sidebarHover) fields.ui_sidebar_hover = payload.sidebarHover;
  if (payload.topbarBg) fields.ui_topbar_bg = payload.topbarBg;
  if (payload.topbarBorder) fields.ui_topbar_border = payload.topbarBorder;
  if (payload.bgBody) fields.ui_bg_body = payload.bgBody;
  if (payload.cardBg) fields.ui_card_bg = payload.cardBg;
  if (payload.textPrimary) fields.ui_text_primary = payload.textPrimary;
  if (payload.textSecondary) fields.ui_text_secondary = payload.textSecondary;
  if (payload.borderColor) fields.ui_border_color = payload.borderColor;
  if (payload.tableHoverBg) fields.ui_table_hover_bg = payload.tableHoverBg;
  if (payload.tableStripe) fields.ui_table_stripe = payload.tableStripe;
  if (payload.inputFocusShadow) fields.ui_input_focus_shadow = payload.inputFocusShadow;
  if (payload.shadowSm) fields.ui_shadow_sm = payload.shadowSm;
  if (payload.shadowMd) fields.ui_shadow_md = payload.shadowMd;
  if (payload.cardRadius) fields.ui_card_radius = payload.cardRadius;
  if (payload.font) fields.ui_font = payload.font;
  if (payload.success) fields.ui_success = payload.success;
  if (payload.danger) fields.ui_danger = payload.danger;
  if (payload.warning) fields.ui_warning = payload.warning;
  if (payload.info) fields.ui_info = payload.info;

  // Save baseline only once (the original state before visual edits)
  const hasBaseline = db.prepare("SELECT value FROM settings WHERE key = 'ui_editor_baseline'").get();
  if (!hasBaseline || !hasBaseline.value) {
    fields.ui_editor_baseline = JSON.stringify({
      ui_nav_config: current.ui_nav_config || '',
      ui_custom_buttons: current.ui_custom_buttons || '[]',
      ui_live_theme: current.ui_live_theme || '',
      ui_sidebar_bg: current.ui_sidebar_bg || '#1a1d23',
      ui_sidebar_active: current.ui_sidebar_active || '#0d6efd',
      ui_primary_color: current.ui_primary_color || '#0d6efd',
      ui_live_layout: current.ui_live_layout || ''
    });
  }

  saveFields(fields);

  res.json({ ok: true });
});

router.post('/ui-editor-reset', requireAuth, (req, res) => {
  const defaults = {
    ui_nav_config: '', ui_custom_buttons: '[]', ui_live_theme: '',
    ui_sidebar_bg: '#ffffff', ui_sidebar_active: '#0050A1', ui_primary_color: '#0050A1',
    ui_sidebar_hover: '', ui_topbar_bg: '', ui_topbar_border: '', ui_bg_body: '',
    ui_card_bg: '', ui_text_primary: '', ui_text_secondary: '', ui_border_color: '',
    ui_table_hover_bg: '', ui_table_stripe: '', ui_input_focus_shadow: '',
    ui_shadow_sm: '', ui_shadow_md: '', ui_card_radius: '', ui_font: '',
    ui_success: '', ui_danger: '', ui_warning: '', ui_info: '',
    ui_live_layout: ''
  };

  const baselineRow = db.prepare("SELECT value FROM settings WHERE key = 'ui_editor_baseline'").get();
  let baseline = null;
  try { baseline = baselineRow && baselineRow.value ? JSON.parse(baselineRow.value) : null; } catch (e) { baseline = null; }

  if (!baseline) {
    saveFields(defaults);
    return res.json({ ok: true, reset: 'default' });
  }

  const merged = Object.assign({}, defaults, baseline);
  saveFields(merged);

  res.json({ ok: true, reset: 'baseline' });
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
