const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

function getApi() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  return new LikesAPI({ apiUrl: c.likes_api_url, email: c.likes_client_id, password: c.likes_client_secret, brandId: c.likes_brand_id });
}

function generarToken() {
  return crypto.randomBytes(24).toString('hex');
}

// GET /altas - main alta page (auth required)
router.get('/', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const [customers, products, portabilities, donors] = await Promise.all([
      api.getCustomers(),
      api.getProducts(),
      api.getPortabilities(),
      api.getDonorOperators()
    ]);

    const familias = {};
    (Array.isArray(products) ? products : []).forEach(p => {
      const fam = p.family || 'Otros';
      if (!familias[fam]) familias[fam] = { name: fam, items: [] };
      familias[fam].items.push(p);
    });

    const localCustomers = db.prepare('SELECT id, nombre, apellidos, telefono, likes_customer_id, email FROM clients ORDER BY nombre').all();

    const allRecientes = (Array.isArray(customers) ? customers : [])
      .filter(c => c.created)
      .map(c => ({
        id: c.id,
        nombre: (c.name || '') + ' ' + (c.firstSurname || ''),
        telefono: c.contactPhone || '-',
        tipo: c.customerType || 'Residential',
        estado: c.status || 'CREATED',
        fecha: c.created
      }))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // Pending orders from our DB
    const ordenesPendientes = db.prepare("SELECT * FROM altas_ordenes WHERE estado != 'completada' AND estado != 'cancelada' ORDER BY created_at DESC LIMIT 20").all();

    res.render('altas/index', {
      title: 'Altas',
      familias: Object.values(familias),
      products,
      localCustomers,
      recientes: allRecientes,
      portabilidades: portabilities,
      donantes: Array.isArray(donors) ? donors : [],
      ordenesPendientes,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (error) {
    const localCustomers = db.prepare('SELECT id, nombre, apellidos, telefono, likes_customer_id, email FROM clients ORDER BY nombre').all();
    res.render('altas/index', {
      title: 'Altas',
      familias: [],
      products: [],
      localCustomers,
      recientes: [],
      portabilidades: [],
      donantes: [],
      ordenesPendientes: [],
      success: null,
      error: 'Error: ' + error.message
    });
  }
});

// POST /altas/crear-cliente-avanzado - create customer + save as pending order
router.post('/crear-cliente-avanzado', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const { nombre, apellidos, email, telefono, dni, direccion, ciudad, codigo_postal, customerType, metodo_pago, iban, producto_id, tipo_contratacion, donante_id, linea_portabilidad, cobertura_id } = req.body;

    // 1. Save client locally
    const result = db.prepare(`INSERT INTO clients (nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, codigo_postal, tipo_cliente, metodo_pago, iban) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      nombre, apellidos, email, telefono, dni, direccion, ciudad, codigo_postal, customerType || 'Residential', metodo_pago || '', iban || ''
    );
    const clientId = result.lastInsertRowid;

    // 2. Create on Likes Telecom API
    let likesCustomerId = null;
    let docUploadUrls = null;
    try {
      const apiCustomer = await api.createCustomer({
        name: nombre,
        firstSurname: apellidos || '',
        email: email,
        contactPhone: telefono,
        fiscalId: dni,
        customerType: customerType || 'Residential',
        billingAddress: { street: direccion, cityName: ciudad, zipCode: codigo_postal }
      });
      if (apiCustomer) {
        likesCustomerId = apiCustomer.id || apiCustomer.customerId || null;
        if (likesCustomerId) {
          db.prepare('UPDATE clients SET likes_customer_id = ? WHERE id = ?').run(String(likesCustomerId), clientId);
        }
        docUploadUrls = apiCustomer.documentation || apiCustomer.documents || null;
      }
    } catch (apiErr) {
      console.error('Error creating customer in API:', apiErr.message);
    }

    // 3. Generate token for KYC
    const token = generarToken();

    // 4. Save as pending order in altas_ordenes
    const datosCliente = JSON.stringify({ nombre, apellidos, email, telefono, dni, direccion, ciudad, codigo_postal, customerType, metodo_pago, iban, clientId, likesCustomerId });
    const datosProducto = JSON.stringify({ producto_id, tipo_contratacion, donante_id, linea_portabilidad, cobertura_id });

    db.prepare(`INSERT INTO altas_ordenes (token, client_id, likes_customer_id, estado, paso, datos_cliente, datos_producto, datos_pago) VALUES (?,?,?,?,?,?,?,?)`).run(
      token, clientId, likesCustomerId, 'pendiente_kyc', 3, datosCliente, datosProducto, JSON.stringify({ metodo: metodo_pago, iban })
    );

    db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('alta_cliente', 'Cliente ' + nombre + ' ' + apellidos + ' creado. Pendiente KYC', clientId);

    // 5. Return success with order token
    res.json({
      ok: true,
      message: 'Cliente creado correctamente',
      clientId,
      likesCustomerId,
      orderToken: token,
      docUploadUrls,
      nextStep: '/kyc/' + token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /altas/crear-orden - simplified direct order creation
router.post('/crear-orden', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const { client_id, producto_id, tipo } = req.body;
    const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!cliente) return res.redirect('/altas?error=Cliente no encontrado');

    const orderData = {
      customerId: cliente.likes_customer_id || undefined,
      brandId: api.brandId,
      productId: producto_id,
      type: tipo || 'NUEVA_ALTA'
    };

    let apiOrderId = null;
    try {
      const apiOrder = await api.createOrder(orderData);
      apiOrderId = apiOrder?.id || apiOrder?.orderId || null;
    } catch (apiErr) {
      console.error('Error creating order in API:', apiErr.message);
    }

    db.prepare('INSERT INTO orders (client_id, likes_order_id, estado, tipo, producto, detalles) VALUES (?, ?, ?, ?, ?, ?)').run(
      client_id, apiOrderId, 'pendiente', tipo || 'alta', producto_id, JSON.stringify(orderData)
    );

    db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('alta_orden', 'Orden creada para cliente ' + cliente.nombre, client_id);
    res.redirect('/altas?success=Orden creada correctamente');
  } catch (error) {
    res.redirect('/altas?error=' + error.message);
  }
});

// POST /altas/enviar-kyc - send KYC email to customer
router.post('/enviar-kyc', requireAuth, async (req, res) => {
  try {
    const { orden_id } = req.body;
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE id = ?').get(orden_id);
    if (!orden) return res.status(404).json({ ok: false, error: 'Orden no encontrada' });

    const datos = JSON.parse(orden.datos_cliente || '{}');
    if (!datos.email) return res.status(400).json({ ok: false, error: 'El cliente no tiene email' });

    const nodemailer = require('nodemailer');
    const kycUrl = `${req.protocol}://${req.get('host')}/kyc/${orden.token}`;

    const gmailUser = db.prepare("SELECT value FROM settings WHERE key='gmail_user'").get()?.value;
    const gmailPass = db.prepare("SELECT value FROM settings WHERE key='gmail_pass'").get()?.value;
    const empresaNombre = db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value || 'Movilbro';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:20px;color:#333;max-width:600px;margin:0 auto}.header{background:#0050A1;color:#fff;padding:20px;text-align:center;border-radius:8px 8px 0 0}h1{margin:0;font-size:22px}.content{padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px}.btn{display:inline-block;background:#0050A1;color:#fff;padding:12px 30px;text-decoration:none;border-radius:6px;font-size:16px;margin:20px 0}.footer{font-size:12px;color:#999;margin-top:20px;text-align:center;border-top:1px solid #eee;padding-top:15px}</style></head><body>
<div class="header"><h1>${empresaNombre} - Verificación de datos</h1></div>
<div class="content">
<p>Hola <strong>${datos.nombre || ''}</strong>,</p>
<p>Estamos tramitando tu alta como nuevo cliente. Para completar el proceso necesitamos que verifiques tu identidad y firmes el contrato.</p>
<p>Es un proceso rápido de 2 pasos:</p>
<ol>
<li><strong>Verificación de identidad</strong> — Foto con tu DNI (anverso y reverso)</li>
<li><strong>Firma del contrato</strong> — Revisa y firma digitalmente</li>
</ol>
<p style="text-align:center"><a href="${kycUrl}" class="btn">Ir a verificación →</a></p>
<p style="font-size:14px;color:#666;text-align:center">Este enlace es personal y seguro. No lo compartas.</p>
</div>
<div class="content" style="border-top:1px solid #ddd;margin-top:20px">
<p style="font-size:13px;color:#666">¿Por qué te pedimos estos datos? La verificación de identidad es un requisito legal (KYC - Know Your Customer) para la contratación de servicios de telecomunicaciones. Tus datos están protegidos y solo se utilizarán para tramitar tu alta.</p>
</div>
<div class="footer">
<p><strong>${empresaNombre}</strong> - <a href="mailto:${gmailUser || 'info@movilbro.com'}">${gmailUser || 'info@movilbro.com'}</a></p>
<p><img src="${req.protocol}://${req.get('host')}/api/kyc/tracking/${orden.token}.gif" width="1" height="1" alt=""/></p>
</div>
</body></html>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass }
    });

    await transporter.sendMail({
      from: gmailUser,
      to: datos.email,
      subject: empresaNombre + ' - Verifica tu identidad para completar el alta',
      html: html
    });

    db.prepare('UPDATE altas_ordenes SET email_enviado = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(orden_id);
    res.json({ ok: true, message: 'Email enviado a ' + datos.email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /altas/subir-documento - manual document upload from CRM to API
router.post('/subir-documento', requireAuth, async (req, res) => {
  try {
    const { orden_id, tipo } = req.body;
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE id = ?').get(orden_id);
    if (!orden) return res.status(404).json({ ok: false, error: 'Orden no encontrada' });

    const api = getApi();
    const datos = JSON.parse(orden.datos_cliente || '{}');

    // Re-fetch customer to get fresh upload URLs
    let customers = await api.getCustomers();
    let customersArr = Array.isArray(customers) ? customers : [];
    let customer = customersArr.find(c => c.fiscalId === datos.dni);
    if (!customer) return res.status(404).json({ ok: false, error: 'Cliente no encontrado en API' });

    const docs = customer.documentation || customer.documents || [];
    const docInfo = docs.find(d => d.documentType === tipo);
    if (!docInfo || !docInfo.uploadURL) return res.status(400).json({ ok: false, error: 'No hay URL de subida para ' + tipo });

    // If file was uploaded via multer, send it to API
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });

    const axios = require('axios');
    const fs = require('fs');
    const fileBuf = fs.readFileSync(req.file.path);

    await axios.put(docInfo.uploadURL, fileBuf, {
      headers: { 'Content-Type': req.file.mimetype || 'image/jpeg' }
    });

    db.prepare('UPDATE altas_ordenes SET kyc_docs_subidos = kyc_docs_subidos + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(orden_id);

    res.json({ ok: true, message: 'Documento ' + tipo + ' subido correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /altas/completar - finalize order and send to Likes Telecom API
router.post('/completar', requireAuth, async (req, res) => {
  try {
    const { orden_id } = req.body;
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE id = ?').get(orden_id);
    if (!orden) return res.status(404).json({ ok: false, error: 'Orden no encontrada' });

    const api = getApi();
    const datosCliente = JSON.parse(orden.datos_cliente || '{}');
    const datosProducto = JSON.parse(orden.datos_producto || '{}');
    const datosPago = JSON.parse(orden.datos_pago || '{}');

    const likesCustomerId = orden.likes_customer_id || datosCliente.likesCustomerId;
    if (!likesCustomerId) return res.status(400).json({ ok: false, error: 'El cliente no tiene ID en Likes Telecom' });

    // Build products array for signupv2
    const products = [];
    const prodObj = { productId: datosProducto.producto_id };

    if (datosPago.metodo === 'IBAN' && datosPago.iban) {
      prodObj.iban = datosPago.iban;
    }

    if (datosProducto.tipo_contratacion === 'PORTABILIDAD' && datosProducto.linea_portabilidad) {
      prodObj.portability = true;
      prodObj.lineNumber = datosProducto.linea_portabilidad;
      if (datosProducto.donante_id) {
        prodObj.donorOperatorId = datosProducto.donante_id;
      }
    } else if (datosProducto.tipo_contratacion === 'NUEVA_ALTA') {
      prodObj.portability = false;
    }

    if (datosProducto.cobertura_id) {
      prodObj.coverage = datosProducto.cobertura_id;
    }

    products.push(prodObj);

    const orderPayload = {
      fiscalId: datosCliente.dni,
      digitalSignature: true,
      products: products
    };

    let apiOrderResult = null;
    try {
      apiOrderResult = await api.createOrder(orderPayload);
    } catch (apiErr) {
      console.error('Error creating order in API:', apiErr.message);
      return res.status(500).json({ ok: false, error: 'Error al crear orden en API: ' + apiErr.message });
    }

    const apiOrderId = apiOrderResult?.id || apiOrderResult?.orderId || null;

    db.prepare(`UPDATE altas_ordenes SET estado = 'completada', likes_order_id = ?, orden_data = ?, paso = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      apiOrderId, JSON.stringify(orderPayload), orden_id
    );

    // Insert into orders table too
    db.prepare('INSERT INTO orders (client_id, likes_order_id, estado, tipo, producto, detalles) VALUES (?, ?, ?, ?, ?, ?)').run(
      orden.client_id, apiOrderId, 'activa', datosProducto.tipo_contratacion || 'NUEVA_ALTA', datosProducto.producto_id, JSON.stringify(orderPayload)
    );

    db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('alta_completada', 'Orden completada y enviada a Likes Telecom. ID: ' + (apiOrderId || ''), orden.client_id);

    res.json({ ok: true, message: 'Orden completada y enviada a Likes Telecom', apiOrderId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /altas/cancelar-orden
router.post('/cancelar-orden', requireAuth, async (req, res) => {
  try {
    const { orden_id } = req.body;
    db.prepare("UPDATE altas_ordenes SET estado = 'cancelada', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orden_id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /altas/orden/:id - get order details as JSON
router.get('/orden/:id', requireAuth, async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE id = ? OR token = ?').get(req.params.id, req.params.id);
    if (!orden) return res.status(404).json({ ok: false, error: 'No encontrada' });
    orden.datos_cliente = JSON.parse(orden.datos_cliente || '{}');
    orden.datos_producto = JSON.parse(orden.datos_producto || '{}');
    orden.datos_pago = JSON.parse(orden.datos_pago || '{}');
    res.json({ ok: true, orden });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
