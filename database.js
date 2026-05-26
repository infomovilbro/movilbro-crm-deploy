const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'movilbro.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nombre TEXT NOT NULL,
      email TEXT,
      rol TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      likes_customer_id TEXT,
      nombre TEXT NOT NULL,
      apellidos TEXT,
      dni_nif TEXT,
      email TEXT,
      telefono TEXT,
      telefono2 TEXT,
      direccion TEXT,
      ciudad TEXT DEFAULT 'Antequera',
      provincia TEXT DEFAULT 'Málaga',
      codigo_postal TEXT DEFAULT '29200',
      notas TEXT,
      tipo_cliente TEXT DEFAULT 'particular',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      likes_product_id TEXT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      precio REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      likes_order_id TEXT,
      estado TEXT DEFAULT 'pendiente',
      tipo TEXT NOT NULL,
      producto TEXT,
      detalles TEXT,
      fecha_orden DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      likes_subscription_id TEXT,
      linea TEXT,
      producto TEXT,
      estado TEXT DEFAULT 'activa',
      fecha_alta DATETIME,
      fecha_baja DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      concepto TEXT NOT NULL,
      importe REAL NOT NULL,
      fecha_emision TEXT,
      fecha_vencimiento TEXT,
      estado TEXT DEFAULT 'pendiente',
      stripe_payment_id TEXT,
      stripe_payment_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      likes_ticket_id TEXT,
      asunto TEXT NOT NULL,
      descripcion TEXT,
      estado TEXT DEFAULT 'abierto',
      prioridad TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      descripcion TEXT,
      client_id INTEGER,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- PANEL TIENDA tables (Movilbro Pro Web replication)
    CREATE TABLE IF NOT EXISTS tienda_agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      cliente_nombre TEXT NOT NULL,
      telefono TEXT,
      fecha DATE NOT NULL,
      hora TIME,
      tipo TEXT DEFAULT 'cita',
      motivo TEXT,
      estado TEXT DEFAULT 'pendiente',
      notas TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_prepago (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellidos TEXT,
      dni_nif TEXT,
      telefono TEXT,
      email TEXT,
      pin TEXT,
      puk TEXT,
      operador TEXT DEFAULT 'Movilbro',
      linea TEXT,
      iccid TEXT,
      estado TEXT DEFAULT 'pendiente_activar',
      fecha_activacion DATETIME,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATE NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('ingreso','gasto')),
      concepto TEXT NOT NULL,
      importe REAL NOT NULL,
      metodo_pago TEXT DEFAULT 'efectivo',
      categoria TEXT,
      descripcion TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_presupuestos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      cliente_nombre TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      lineas TEXT,
      total REAL NOT NULL,
      descuento REAL DEFAULT 0,
      estado TEXT DEFAULT 'pendiente',
      notas TEXT,
      valido_hasta DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT,
      cantidad INTEGER DEFAULT 0,
      precio_compra REAL DEFAULT 0,
      precio_venta REAL DEFAULT 0,
      proveedor TEXT,
      ubicacion TEXT,
      stock_minimo INTEGER DEFAULT 5,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_historial_dia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATE NOT NULL,
      total_ingresos REAL DEFAULT 0,
      total_gastos REAL DEFAULT 0,
      saldo_final REAL DEFAULT 0,
      num_ventas INTEGER DEFAULT 0,
      num_presupuestos INTEGER DEFAULT 0,
      notas TEXT,
      cerrado INTEGER DEFAULT 0,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_plantilla (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellidos TEXT,
      dni_nif TEXT,
      telefono TEXT,
      email TEXT,
      puesto TEXT,
      salario REAL,
      fecha_contratacion DATE,
      horario TEXT,
      activo INTEGER DEFAULT 1,
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      comision REAL DEFAULT 0,
      direccion TEXT,
      notas TEXT,
      activo INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributor_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      distributor_id INTEGER NOT NULL,
      client_nombre TEXT,
      producto TEXT,
      importe REAL DEFAULT 0,
      comision_calculada REAL DEFAULT 0,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
      notas TEXT,
      FOREIGN KEY (distributor_id) REFERENCES distributors(id)
    );

    CREATE TABLE IF NOT EXISTS tienda_cierres (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATE NOT NULL,
      ingresos_efectivo REAL DEFAULT 0,
      ingresos_tarjeta REAL DEFAULT 0,
      ingresos_transferencia REAL DEFAULT 0,
      total_ingresos REAL DEFAULT 0,
      gastos REAL DEFAULT 0,
      saldo REAL DEFAULT 0,
      num_operaciones INTEGER DEFAULT 0,
      observaciones TEXT,
      cerrado_por INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_notas_diarias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      nota TEXT,
      importe REAL DEFAULT 0,
      tipo TEXT DEFAULT 'nota',
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tienda_devoluciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER,
      producto_nombre TEXT,
      cantidad INTEGER DEFAULT 1,
      estado TEXT DEFAULT 'pendiente',
      motivo TEXT,
      fecha_devolucion DATE,
      fecha_resolucion DATE,
      notas TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_nombre TEXT,
      puntuacion INTEGER,
      comentario TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS instalaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      cliente_nombre TEXT,
      direccion TEXT,
      fecha_instalacion DATE,
      estado TEXT DEFAULT 'pendiente',
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ISP Gestion tables
    CREATE TABLE IF NOT EXISTS isp_workflow_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT, departamento TEXT DEFAULT 'General', icono TEXT DEFAULT 'fa-tasks', activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_workflows (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo_id INTEGER, client_id INTEGER, titulo TEXT NOT NULL, descripcion TEXT, estado TEXT DEFAULT 'pendiente', prioridad TEXT DEFAULT 'normal', departamento TEXT DEFAULT 'General', user_id INTEGER, fecha_prevista DATE, activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_workflow_tareas (id INTEGER PRIMARY KEY AUTOINCREMENT, workflow_id INTEGER NOT NULL, nombre TEXT NOT NULL, descripcion TEXT, completada INTEGER DEFAULT 0, orden INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_contratos (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, tipo TEXT NOT NULL, estado TEXT DEFAULT 'borrador', producto TEXT, tarifa TEXT, precio REAL DEFAULT 0, descuento REAL DEFAULT 0, permanencia_meses INTEGER DEFAULT 0, fecha_alta DATE, fecha_baja DATE, motivo_baja TEXT, linea TEXT, iccid TEXT, pin TEXT, puk TEXT, notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_portabilidades (id INTEGER PRIMARY KEY AUTOINCREMENT, contrato_id INTEGER, client_id INTEGER NOT NULL, linea TEXT NOT NULL, operador_origen TEXT, operador_destino TEXT DEFAULT 'Movilbro', estado TEXT DEFAULT 'pendiente', fecha_solicitud DATE, fecha_portabilidad DATE, referencia TEXT, notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_tarifas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, tipo TEXT NOT NULL, descripcion TEXT, precio REAL DEFAULT 0, precio_instalacion REAL DEFAULT 0, permanencia_meses INTEGER DEFAULT 0, velocidad TEXT, datos_gb TEXT, minutos TEXT, activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_descuentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, tipo TEXT DEFAULT 'porcentaje', valor REAL DEFAULT 0, meses_duracion INTEGER DEFAULT 0, aplica_a TEXT DEFAULT 'todos', activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_permanencias (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, meses INTEGER NOT NULL, penalizacion REAL DEFAULT 0, tipo_penalizacion TEXT DEFAULT 'fijo', activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_documentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, tipo TEXT DEFAULT 'documento', categoria TEXT, archivo TEXT, ruta TEXT, tamanio INTEGER DEFAULT 0, client_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_plantillas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, tipo TEXT NOT NULL, contenido TEXT, descripcion TEXT, activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_campanas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT, tipo TEXT DEFAULT 'email', fecha_inicio DATE, fecha_fin DATE, estado TEXT DEFAULT 'borrador', presupuesto REAL DEFAULT 0, activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_noticias (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, contenido TEXT, categoria TEXT DEFAULT 'general', importante INTEGER DEFAULT 0, activo INTEGER DEFAULT 1, user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descripcion TEXT, fecha_inicio DATETIME NOT NULL, fecha_fin DATETIME, tipo TEXT DEFAULT 'evento', client_id INTEGER, user_id INTEGER, color TEXT DEFAULT '#3c8dbc', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_nodos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, direccion TEXT, tipo TEXT DEFAULT 'nodo', latitud REAL, longitud REAL, estado TEXT DEFAULT 'activo', notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_equipos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, nodo_id INTEGER, tipo TEXT DEFAULT 'router', fabricante TEXT, modelo TEXT, numero_serie TEXT, mac TEXT, ip TEXT, cliente_id INTEGER, estado TEXT DEFAULT 'activo', notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_articulos (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT, nombre TEXT NOT NULL, fabricante TEXT, categoria TEXT, modelo TEXT, precio_compra REAL DEFAULT 0, precio_venta REAL DEFAULT 0, stock INTEGER DEFAULT 0, stock_minimo INTEGER DEFAULT 5, proveedor TEXT, notas TEXT, activo INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_caja (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha DATE NOT NULL, tipo TEXT NOT NULL, concepto TEXT NOT NULL, importe REAL NOT NULL, metodo_pago TEXT DEFAULT 'efectivo', categoria TEXT, descripcion TEXT, client_id INTEGER, user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_arqueos (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha DATE NOT NULL, ingresos_efectivo REAL DEFAULT 0, ingresos_tarjeta REAL DEFAULT 0, ingresos_transferencia REAL DEFAULT 0, total_ingresos REAL DEFAULT 0, gastos REAL DEFAULT 0, saldo REAL DEFAULT 0, observaciones TEXT, user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_incidencias (id INTEGER PRIMARY KEY AUTOINCREMENT, categoria TEXT DEFAULT 'general', tipo TEXT, client_id INTEGER, asunto TEXT NOT NULL, descripcion TEXT, estado TEXT DEFAULT 'abierta', prioridad TEXT DEFAULT 'normal', user_id INTEGER, solucion TEXT, fecha_resolucion DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_listados (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, tipo TEXT DEFAULT 'listado', categoria TEXT DEFAULT 'General', descripcion TEXT, sql_query TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_tareas (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, descripcion TEXT, prioridad TEXT DEFAULT 'normal', fecha_vencimiento DATE, user_id INTEGER, client_id INTEGER, completada INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_facturas (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_nombre TEXT, cliente_email TEXT, fiscal_id TEXT, periodo TEXT, fecha_emision DATE, fecha_vencimiento DATE, importe_base REAL DEFAULT 0, importe_cdrs REAL DEFAULT 0, importe_total REAL DEFAULT 0, metodo_pago TEXT DEFAULT 'stripe', estado TEXT DEFAULT 'pendiente', stripe_invoice_id TEXT, stripe_payment_intent TEXT, email_enviado INTEGER DEFAULT 0, pagada INTEGER DEFAULT 0, fecha_pago DATETIME, notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_facturas_lineas (id INTEGER PRIMARY KEY AUTOINCREMENT, factura_id INTEGER NOT NULL, concepto TEXT NOT NULL, tipo TEXT DEFAULT 'cuota', importe REAL NOT NULL, linea TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS isp_pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, factura_id INTEGER, client_id INTEGER, importe REAL NOT NULL, metodo TEXT NOT NULL, referencia TEXT, estado TEXT DEFAULT 'completado', fecha_pago DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  try { db.prepare("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tienda_presupuestos ADD COLUMN mano_obra REAL DEFAULT 0").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tienda_presupuestos ADD COLUMN pieza_costo REAL DEFAULT 0").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tienda_presupuestos ADD COLUMN tipo TEXT DEFAULT 'presupuesto'").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tienda_devoluciones ADD COLUMN resolucion TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tienda_plantilla ADD COLUMN user_id INTEGER").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tickets ADD COLUMN departamento TEXT DEFAULT 'General'").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE tickets ADD COLUMN user_id INTEGER").run(); } catch(e) {}

  // Migrate: ensure all users have an email (copy from username if empty)
  const usersSinEmail = db.prepare('SELECT id, username FROM users WHERE email IS NULL OR email = ?').all('');
  usersSinEmail.forEach(u => {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(u.username + '@movilbro.com', u.id);
  });

  // Eliminar usuario admin/admin si existe (seguridad)
  db.prepare("DELETE FROM users WHERE username = 'admin'").run();
  
  // Crear admin desde variables de entorno (para producción)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPass) {
    const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(adminEmail, adminEmail);
    if (!existingAdmin) {
      const hash = bcrypt.hashSync(adminPass, 10);
      const adminUser = adminEmail.split('@')[0];
      db.prepare('INSERT INTO users (username, password, nombre, email, rol) VALUES (?, ?, ?, ?, ?)').run(
        adminUser, hash, 'Administrador', adminEmail, 'admin'
      );
    }
  }

  // Ensure all users have email set
  db.prepare("UPDATE users SET email = username || '@movilbro.com' WHERE email IS NULL OR email = ''").run();

  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingsCount.count === 0) {
    const defaultSettings = {
      empresa_nombre: 'Movilbro',
      empresa_cif: 'B75559955',
      empresa_direccion: 'Calle Cantareros nº29, 29200 Antequera, Málaga',
      empresa_telefono: '694297048',
      empresa_email: 'info@movilbro.com',
      empresa_web: 'https://movilbro.com',
      likes_api_url: 'https://api.likestelecom.com',
      likes_client_id: '',
      likes_client_secret: '',
      likes_brand_id: ''
    };
    const insert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(defaultSettings)) {
      insert.run(key, value);
    }
  }

  // Auto-configurar Telegram desde variables de entorno
  if (process.env.TELEGRAM_BOT_TOKEN) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_bot_token', ?)").run(process.env.TELEGRAM_BOT_TOKEN);
  }
  if (process.env.TELEGRAM_CHAT_ID) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', ?)").run(process.env.TELEGRAM_CHAT_ID);
  }
}

module.exports = { db, initDatabase };
