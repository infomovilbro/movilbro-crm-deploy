const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

// Dashboard de facturación
router.get('/', async (req, res) => {
  try {
    var pendientes = 0, pagadas = 0, vencidas = 0, totalMes = 0;
    try {
      pendientes = db.prepare("SELECT COUNT(*) as c FROM isp_facturas WHERE estado='pendiente'").get().c;
      pagadas = db.prepare("SELECT COUNT(*) as c FROM isp_facturas WHERE pagada=1").get().c;
      vencidas = db.prepare("SELECT estado='pendiente' AND fecha_vencimiento < date('now')").get()?.c || 0;
      var r = db.prepare("SELECT COALESCE(SUM(importe_total),0) as t FROM isp_facturas WHERE strftime('%Y-%m',fecha_emision)=strftime('%Y-%m','now')").get();
      totalMes = r.t;
    } catch(e) {}
    
    var facturas = [];
    try { facturas = db.prepare('SELECT * FROM isp_facturas ORDER BY created_at DESC LIMIT 20').all(); } catch(e) {}
    
    res.render('isp/facturacion/index', {
      title: 'Facturación',
      stats: { pendientes, pagadas, vencidas, totalMes },
      facturas
    });
  } catch(e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

// Generar facturas del mes (masivo - optimizado)
router.post('/generar', async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    var allProducts = [];
    try { allProducts = await api.getProducts(); } catch(e) {}
    
    // Build product price map once
    var productPriceMap = {};
    for (var ap of (Array.isArray(allProducts) ? allProducts : [])) {
      var pid = String(ap.productId || ap.id || '');
      if (pid) productPriceMap[pid] = parseFloat(ap.price || 0);
    }
    
    var cuentasGeneradas = 0, errores = 0;
    var periodo = new Date().toISOString().split('T')[0].substring(0, 7);
    var fechaEmision = new Date().toISOString().split('T')[0];

    // Auto-descargar CDRs desde Likes Telecom (si hay Edge abierto)
    try {
      var cdrModule = require('./cdr-download');
      var cdrResult = await cdrModule.downloadLatestCDRs();
      if (cdrResult.ok) {
        var imp = cdrModule.importCDRs(cdrResult.data, periodo);
        console.log('CDRs descargados e importados:', imp);
      }
    } catch(e) { console.error('CDR download error:', e.message); }
    
    // Batch: Get subscriptions for ALL customers in parallel
    var fiscalIds = (Array.isArray(customers) ? customers : []).map(function(c) { return c.fiscalId; }).filter(Boolean);
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
    
    // Process each customer
    for (var sd of allSubsData) {
      try {
        var fiscalId = sd.fiscalId;
        var subs = sd.subs;
        if (subs.length === 0) continue;
        
        var c = (Array.isArray(customers) ? customers : []).find(function(x) { return x.fiscalId === fiscalId; });
        if (!c) continue;
        var nombre = c.name + ' ' + (c.firstSurname || '');
        var email = c.email || '';
        
        // Calculate base price
        var importeBase = 0;
        var productos = [];
        for (var s of subs) {
          var prods = s.products || (s.productName ? [s] : []);
          for (var p of (Array.isArray(prods) ? prods : [])) {
            var precio = parseFloat(p.finalPrice || p.price || p.productPrice || p.recurringPrice || 0);
            if (!precio) precio = productPriceMap[String(p.productId || p.id || '')] || 0;
            if (precio > 0) {
              importeBase += precio;
              productos.push({ nombre: p.productName || s.productName || '', precio: precio, linea: p.fixedNumber || '' });
            }
          }
        }
        if (importeBase === 0) continue;
        
        // Check payment status
        var metodoPago = 'stripe';
        var pagoActivo = 1;
        var mp = db.prepare("SELECT value FROM settings WHERE key='metodo_pago_" + fiscalId + "'").get();
        if (mp) metodoPago = mp.value;
        var pa = db.prepare("SELECT value FROM settings WHERE key='pago_activo_" + fiscalId + "'").get();
        if (pa) pagoActivo = parseInt(pa.value);
        if (!pagoActivo) continue;
        
        // Include CDRs (excesos) for this customer's period
        var importeCdrs = 0;
        var cdrsPeriodo = db.prepare('SELECT * FROM isp_cdrs WHERE fiscal_id=? AND (periodo=? OR periodo IS NULL OR periodo=\'\') AND factura_id IS NULL').all(fiscalId, periodo);
        for (var cdr of cdrsPeriodo) {
          importeCdrs += parseFloat(cdr.importe || 0);
        }
        var importeTotal = Math.round((importeBase + importeCdrs) * 100) / 100;
        if (importeTotal <= 0) continue;
        
        // Create local invoice
        var inv = db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, importe_base, importe_cdrs, importe_total, metodo_pago) VALUES (?,?,?,?,?,?,?,?,?)').run(nombre, email, fiscalId, periodo, fechaEmision, importeBase, importeCdrs, importeTotal, metodoPago);
        var facturaId = inv.lastInsertRowid;
        for (var prod of productos) {
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, prod.nombre, 'cuota', prod.precio, prod.linea);
        }
        // Add CDR lines and mark them as used
        for (var cdr of cdrsPeriodo) {
          var cdrDesc = cdr.concepto + (cdr.linea ? ' (' + cdr.linea + ')' : '') + (cdr.unidades ? ' - ' + cdr.unidades + ' ' + (cdr.tipo === 'exceso' ? 'GB' : 'min') : '');
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, cdrDesc, 'cdr', cdr.importe, cdr.linea);
          db.prepare('UPDATE isp_cdrs SET factura_id=? WHERE id=?').run(facturaId, cdr.id);
        }
        cuentasGeneradas++;
        
      } catch(e) { errores++; }
    }
    
    res.json({ ok: true, generadas: cuentasGeneradas, errores: errores, periodo: periodo });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Listar todas las facturas
router.get('/facturas', (req, res) => {
  try {
    var facturas = db.prepare('SELECT * FROM isp_facturas ORDER BY fecha_emision DESC, created_at DESC').all();
    res.render('isp/facturacion/facturas', { title: 'Facturas', facturas });
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// Detalle de factura
router.get('/facturas/:id', (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).send('No encontrada');
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    res.render('isp/facturacion/detalle', { title: 'Factura #' + factura.id, factura, lineas });
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// Sincronizar factura con Stripe
router.post('/facturas/:id/stripe', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.json({ ok: false, error: 'No encontrada' });
    if (factura.stripe_invoice_id) return res.json({ ok: false, error: 'Ya sincronizada con Stripe' });
    
    var stripeKey = db.prepare("SELECT value FROM settings WHERE key='stripe_secret_key'").get()?.value;
    if (!stripeKey) return res.json({ ok: false, error: 'Stripe no configurado' });
    
    var stripe = require('stripe')(stripeKey);
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    
    // Find or create Stripe customer
    var sid = db.prepare("SELECT value FROM settings WHERE key='stripe_customer_" + factura.fiscal_id + "'").get();
    var scid = sid ? sid.value : null;
    if (!scid) {
      var cust = await stripe.customers.create({ email: factura.cliente_email || 'noemail@movilbro.com', name: factura.cliente_nombre, metadata: { fiscalId: factura.fiscal_id } });
      scid = cust.id;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('stripe_customer_' + factura.fiscal_id, scid);
    }
    
    var si = await stripe.invoices.create({ customer: scid, collection_method: 'charge_automatically', auto_advance: false, description: 'Factura ' + factura.periodo + ' - ' + factura.cliente_nombre, metadata: { periodo: factura.periodo, fiscalId: factura.fiscal_id } });
    for (var l of lineas) {
      await stripe.invoiceItems.create({ customer: scid, amount: Math.round(parseFloat(l.importe) * 100), currency: 'eur', description: l.concepto + (l.linea ? ' (' + l.linea + ')' : ''), invoice: si.id });
    }
    var fin = await stripe.invoices.finalizeInvoice(si.id);
    db.prepare('UPDATE isp_facturas SET stripe_invoice_id=?, stripe_payment_intent=? WHERE id=?').run(fin.id, fin.payment_intent || '', factura.id);
    
    res.json({ ok: true, stripe_invoice_id: fin.id });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Enviar factura por email
router.post('/facturas/:id/enviar', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).json({ ok: false, error: 'No encontrada' });
    
    // Get SMTP config
    var smtpHost = db.prepare("SELECT value FROM settings WHERE key='smtp_host'").get()?.value;
    var smtpPort = db.prepare("SELECT value FROM settings WHERE key='smtp_port'").get()?.value;
    var smtpUser = db.prepare("SELECT value FROM settings WHERE key='smtp_user'").get()?.value;
    var smtpPass = db.prepare("SELECT value FROM settings WHERE key='smtp_pass'").get()?.value;
    var emailFrom = db.prepare("SELECT value FROM settings WHERE key='email_from'").get()?.value;
    
    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.json({ ok: false, error: 'SMTP no configurado. Ve a Configuración > Email' });
    }
    
    // Build email HTML
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    var lineasHtml = lineas.map(function(l) {
      return '<tr><td>' + l.concepto + '</td><td>' + (l.linea || '-') + '</td><td>' + l.tipo + '</td><td class=\"text-end\">' + parseFloat(l.importe).toFixed(2) + '€</td></tr>';
    }).join('');
    
    var html = '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">' +
      '<h2 style="color:#0050A1;">Factura #' + factura.id + '</h2>' +
      '<p><strong>Cliente:</strong> ' + factura.cliente_nombre + '</p>' +
      '<p><strong>Periodo:</strong> ' + factura.periodo + '</p>' +
      '<p><strong>Fecha emisión:</strong> ' + factura.fecha_emision + '</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:20px 0;">' +
      '<tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">Concepto</th><th style="padding:8px;text-align:left;">Línea</th><th style="padding:8px;text-align:left;">Tipo</th><th style="padding:8px;text-align:right;">Importe</th></tr>' +
      lineasHtml +
      '<tr style="font-weight:bold;border-top:2px solid #333;"><td colspan="3" style="padding:8px;text-align:right;">Total:</td><td style="padding:8px;text-align:right;">' + parseFloat(factura.importe_total).toFixed(2) + '€</td></tr>' +
      '</table>' +
      '<p style="color:#666;font-size:12px;">Este email se ha generado automáticamente. No respondas a este mensaje.</p>' +
      '</div>';
    
    var nodemailer = require('nodemailer');
    var transporter = nodemailer.createTransport({
      host: smtpHost, port: parseInt(smtpPort || 587),
      secure: parseInt(smtpPort || 587) === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });
    
    await transporter.sendMail({
      from: emailFrom || smtpUser, to: factura.cliente_email,
      subject: 'Factura #' + factura.id + ' - Movilbro',
      html: html
    });
    
    db.prepare('UPDATE isp_facturas SET email_enviado=1 WHERE id=?').run(factura.id);
    res.json({ ok: true });
  } catch(e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Marcar factura como pagada
router.post('/facturas/:id/pagar', (req, res) => {
  try {
    db.prepare('UPDATE isp_facturas SET pagada=1, estado="pagada", fecha_pago=CURRENT_TIMESTAMP WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Gestión de métodos de pago por cliente
router.get('/clientes-pago', async (req, res) => {
  try {
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    var clientes = (Array.isArray(customers) ? customers : []).map(function(c) {
      var local = db.prepare('SELECT stripe_customer_id, iban, metodo_pago, pago_activo FROM clients WHERE likes_customer_id=?').get(c.fiscalId || '');
      return {
        fiscalId: c.fiscalId || '',
        nombre: c.name + ' ' + (c.firstSurname || ''),
        email: c.email || '',
        stripe_customer_id: local?.stripe_customer_id || '',
        iban: local?.iban || '',
        metodo_pago: local?.metodo_pago || 'stripe',
        pago_activo: local?.pago_activo ?? 1
      };
    });
    res.render('isp/facturacion/clientes-pago', { title: 'Métodos de Pago', clientes });
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/clientes-pago/actualizar', (req, res) => {
  try {
    var up = db.prepare('UPDATE clients SET metodo_pago=?, pago_activo=?, iban=? WHERE likes_customer_id=?');
    up.run(req.body.metodo_pago || 'stripe', req.body.pago_activo ? 1 : 0, req.body.iban || '', req.body.fiscal_id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
