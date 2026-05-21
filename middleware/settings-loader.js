const { db } = require('../database');

function loadSettings(req, res, next) {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);

  res.locals.ui = {
    sidebarBg: settings.ui_sidebar_bg || '#1a1d23',
    sidebarActive: settings.ui_sidebar_active || '#0d6efd',
    primaryColor: settings.ui_primary_color || '#0d6efd',
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
