const { db } = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS isp_facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_nombre TEXT, cliente_email TEXT, fiscal_id TEXT,
    periodo TEXT, fecha_emision DATE, fecha_vencimiento DATE,
    importe_base REAL DEFAULT 0, importe_cdrs REAL DEFAULT 0, importe_total REAL DEFAULT 0,
    metodo_pago TEXT DEFAULT 'stripe', estado TEXT DEFAULT 'pendiente',
    stripe_invoice_id TEXT, stripe_payment_intent TEXT,
    email_enviado INTEGER DEFAULT 0, pagada INTEGER DEFAULT 0,
    fecha_pago DATETIME, notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS isp_facturas_lineas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL, concepto TEXT NOT NULL,
    tipo TEXT DEFAULT 'cuota', importe REAL NOT NULL,
    linea TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS isp_pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER, client_id INTEGER, importe REAL NOT NULL,
    metodo TEXT NOT NULL, referencia TEXT, estado TEXT DEFAULT 'completado',
    fecha_pago DATE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try { db.prepare("ALTER TABLE clients ADD COLUMN stripe_customer_id TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE clients ADD COLUMN iban TEXT DEFAULT ''").run(); } catch(e) {}
try { db.prepare("ALTER TABLE clients ADD COLUMN metodo_pago TEXT DEFAULT 'stripe'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE clients ADD COLUMN pago_activo INTEGER DEFAULT 1").run(); } catch(e) {}

console.log('Billing tables and columns created successfully');
