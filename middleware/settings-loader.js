const { db } = require('../database');

function loadSettings(req, res, next) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);

  let navConfig = null;
  let customButtons = [];
  let liveTheme = null;
  let liveLayout = null;
  try { navConfig = settings.ui_nav_config ? JSON.parse(settings.ui_nav_config) : null; } catch (e) { navConfig = null; }
  try { customButtons = settings.ui_custom_buttons ? JSON.parse(settings.ui_custom_buttons) : []; } catch (e) { customButtons = []; }
  try { liveTheme = settings.ui_live_theme ? JSON.parse(settings.ui_live_theme) : null; } catch (e) { liveTheme = null; }
  try { liveLayout = settings.ui_live_layout ? JSON.parse(settings.ui_live_layout) : null; } catch (e) { liveLayout = null; }

  res.locals.ui = {
    sidebarBg: settings.ui_sidebar_bg || '#1a1d23',
    sidebarActive: settings.ui_sidebar_active || '#0d6efd',
    primaryColor: settings.ui_primary_color || '#0d6efd',
    sidebarHover: settings.ui_sidebar_hover || '#f5f5f5',
    topbarBg: settings.ui_topbar_bg || '#ffffff',
    topbarBorder: settings.ui_topbar_border || '#e8e8e8',
    bgBody: settings.ui_bg_body || '#f4f5fa',
    cardBg: settings.ui_card_bg || '#ffffff',
    textPrimary: settings.ui_text_primary || '#222222',
    textSecondary: settings.ui_text_secondary || '#6c757d',
    borderColor: settings.ui_border_color || '#e8e8e8',
    tableHoverBg: settings.ui_table_hover_bg || '#f8f9ff',
    tableStripe: settings.ui_table_stripe || '#fafafa',
    inputFocusShadow: settings.ui_input_focus_shadow || '0 0 0 2px rgba(0, 80, 161, 0.15)',
    shadowSm: settings.ui_shadow_sm || '0 1px 3px rgba(0, 0, 0, 0.06)',
    shadowMd: settings.ui_shadow_md || '0 3px 8px rgba(0, 0, 0, 0.08)',
    cardRadius: settings.ui_card_radius || '10px',
    font: settings.ui_font || "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    success: settings.ui_success || '#28a745',
    danger: settings.ui_danger || '#dc3545',
    warning: settings.ui_warning || '#ffc107',
    info: settings.ui_info || '#17a2b8',
    navConfig,
    customButtons,
    liveTheme,
    liveLayout,
    moduleName: {
      panel: settings.ui_module_name_panel || 'Panel',
      altas: settings.ui_module_name_altas || 'Altas',
      analytics: settings.ui_module_name_analytics || 'Analitica',
      clients: settings.ui_module_name_clients || 'Clientes',
      products: settings.ui_module_name_products || 'Productos',
      orders: settings.ui_module_name_orders || 'Ordenes',
      subscriptions: settings.ui_module_name_subscriptions || 'Suscripciones',
      tickets: settings.ui_module_name_tickets || 'Tickets',
      coverage: settings.ui_module_name_coverage || 'Cobertura',
      billing: settings.ui_module_name_billing || 'Facturacion',
      settings: settings.ui_module_name_settings || 'Configuracion',
      history: settings.ui_module_name_history || 'Historial',
      whatsapp: settings.ui_module_name_whatsapp || 'WhatsApp',
      email: settings.ui_module_name_email || 'Correo',
      stripe: settings.ui_module_name_stripe || 'Stripe'
    },
    externalSection: settings.ui_external_section_name || 'EXTERNOS'
  };

  res.locals.empresa = {
    nombre: settings.empresa_nombre || 'Movilbro',
    cif: settings.empresa_cif || '',
    direccion: settings.empresa_direccion || '',
    telefono: settings.empresa_telefono || '',
    email: settings.empresa_email || '',
    web: settings.empresa_web || ''
  };

  next();
}

module.exports = { loadSettings };
