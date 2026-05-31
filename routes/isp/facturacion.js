const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const { getNextNumeroFactura, formatNumeroFactura } = require('../../facturacion_helper');
const nube = require('../../helpers/nube');
const router = express.Router();

router.use(requireAuth);

// Dashboard de facturación
router.get('/', async (req, res) => {
  try {
    var pendientes = 0, pagadas = 0, vencidas = 0, totalMes = 0;
    try {
      pendientes = db.prepare("SELECT COUNT(*) as c FROM isp_facturas WHERE estado='pendiente'").get().c;
      pagadas = db.prepare("SELECT COUNT(*) as c FROM isp_facturas WHERE pagada=1").get().c;
      vencidas = db.prepare("SELECT COUNT(*) as c FROM isp_facturas WHERE estado='pendiente' AND fecha_vencimiento < date('now')").get().c;
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
  res.json({ ok: true, message: 'Generando facturas en segundo plano...' });
  try {
    var api = LikesAPI.getApiInstance();
    var customers = await api.getCustomers();
    var allProducts = [];
    try { allProducts = await api.getProducts(); } catch(e) {}
    
    var productPriceMap = {};
    for (var ap of (Array.isArray(allProducts) ? allProducts : [])) {
      var pid = String(ap.productId || ap.id || '');
      if (pid) productPriceMap[pid] = parseFloat(ap.price || 0);
    }
    
    var cuentasGeneradas = 0, errores = 0;
    var periodo = new Date().toISOString().split('T')[0].substring(0, 7);
    var fechaEmision = new Date().toISOString().split('T')[0];
    
    // Auto-descargar CDRs desde Likes Telecom
    try {
      var cdrModule = require('./cdr-download');
      var cdrResult = await cdrModule.downloadLatestCDRs();
      if (cdrResult.ok) {
        var imp = cdrModule.importCDRs(cdrResult.data, periodo);
        console.log('CDRs descargados e importados:', imp);
      }
    } catch(e) { console.error('CDR download error:', e.message); }
    
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
    
    for (var sd of allSubsData) {
      try {
        var fiscalId = sd.fiscalId;
        var subs = sd.subs;
        if (subs.length === 0) continue;
        
        var c = (Array.isArray(customers) ? customers : []).find(function(x) { return x.fiscalId === fiscalId; });
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
        
        var metodoPago = 'stripe';
        var pagoActivo = 1;
        var mp = db.prepare("SELECT value FROM settings WHERE key='metodo_pago_" + fiscalId + "'").get();
        if (mp) metodoPago = mp.value;
        var pa = db.prepare("SELECT value FROM settings WHERE key='pago_activo_" + fiscalId + "'").get();
        if (pa) pagoActivo = parseInt(pa.value);
        if (!pagoActivo) continue;
        
        var importeCdrs = 0;
        // Get customer lines from their subscriptions
        var customerLines = subs.map(function(s) {
          var prods = s.products || (s.productName ? [s] : []);
          return prods.map(function(p) { return p.fixedNumber || p.lineNumber || ''; }).filter(Boolean);
        }).flat();
        // Find CDRs for this customer - by fiscal_id OR by line number
        var cdrsPeriodo = [];
        var cdrsByFiscal = db.prepare('SELECT * FROM isp_cdrs WHERE fiscal_id=? AND (periodo=? OR periodo=? OR periodo IS NULL) AND factura_id IS NULL').all(fiscalId, periodo, periodo.substring(0,7));
        // Also try to find CDRs by line number if fiscal_id didn't match
        if (cdrsByFiscal.length === 0 && customerLines.length > 0) {
          var placeholders = customerLines.map(function() { return '?'; }).join(',');
          cdrsByFiscal = db.prepare('SELECT * FROM isp_cdrs WHERE linea IN (' + placeholders + ') AND (periodo=? OR periodo=? OR periodo IS NULL) AND factura_id IS NULL').all.apply(null, customerLines.concat([periodo, periodo.substring(0,7)]));
        }
        cdrsPeriodo = cdrsByFiscal;
        for (var cdr of cdrsPeriodo) {
          importeCdrs += parseFloat(cdr.importe || 0);
        }
        var importeTotal = Math.round((importeBase + importeCdrs) * 100) / 100;
        if (importeTotal <= 0) continue;
        
        var fechaVenc = new Date();
        fechaVenc.setDate(fechaVenc.getDate() + 28);
        var fechaVencStr = fechaVenc.toISOString().split('T')[0];
        
        // UPSERT: check if invoice already exists for this fiscalId+periodo
        var existingInv = db.prepare('SELECT id FROM isp_facturas WHERE fiscal_id=? AND periodo=?').get(fiscalId, periodo);
        var facturaId;
        if (existingInv) {
          facturaId = existingInv.id;
          db.prepare('UPDATE isp_facturas SET cliente_nombre=?, cliente_email=?, importe_base=?, importe_cdrs=?, importe_total=?, fecha_emision=?, fecha_vencimiento=?, metodo_pago=?, cliente_direccion=?, cliente_poblacion=?, cliente_provincia=?, codigo_postal=? WHERE id=?').run(nombre, email, importeBase, importeCdrs, importeTotal, fechaEmision, fechaVencStr, metodoPago, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal, facturaId);
          db.prepare('DELETE FROM isp_facturas_lineas WHERE factura_id=?').run(facturaId);
        } else {
          var numbering = getNextNumeroFactura('F');
          var inv = db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago, serie, numero_factura, cliente_direccion, cliente_poblacion, cliente_provincia, codigo_postal) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(nombre, email, fiscalId, periodo, fechaEmision, fechaVencStr, importeBase, importeCdrs, importeTotal, metodoPago, numbering.serie, numbering.numero, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal);
          facturaId = inv.lastInsertRowid;
        }
        for (var prod of productos) {
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, prod.nombre, 'cuota', prod.precio, prod.linea);
        }
        // Link all CDRs to this invoice first
        for (var cdr of cdrsPeriodo) {
          db.prepare('UPDATE isp_cdrs SET factura_id=? WHERE id=?').run(facturaId, cdr.id);
        }
        // Group CDRs by (linea, tipo) and insert ONE summary line per group
        var grupos = {};
        for (var cdr of cdrsPeriodo) {
          var key = (cdr.linea || '') + '|' + (cdr.tipo || 'exceso');
          if (!grupos[key]) grupos[key] = { linea: cdr.linea || '', tipo: cdr.tipo || 'exceso', total: 0 };
          grupos[key].total += parseFloat(cdr.importe || 0);
        }
        for (var gk in grupos) {
          var g = grupos[gk];
          var gConcepto = g.tipo === 'exceso'
            ? 'LINEA MOVIL EXCEDENTE DE DATOS LINEA (' + g.linea + ')'
            : 'LINEA MOVIL EXCEDENTE DE LLAMADAS LINEA (' + g.linea + ')';
          db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(facturaId, gConcepto, 'cdr', Math.round(g.total * 100) / 100, g.linea);
        }
        cuentasGeneradas++;
        
      } catch(e) { errores++; }
    }
    
    var facturasNuevas = db.prepare('SELECT * FROM isp_facturas WHERE periodo=? ORDER BY id DESC').all(periodo);
    for (var fn of facturasNuevas) {
      try {
        var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(fn.id);
        var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(fn.id);
        var llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(fn.id);
        var historia = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(fn.fiscal_id, fn.id);
        var result = await nube.procesarFactura(fn, lineas, cdrsDetalle, llamadas, historia.reverse());
        console.log('PDFs generados en nube para', periodo, ':', cuentasGeneradas, 'facturas');
      } catch(e2) {
        console.error('Error en proceso nube:', e2.message);
      }
    }
    
    console.log('Generación completada:', { generadas: cuentasGeneradas, errores: errores });
  } catch(e) {
    console.error('Error en generación:', e.message);
  }
});

// Crear factura manual
router.post('/facturas/manual', (req, res) => {
  try {
    var { cliente_nombre, cliente_email, fiscal_id, periodo, concepto, importe, linea, serie } = req.body;
    if (!cliente_nombre || !importe) return res.json({ ok: false, error: 'Nombre e importe requeridos' });

    var s = serie || 'F';
    var fe = new Date().toISOString().split('T')[0];
    var fv = new Date(); fv.setDate(fv.getDate() + 28);
    var fvStr = fv.toISOString().split('T')[0];
    var per = periodo || fe.substring(0, 7);

    var dirInfo = db.prepare('SELECT direccion, ciudad, provincia, codigo_postal FROM clients WHERE dni_nif=? OR likes_customer_id=?').get(fiscal_id || '', fiscal_id || '');
    var clienteDireccion = (dirInfo && dirInfo.direccion) || '';
    var clientePoblacion = (dirInfo && dirInfo.ciudad) || '';
    var clienteProvincia = (dirInfo && dirInfo.provincia) || '';
    var codigoPostal = (dirInfo && dirInfo.codigo_postal) || '';

    var numbering = getNextNumeroFactura(s);
    var inv = db.prepare('INSERT INTO isp_facturas (cliente_nombre, cliente_email, fiscal_id, periodo, fecha_emision, fecha_vencimiento, importe_base, importe_cdrs, importe_total, metodo_pago, serie, numero_factura, cliente_direccion, cliente_poblacion, cliente_provincia, codigo_postal) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?)').run(cliente_nombre, cliente_email || '', fiscal_id || '', per, fe, fvStr, parseFloat(importe), parseFloat(importe), 'manual', numbering.serie, numbering.numero, clienteDireccion, clientePoblacion, clienteProvincia, codigoPostal);
    var fid = inv.lastInsertRowid;
    db.prepare('INSERT INTO isp_facturas_lineas (factura_id, concepto, tipo, importe, linea) VALUES (?,?,?,?,?)').run(fid, concepto || 'Cuota servicio', 'cuota', parseFloat(importe), linea || '');
    res.json({ ok: true, id: fid, numero: numbering.full });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Listar todas las facturas
router.get('/facturas', (req, res) => {
  try {
    var facturas = db.prepare('SELECT id, serie, numero_factura, cliente_nombre, fecha_emision, importe_total, estado FROM isp_facturas ORDER BY fecha_emision DESC, id DESC').all();
    
    var MES_NOMBRES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    var yearsMap = {};
    facturas.forEach(function(f) {
      var year = f.fecha_emision ? f.fecha_emision.substring(0, 4) : '2026';
      var month = f.fecha_emision ? parseInt(f.fecha_emision.substring(5, 7)) : 5;
      if (!yearsMap[year]) yearsMap[year] = {};
      if (!yearsMap[year][month]) yearsMap[year][month] = { facturas: [], total: 0, count: 0 };
      yearsMap[year][month].facturas.push({
        id: f.id,
        numFactura: (f.serie || 'F') + '-' + String(f.numero_factura || f.id).padStart(5, '0'),
        cliente: f.cliente_nombre,
        importe: f.importe_total,
        estado: f.estado
      });
      yearsMap[year][month].total += parseFloat(f.importe_total || 0);
      yearsMap[year][month].count++;
    });

    var currentYear = new Date().getFullYear();
    var years = [];
    for (var y = 2024; y <= currentYear + 1; y++) {
      var yearData = yearsMap[y] || {};
      var meses = [];
      for (var m = 1; m <= 12; m++) {
        var mesData = yearData[m] || { facturas: [], total: 0, count: 0 };
        meses.push({ num: m, nombre: MES_NOMBRES[m], facturas: mesData.facturas, total: mesData.total, count: mesData.count });
      }
      years.push({ year: y, meses: meses });
    }

    res.render('isp/facturacion/facturas', { title: 'Facturas', facturas, years: years, mesNombres: MES_NOMBRES });
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// Ver factura como HTML profesional (para impresión/visualización)
router.get('/facturas/:id/view', (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).send('No encontrada');
    var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    
    // Group CDR lines by (linea, tipo) for summary display
    var lineas = [];
    var cdrGroups = {};
    lineasRaw.forEach(function(l) {
      if (l.tipo === 'cdr') {
        var key = (l.linea || '') + '|' + (l.tipo || 'exceso');
        if (!cdrGroups[key]) cdrGroups[key] = { linea: l.linea || '', tipo: 'cdr', total: 0, concepto: '' };
        cdrGroups[key].total += parseFloat(l.importe || 0);
        cdrGroups[key].concepto = l.concepto;
      } else {
        lineas.push(l);
      }
    });
    for (var gk in cdrGroups) {
      var g = cdrGroups[gk];
      lineas.push({ concepto: g.concepto, tipo: 'cdr', importe: Math.round(g.total * 100) / 100, linea: g.linea });
    }
    
    // Get CDR details for this invoice
    var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id);
    var llamadas = [];
    try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(req.params.id); } catch(e) {}
    
    // Get payment history (last 6 months) for the chart
    var history = [];
    var histFiscalId = factura.fiscal_id;
    if (histFiscalId) {
      var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(histFiscalId, factura.id);
      history = histRows.reverse();
    }
    
    res.render('isp/facturacion/invoice-html', {
      title: 'Factura #' + factura.id,
      factura,
      lineas,
      cdrsDetalle,
      llamadas,
      history,
      layout: false
    });
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

// Detalle de factura
router.get('/facturas/:id', (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).send('No encontrada');
    var lineas = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    var cdrsDetalle = [];
    try { cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id); } catch(e) {}
    var llamadas = [];
    try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(req.params.id); } catch(e) {}
    res.render('isp/facturacion/detalle', { title: 'Factura #' + factura.id, factura, lineas, cdrsDetalle, llamadas });
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

// Enviar factura por email vía Gmail SMTP
router.post('/facturas/:id/enviar', async (req, res) => {
  try {
    var factura = db.prepare('SELECT * FROM isp_facturas WHERE id=?').get(req.params.id);
    if (!factura) return res.status(404).json({ ok: false, error: 'No encontrada' });
    
    var lineasRaw = db.prepare('SELECT * FROM isp_facturas_lineas WHERE factura_id=?').all(req.params.id);
    // Group CDR lines
    var lineas = [], cdrG = {};
    lineasRaw.forEach(function(l) {
      if (l.tipo === 'cdr') {
        var k = (l.linea||'')+'|'+(l.tipo||'exceso');
        if (!cdrG[k]) cdrG[k] = { linea: l.linea, tipo: 'cdr', total: 0, concepto: l.concepto };
        cdrG[k].total += parseFloat(l.importe||0);
      } else { lineas.push(l); }
    });
    for (var gk in cdrG) { var g=cdrG[gk]; lineas.push({ concepto: g.concepto, tipo: 'cdr', importe: Math.round(g.total*100)/100, linea: g.linea }); }
    var cdrsDetalle = db.prepare('SELECT * FROM isp_cdrs WHERE factura_id=?').all(req.params.id);
    
    var numFactura = (factura.serie || 'F') + '-' + String(factura.numero_factura || factura.id).padStart(5, '0');
    var fs = require('fs');
    var ejs = require('ejs');
    var path = require('path');
    var tpl = fs.readFileSync(path.join(__dirname, '..', '..', 'views', 'isp', 'facturacion', 'invoice-html.ejs'), 'utf8');
    var llamadas = [];
    var history = [];
    try { llamadas = db.prepare('SELECT * FROM isp_llamadas WHERE factura_id=? ORDER BY fecha, hora').all(req.params.id); } catch(e) {}
    try {
      var histFiscalId = factura.fiscal_id;
      if (histFiscalId) {
        var histRows = db.prepare("SELECT periodo, SUM(importe_total) as total FROM isp_facturas WHERE fiscal_id=? AND id<=? GROUP BY periodo ORDER BY periodo DESC LIMIT 6").all(histFiscalId, factura.id);
        history = histRows.reverse();
      }
    } catch(e) {}
    var html = ejs.render(tpl, { factura, lineas, cdrsDetalle, llamadas, history, layout: false });
    
    var toEmail = req.body.to || factura.cliente_email;
    var subject = 'Factura ' + numFactura + ' - Movilbro - ' + factura.periodo;
    
    var pdfBuf = null;
    try {
      var nubeResult = await nube.procesarFactura(factura, lineas, cdrsDetalle);
      pdfBuf = nubeResult.pdfBuf;
      console.log('PDF guardado en nube:', nubeResult.nombreArchivo);
    } catch(e) { console.error('Error generando PDF:', e.message); }
    
    var sent = false;
    var lastError = '';
    var mailOptions = { from: '', to: toEmail, subject: subject, html: html };
    if (pdfBuf) mailOptions.attachments = [{ filename: 'Factura-' + numFactura + '.pdf', content: pdfBuf, contentType: 'application/pdf' }];

    var gmailUser = db.prepare("SELECT value FROM settings WHERE key='gmail_user'").get()?.value;
    var gmailPass = db.prepare("SELECT value FROM settings WHERE key='gmail_pass'").get()?.value;
    var smtpHost = db.prepare("SELECT value FROM settings WHERE key='smtp_host'").get()?.value;
    var smtpUser = db.prepare("SELECT value FROM settings WHERE key='smtp_user'").get()?.value;
    var smtpPass = db.prepare("SELECT value FROM settings WHERE key='smtp_pass'").get()?.value;

    var nodemailer = require('nodemailer');

    // Try sending methods in order
    var methods = [];

    if (gmailUser && gmailPass) {
      methods.push({ name: 'Gmail Service', transporter: nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } }), from: gmailUser });
      methods.push({ name: 'Gmail SMTP', transporter: nodemailer.createTransport({ host: 'smtp.gmail.com', port: 587, secure: false, auth: { user: gmailUser, pass: gmailPass } }), from: gmailUser });
    }
    if (smtpHost && smtpUser && smtpPass) {
      var smtpFrom = db.prepare("SELECT value FROM settings WHERE key='email_from'").get()?.value || smtpUser;
      methods.push({ name: 'SMTP Custom', transporter: nodemailer.createTransport({ host: smtpHost, port: 587, secure: false, auth: { user: smtpUser, pass: smtpPass } }), from: smtpFrom });
    }

    for (var m of methods) {
      if (sent) break;
      try {
        var opts = Object.assign({}, mailOptions, { from: m.from });
        await m.transporter.sendMail(opts);
        sent = true;
        console.log('Email enviado vía', m.name, 'a', toEmail);
      } catch(e) {
        lastError = e.message;
        console.error(m.name, 'error:', e.message);
      }
    }

    if (!sent) {
      return res.json({ ok: false, error: 'No hay método de envío configurado. Configura Gmail en Ajustes > Correo SMTP.' + (lastError ? ' Último error: ' + lastError : '') });
    }
    
    db.prepare('UPDATE isp_facturas SET email_enviado=1 WHERE id=?').run(factura.id);
    res.json({ ok: true, message: 'Email enviado correctamente a ' + toEmail });
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