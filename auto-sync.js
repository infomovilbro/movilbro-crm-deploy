const { db } = require('./database');
const LikesAPI = require('./likes-api');
const nube = require('./helpers/nube');
const { getNextNumeroFactura } = require('./facturacion_helper');
const fs = require('fs');
const path = require('path');

var syncing = false;
var syncProgress = { step: '', total: 0, current: 0, status: 'idle', lastSync: null, error: null };

function getProgress() { return Object.assign({}, syncProgress); }

async function runSync() {
  if (syncing) return { ok: false, error: 'Ya hay una sincronización en curso' };
  syncing = true;
  syncProgress = { step: 'Iniciando sincronización...', total: 0, current: 0, status: 'running', lastSync: null, error: null };

  try {
    var api = LikesAPI.getApiInstance();
    console.log('[AutoSync] Iniciando sincronización...');

    // Step 1: Fetch customers
    syncProgress.step = 'Obteniendo clientes desde API...';
    var customers = await api.getCustomers();
    var customersArr = Array.isArray(customers) ? customers : [];
    console.log('[AutoSync] Clientes obtenidos:', customersArr.length);
    syncProgress.total = customersArr.length;

    // Step 2: Fetch all products for pricing
    syncProgress.step = 'Obteniendo productos...';
    var allProducts = [];
    try { allProducts = await api.getProducts(); } catch(e) {}
    var productPriceMap = {};
    for (var ap of (Array.isArray(allProducts) ? allProducts : [])) {
      var pid = String(ap.productId || ap.id || '');
      if (pid) productPriceMap[pid] = parseFloat(ap.price || 0);
    }

    // Step 3: Fetch subscriptions for all customers
    syncProgress.step = 'Obteniendo suscripciones...';
    var fiscalIds = customersArr.map(function(c) { return c.fiscalId; }).filter(Boolean);
    var batchSize = 20;
    var allSubsData = [];

    for (var i = 0; i < fiscalIds.length; i += batchSize) {
      var batch = fiscalIds.slice(i, i + batchSize);
      var results = await Promise.allSettled(batch.map(function(fid) {
        return api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=264');
      }));
      results.forEach(function(r, idx) {
        if (r.status === 'fulfilled') {
          var data = r.value;
          var items = Array.isArray(data) ? data : (data.data || data.subscriptions || []);
          allSubsData.push({ fiscalId: batch[idx], subs: items });
        }
      });
    }
    console.log('[AutoSync] Suscripciones obtenidas para', allSubsData.length, 'clientes');

    // Step 4: Clear old invoice/CDR data
    syncProgress.step = 'Limpiando datos antiguos...';
    try { db.prepare('DELETE FROM isp_facturas_lineas').run(); } catch(e) {}
    try { db.prepare('DELETE FROM isp_facturas').run(); } catch(e) {}
    try { db.prepare('DELETE FROM isp_cdrs').run(); } catch(e) {}
    try { db.prepare('DELETE FROM isp_llamadas').run(); } catch(e) {}
    console.log('[AutoSync] Datos antiguos eliminados');

    // Step 5: Generate invoices
    syncProgress.step = 'Generando facturas...';
    var periodo = new Date().toISOString().split('T')[0].substring(0, 7);
    var fechaEmision = new Date().toISOString().split('T')[0];
    var invoicesGenerated = 0;
    var errors = 0;

    for (var sd of allSubsData) {
      try {
        var fiscalId = sd.fiscalId;
        var subs = sd.subs;
        if (subs.length === 0) continue;

        var c = customersArr.find(function(x) { return x.fiscalId === fiscalId; });
        if (!c) continue;
        var nombre = c.name + ' ' + (c.firstSurname || '');
        var email = c.email || '';

        var importeBase = 0;
        var productos = [];
        for (var s of subs) {
          var subProducts = extractProducts(s);
          for (var p of subProducts) {
            var precio = parseFloat(p.finalPrice || p.price || p.productPrice || p.recurringPrice || 0);
            if (!precio) precio = productPriceMap[String(p.productId || p.id || '')] || 0;
            if (precio > 0) {
              importeBase += precio;
              productos.push({ nombre: p.productName || s.productName || '', precio: precio, linea: p.fixedNumber || '' });
            }
          }
        }
        if (importeBase === 0) continue;

        var importeTotal = Math.round(importeBase * 100) / 100;
        if (importeTotal <= 0) continue;

        var fechaVenc = new Date();
        fechaVenc.setDate(fechaVenc.getDate() + 28);
        var fechaVencStr = fechaVenc.toISOString().split('T')[0];

        var numbering = getNextNumeroFactura('F');
        db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago, serie, numero_factura) VALUES (?,?,?,?,?,?,?,0,?,?,?,?)').run(nombre, email, fiscalId, periodo, fechaEmision, fechaVencStr, importeBase, importeTotal, 'stripe', numbering.serie, numbering.numero);
        var facturaId = db.prepare('SELECT last_insert_rowid() as id').get().id;

        for (var prod of productos) {
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, prod.nombre, 'cuota', prod.precio, prod.linea);
        }
        invoicesGenerated++;
        syncProgress.current = invoicesGenerated;
      } catch(e) { errors++; }
    }

    console.log('[AutoSync] Facturas generadas:', invoicesGenerated, 'Errores:', errors);

    // Step 6: Clean nube PDFs (remove F-format, keep Ventas-format)
    syncProgress.step = 'Limpiando archivos temporales en nube...';
    try {
      var nubeDir = path.join(__dirname, 'nube');
      if (fs.existsSync(nubeDir)) {
        var years = fs.readdirSync(nubeDir).filter(function(y) { return /^\d{4}$/.test(y); });
        for (var year of years) {
          var yearDir = path.join(nubeDir, year);
          var months = fs.readdirSync(yearDir).filter(function(m) { return fs.statSync(path.join(yearDir, m)).isDirectory(); });
          for (var month of months) {
            var monthDir = path.join(yearDir, month);
            var files = fs.readdirSync(monthDir).filter(function(f) { return f.startsWith('Factura-F-'); });
            for (var file of files) {
              try { fs.unlinkSync(path.join(monthDir, file)); } catch(e2) {}
            }
          }
        }
      }
    } catch(e) { console.error('[AutoSync] Error limpiando nube:', e.message); }

    // Step 7: Generate PDFs for new invoices
    syncProgress.step = 'Generando PDFs de facturas...';
    try {
      var facturas = db.prepare('SELECT * FROM isp_facturas WHERE periodo=? ORDER BY id ASC').all(periodo);
      for (var f of facturas) {
        try {
          var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(f.id);
          var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(f.id);
          var llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(f.id);
          var history = [];
          if (f.fiscal_id) {
            var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(f.fiscal_id, f.id);
            history = histRows.reverse();
          }
          await nube.procesarFactura(f, lineas, cdrsDetalle, llamadas, history);
        } catch(e2) {}
      }
    } catch(e) { console.error('[AutoSync] Error generando PDFs:', e.message); }

    syncProgress.status = 'completed';
    syncProgress.lastSync = new Date().toISOString();
    syncProgress.step = 'Completado';
    console.log('[AutoSync] Sincronización completada correctamente');
    return { ok: true, invoices: invoicesGenerated, errors: errors };

  } catch(e) {
    syncProgress.status = 'error';
    syncProgress.error = e.message;
    console.error('[AutoSync] Error:', e.message);
    return { ok: false, error: e.message };
  } finally {
    syncing = false;
  }
}

function extractProducts(sub) {
  var prods = sub.products || (sub.productName ? [sub] : []);
  return Array.isArray(prods) ? prods : [];
}

module.exports = { runSync, getProgress };
