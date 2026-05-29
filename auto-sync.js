const { db } = require('./database');
const LikesAPI = require('./likes-api');
const nube = require('./helpers/nube');
const { getNextNumeroFactura } = require('./facturacion_helper');
const fs = require('fs');
const path = require('path');

var syncing = false;
var syncProgress = { step: '', total: 0, current: 0, status: 'idle', lastSync: null, error: null };

function getProgress() { return Object.assign({}, syncProgress); }

// Sync solo facturas (rápido, sin CDRs) - para usar al arrancar
async function syncInvoicesOnly() {
  if (syncing) return { ok: false, error: 'Ya hay una sincronización en curso' };
  syncing = true;
  syncProgress = { step: 'Iniciando...', total: 0, current: 0, status: 'running', lastSync: null, error: null };

  try {
    var api = LikesAPI.getApiInstance();
    console.log('[AutoSync] Sincro rápida (solo facturas)...');

    var customers = await api.getCustomers();
    var customersArr = Array.isArray(customers) ? customers : [];
    syncProgress.total = customersArr.length;

    var allProducts = [];
    try { allProducts = await api.getProducts(); } catch(e) {}
    var productPriceMap = {};
    for (var ap of (Array.isArray(allProducts) ? allProducts : [])) {
      var pid = String(ap.productId || ap.id || '');
      if (pid) productPriceMap[pid] = parseFloat(ap.price || 0);
    }

    syncProgress.step = 'Obteniendo suscripciones...';
    var fiscalIds = customersArr.map(function(c) { return c.fiscalId; }).filter(Boolean);
    fiscalIds = fiscalIds.filter(function(v, i, a) { return a.indexOf(v) === i; });

    var allSubsData = [];
    for (var i = 0; i < fiscalIds.length; i += 20) {
      var batch = fiscalIds.slice(i, i + 20);
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

    syncProgress.step = 'Actualizando facturas...';
    var periodo = new Date().toISOString().split('T')[0].substring(0, 7);
    var fechaEmision = new Date().toISOString().split('T')[0];
    var upserted = 0, created = 0, errors = 0;

    for (var sd of allSubsData) {
      try {
        var fiscalId = sd.fiscalId;
        var subs = sd.subs;
        if (!subs || subs.length === 0) continue;
        var c = customersArr.find(function(x) { return x.fiscalId === fiscalId; });
        if (!c) continue;
        var nombre = c.name + ' ' + (c.firstSurname || '');
        var email = c.email || '';

        var dirInfo = db.prepare('SELECT direccion, ciudad, provincia, codigo_postal FROM clients WHERE dni_nif=? OR likes_customer_id=?').get(fiscalId, fiscalId);
        var clienteDireccion = (dirInfo && dirInfo.direccion) || '';
        var clientePoblacion = (dirInfo && dirInfo.ciudad) || '';
        var clienteProvincia = (dirInfo && dirInfo.provincia) || '';
        var codigoPostal = (dirInfo && dirInfo.codigo_postal) || '';

        var importeBase = 0, productos = [], seenLines = {};
        for (var s of subs) {
          var subProducts = extractProducts(s);
          for (var p of subProducts) {
            var precio = parseFloat(p.finalPrice || p.price || p.productPrice || p.recurringPrice || 0);
            if (!precio) precio = productPriceMap[String(p.productId || p.id || '')] || 0;
            if (precio > 0 && !seenLines[p.fixedNumber || p.productId || s.subscriptionId]) {
              seenLines[p.fixedNumber || p.productId || s.subscriptionId] = true;
              importeBase += precio;
              productos.push({ nombre: p.productName || s.productName || '', precio: precio, linea: p.fixedNumber || '' });
            }
          }
        }
        if (importeBase === 0) continue;
        var importeTotal = Math.round(importeBase * 100) / 100;
        if (importeTotal <= 0) continue;

        var fechaVenc = new Date(); fechaVenc.setDate(fechaVenc.getDate() + 28);
        var existing = db.prepare('SELECT id FROM isp_facturas WHERE fiscal_id=? AND periodo=?').get(fiscalId, periodo);
        if (existing) {
          db.prepare('UPDATE isp_facturas SET cliente_nombre=?, cliente_email=?, importe_base=?, importe_total=?, fecha_emision=?, fecha_vencimiento=?, cliente_direccion=?, cliente_poblacion=?, cliente_provincia=?, codigo_postal=? WHERE id=?').run(nombre, email, importeBase, importeTotal, fechaEmision, fechaVenc.toISOString().split('T')[0], clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal, existing.id);
          db.prepare('DELETE FROM isp_facturas_lineas WHERE factura_id=?').run(existing.id);
          upserted++;
          for (var prod of productos) {
            db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(existing.id, prod.nombre, 'cuota', prod.precio, prod.linea);
          }
        } else {
          var numbering = getNextNumeroFactura('F');
          db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago, serie, numero_factura, cliente_direccion, cliente_poblacion, cliente_provincia, codigo_postal) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?)').run(nombre, email, fiscalId, periodo, fechaEmision, fechaVenc.toISOString().split('T')[0], importeBase, importeTotal, 'stripe', numbering.serie, numbering.numero, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal);
          var fid = db.prepare('SELECT last_insert_rowid() as id').get().id;
          created++;
          for (var prod of productos) {
            db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(fid, prod.nombre, 'cuota', prod.precio, prod.linea);
          }
        }
        syncProgress.current = upserted + created;
      } catch(e) { errors++; }
    }

    // Clean orphan invoices (customers no longer active)
    try {
      var fids = allSubsData.filter(function(sd) { return sd.subs.length > 0; }).map(function(sd) { return sd.fiscalId; });
      if (fids.length > 0) {
        var orphans = db.prepare('SELECT id FROM isp_facturas WHERE periodo=? AND fiscal_id NOT IN (' + fids.map(function() { return '?'; }).join(',') + ')').all.apply(null, [periodo].concat(fids));
        for (var o of orphans) {
          db.prepare('DELETE FROM isp_facturas_lineas WHERE factura_id=?').run(o.id);
          db.prepare('DELETE FROM isp_facturas WHERE id=?').run(o.id);
        }
      }
    } catch(e) {}

    syncProgress.status = 'completed';
    syncProgress.lastSync = new Date().toISOString();
    syncProgress.step = 'Completado';
    syncing = false;
    return { ok: true, upserted: upserted, created: created, errors: errors };

  } catch(e) {
    syncProgress.status = 'error'; syncProgress.error = e.message;
    syncing = false;
    return { ok: false, error: e.message };
  }
}

async function runSync() {
  if (syncing) return { ok: false, error: 'Ya hay una sincronización en curso' };
  syncing = true;
  syncProgress = { step: 'Iniciando sincronización...', total: 0, current: 0, status: 'running', lastSync: null, error: null };

  try {
    var api = LikesAPI.getApiInstance();
    console.log('[AutoSync] Iniciando sincronización (upsert)...');

    // Step 1: Fetch customers
    syncProgress.step = 'Obteniendo clientes desde API...';
    var customers = await api.getCustomers();
    var customersArr = Array.isArray(customers) ? customers : [];
    console.log('[AutoSync] Clientes:', customersArr.length);
    syncProgress.total = customersArr.length;

    // Step 2: Product pricing map
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
    // Deduplicate fiscalIds
    fiscalIds = fiscalIds.filter(function(v, i, a) { return a.indexOf(v) === i; });
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
    console.log('[AutoSync] Suscripciones para', allSubsData.length, 'clientes');

    // Step 4: Fetch CDRs from API (solo en cron horario, con timeout por línea)
    syncProgress.step = 'Obteniendo CDRs desde API...';
    var cdrsFetched = 0;
    try {
      var allLines = [];
      for (var sd of allSubsData) {
        for (var s of sd.subs) {
          var subProducts = extractProducts(s);
          for (var p of subProducts) {
            var lineNum = p.fixedNumber || p.lineNumber || '';
            if (lineNum && allLines.indexOf(lineNum) === -1) allLines.push(lineNum);
          }
        }
      }
      console.log('[AutoSync] Líneas para CDRs:', allLines.length);
      var lineBatchSize = 3;
      for (var li = 0; li < allLines.length; li += lineBatchSize) {
        var lineBatch = allLines.slice(li, li + lineBatchSize);
        var lineResults = await Promise.allSettled(lineBatch.map(function(ln) {
          return api.getLineCDRs(ln).then(function(d) { return { line: ln, data: d }; }).catch(function() { return { line: ln, data: null }; });
        }));
        for (var lr of lineResults) {
          if (lr.status !== 'fulfilled' || !lr.value || !lr.value.data) continue;
          var cdrRaw = lr.value.data;
          var cdrItems = Array.isArray(cdrRaw) ? cdrRaw : ((cdrRaw && (cdrRaw.data || cdrRaw.cdrs || cdrRaw.records)) || []);
          if (!Array.isArray(cdrItems)) cdrItems = [];
          var linea = lr.value.line;
          if (!linea) continue;
          var lineFiscalId = '';
          for (var sd2 of allSubsData) {
            for (var s2 of sd2.subs) {
              var sps = extractProducts(s2);
              for (var p2 of sps) {
                if (p2.fixedNumber === linea || p2.lineNumber === linea) { lineFiscalId = sd2.fiscalId; break; }
              }
              if (lineFiscalId) break;
            }
            if (lineFiscalId) break;
          }
          for (var ci of cdrItems) {
            if (!ci) continue;
            try {
              var concepto = String(ci.concept || ci.concepto || ci.description || 'CDR').substring(0, 255);
              var tipo = String(ci.type || ci.tipo || 'exceso').substring(0, 50);
              var importe = parseFloat(ci.amount || ci.importe || ci.price || 0);
              var unidades = parseFloat(ci.units || ci.unidades || ci.quantity || 0);
              var cdrPeriodo = String(ci.period || ci.periodo || periodo).substring(0, 10);
              if (!linea || !concepto) continue;
              var existingCdr = db.prepare('SELECT id FROM isp_cdrs WHERE linea=? AND concepto=? AND importe=? AND periodo=?').get(linea, concepto, importe, cdrPeriodo);
              if (!existingCdr) {
                db.prepare('INSERT INTO isp_cdrs (fiscal_id, linea, concepto, tipo, importe, unidades, periodo) VALUES (?,?,?,?,?,?,?)').run(lineFiscalId || '', linea, concepto, tipo, importe, unidades, cdrPeriodo);
                cdrsFetched++;
              }
            } catch(e2) { /* ignorar error CDR individual */ }
          }
        }
      }
      console.log('[AutoSync] CDRs obtenidos:', cdrsFetched);
    } catch(e) { console.error('[AutoSync] Error CDRs:', e.message); }

    // Step 5: UPSERT invoices
    syncProgress.step = 'Actualizando facturas (upsert)...';
    var periodo = new Date().toISOString().split('T')[0].substring(0, 7);
    var fechaEmision = new Date().toISOString().split('T')[0];
    var upserted = 0, created = 0, errors = 0;

    for (var sd of allSubsData) {
      try {
        var fiscalId = sd.fiscalId;
        var subs = sd.subs;
        if (!subs || subs.length === 0) continue;

        var c = customersArr.find(function(x) { return x.fiscalId === fiscalId; });
        if (!c) continue;
        var nombre = c.name + ' ' + (c.firstSurname || '');
        var email = c.email || '';

        var dirInfo = db.prepare('SELECT direccion, ciudad, provincia, codigo_postal FROM clients WHERE dni_nif=? OR likes_customer_id=?').get(fiscalId, fiscalId);
        var clienteDireccion = (dirInfo && dirInfo.direccion) || '';
        var clientePoblacion = (dirInfo && dirInfo.ciudad) || '';
        var clienteProvincia = (dirInfo && dirInfo.provincia) || '';
        var codigoPostal = (dirInfo && dirInfo.codigo_postal) || '';

        var importeBase = 0;
        var productos = [];
        var seenLines = {};

        for (var s of subs) {
          var subProducts = extractProducts(s);
          for (var p of subProducts) {
            var precio = parseFloat(p.finalPrice || p.price || p.productPrice || p.recurringPrice || 0);
            if (!precio) precio = productPriceMap[String(p.productId || p.id || '')] || 0;
            if (precio > 0) {
              importeBase += precio;
              var lineKey = p.fixedNumber || p.productId || s.subscriptionId || Math.random();
              if (!seenLines[lineKey]) {
                seenLines[lineKey] = true;
                productos.push({ nombre: p.productName || s.productName || '', precio: precio, linea: p.fixedNumber || '' });
              }
            }
          }
        }
        if (importeBase === 0) continue;

        var importeTotal = Math.round(importeBase * 100) / 100;
        if (importeTotal <= 0) continue;

        var fechaVenc = new Date();
        fechaVenc.setDate(fechaVenc.getDate() + 28);
        var fechaVencStr = fechaVenc.toISOString().split('T')[0];

        // CHECK if invoice already exists for this fiscalId + periodo
        var existing = db.prepare('SELECT id, serie, numero_factura FROM isp_facturas WHERE fiscal_id=? AND periodo=?').get(fiscalId, periodo);

        var facturaId;
        if (existing) {
          // UPDATE existing invoice
          db.prepare('UPDATE isp_facturas SET cliente_nombre=?, cliente_email=?, importe_base=?, importe_total=?, fecha_emision=?, fecha_vencimiento=?, cliente_direccion=?, cliente_poblacion=?, cliente_provincia=?, codigo_postal=? WHERE id=?').run(nombre, email, importeBase, importeTotal, fechaEmision, fechaVencStr, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal, existing.id);
          facturaId = existing.id;
          // Delete old line items and re-insert
          db.prepare('DELETE FROM isp_facturas_lineas WHERE factura_id=?').run(facturaId);
          upserted++;
        } else {
          // CREATE new invoice
          var numbering = getNextNumeroFactura('F');
          db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago, serie, numero_factura, cliente_direccion, cliente_poblacion, cliente_provincia, codigo_postal) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?)').run(nombre, email, fiscalId, periodo, fechaEmision, fechaVencStr, importeBase, importeTotal, 'stripe', numbering.serie, numbering.numero, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal);
          facturaId = db.prepare('SELECT last_insert_rowid() as id').get().id;
          created++;
        }

        // Insert line items
        for (var prod of productos) {
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, prod.nombre, 'cuota', prod.precio, prod.linea);
        }

        syncProgress.current = upserted + created;
      } catch(e) { errors++; }
    }

    // Step 5: Remove orphan invoices (customer no longer has active subs)
    try {
      var allFiscalIds = allSubsData.filter(function(sd) { return sd.subs.length > 0; }).map(function(sd) { return sd.fiscalId; });
      if (allFiscalIds.length > 0) {
        var invoicesToRemove = db.prepare('SELECT id, fiscal_id FROM isp_facturas WHERE periodo=? AND fiscal_id NOT IN (' + allFiscalIds.map(function() { return '?'; }).join(',') + ')').all.apply(null, allFiscalIds);
        for (var ir of invoicesToRemove) {
          db.prepare('DELETE FROM isp_facturas_lineas WHERE factura_id=?').run(ir.id);
          db.prepare('DELETE FROM isp_facturas WHERE id=?').run(ir.id);
        }
        if (invoicesToRemove.length > 0) console.log('[AutoSync] Eliminadas', invoicesToRemove.length, 'facturas huérfanas');
      }
    } catch(e) { console.error('[AutoSync] Error limpiando huérfanas:', e.message); }

    // Step 7: Clean orphan CDRs
    syncProgress.step = 'Limpiando CDRs huérfanos...';
    try {
      db.prepare('DELETE FROM isp_cdrs WHERE factura_id IS NOT NULL AND factura_id NOT IN (SELECT id FROM isp_facturas)').run();
    } catch(e) {}

    console.log('[AutoSync] Resultado:', { upserted, created, errors, cdrs: cdrsFetched });

    // Step 7: Generate PDFs for current month
    syncProgress.step = 'Generando PDFs...';
    try {
      var facturas = db.prepare('SELECT * FROM isp_facturas WHERE periodo=? ORDER BY id ASC').all(periodo);
      for (var f of facturas) {
        try {
          var numFactura = (f.serie || 'F') + '-' + String(f.numero_factura || f.id).padStart(5, '0');
          var nombreArchivo = 'Factura-' + numFactura + '.pdf';
          var paths = nube.getYearMonthPaths(f.periodo);
          if (fs.existsSync(path.join(paths.dir, nombreArchivo))) continue; // Skip if PDF exists
          var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(f.id);
          // Group CDR lines by (linea, tipo)
          var lineas = [], cdrG = {};
          lineasRaw.forEach(function(l) {
            if (l.tipo === 'cdr') {
              var k = (l.linea||'')+'|'+(l.tipo||'exceso');
              if (!cdrG[k]) cdrG[k] = { linea: l.linea, tipo: 'cdr', total: 0, concepto: l.concepto };
              cdrG[k].total += parseFloat(l.importe||0);
            } else { lineas.push(l); }
          });
          for (var gk in cdrG) { var g=cdrG[gk]; lineas.push({ concepto: g.concepto, tipo: 'cdr', importe: Math.round(g.total*100)/100, linea: g.linea }); }
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
    } catch(e) { console.error('[AutoSync] Error PDFs:', e.message); }

    syncProgress.status = 'completed';
    syncProgress.lastSync = new Date().toISOString();
    syncProgress.step = 'Completado';
    console.log('[AutoSync] Sincronización completada');
    return { ok: true, upserted: upserted, created: created, errors: errors, cdrs: cdrsFetched };

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

module.exports = { runSync, syncInvoicesOnly, getProgress };
