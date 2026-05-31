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

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:0;color:#333;margin:0;background:#f4f4f4}
    .container{max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)}
    .header{background:linear-gradient(135deg,#0050A1,#003d7a);color:#fff;padding:30px;text-align:center}
    .header h1{margin:0;font-size:24px;font-weight:300}
    .header .subtitle{font-size:14px;opacity:0.9;margin-top:8px}
    .content{padding:30px}
    .pasos{display:flex;gap:20px;margin:25px 0}
    .paso{flex:1;text-align:center;padding:20px;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef;min-width:0}
    .paso .icono{font-size:36px;margin-bottom:10px;display:block}
    .paso h3{margin:0 0 5px;font-size:16px;color:#0050A1}
    .paso p{margin:0;font-size:13px;color:#666}
    .btn{display:inline-block;background:linear-gradient(135deg,#0050A1,#003d7a);color:#fff;padding:14px 40px;text-decoration:none;border-radius:8px;font-size:16px;margin:20px 0;text-align:center;font-weight:500}
    .btn:hover{background:linear-gradient(135deg,#003d7a,#002a5e)}
    .info-kyc{background:#fff3cd;border:1px solid #ffeeba;border-radius:8px;padding:15px;margin:20px 0;font-size:14px;color:#856404}
    .info-kyc strong{display:block;margin-bottom:4px}
    .footer{background:#f8f9fa;padding:20px 30px;font-size:12px;color:#999;text-align:center;border-top:1px solid #eee}
    .footer a{color:#0050A1;text-decoration:none}
    .aviso-privacidad{font-size:11px;color:#aaa;margin-top:10px}
    @media(max-width:480px){.pasos{flex-direction:column;gap:12px}.header{padding:20px}.content{padding:20px}}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${empresaNombre}</h1>
      <div class="subtitle">Verificación de identidad y firma de contrato</div>
    </div>
    <div class="content">
      <p>Hola <strong>${datos.nombre || ''} ${datos.apellidos || ''}</strong>,</p>
      <p>Estamos tramitando tu alta como nuevo cliente de ${empresaNombre}. Para completar el proceso necesitamos que realices <strong>dos pasos muy sencillos</strong>:</p>

      <div class="pasos">
        <div class="paso">
          <span class="icono">📷</span>
          <h3>Paso 1: Verificar identidad</h3>
          <p>Sube una foto de tu DNI por ambas caras</p>
        </div>
        <div class="paso">
          <span class="icono">✍️</span>
          <h3>Paso 2: Firmar contrato</h3>
          <p>Revisa y firma digitalmente el contrato</p>
        </div>
      </div>

      <div style="text-align:center">
        <a href="${kycUrl}" class="btn">Siguiente paso →</a>
      </div>

      <p style="font-size:14px;color:#666;text-align:center">Este enlace es personal y seguro. No lo compartas con nadie.</p>

      <div class="info-kyc">
        <strong>🔒 ¿Por qué necesitamos estos documentos?</strong>
        La verificación de identidad es un requisito legal obligatorio (KYC - Know Your Customer) establecido por la normativa de telecomunicaciones. Necesitamos confirmar tu identidad para activar los servicios contratados de forma segura y cumplir con la legislación vigente en materia de prevención del fraude y blanqueo de capitales.
      </div>

      <div style="text-align:center;font-size:13px;color:#666;margin-top:15px">
        <p>¿Tienes dudas? Escríbenos a <a href="mailto:${gmailUser || 'info@movilbro.com'}">${gmailUser || 'info@movilbro.com'}</a></p>
      </div>
    </div>
    <div class="footer">
      <p><strong>${empresaNombre}</strong><br>
      <a href="mailto:${gmailUser || 'info@movilbro.com'}">${gmailUser || 'info@movilbro.com'}</a></p>
      <p class="aviso-privacidad">Este correo contiene información confidencial dirigida únicamente a su destinatario. Si no has solicitado este servicio, por favor ignora este mensaje. Tratamos tus datos conforme a nuestra política de privacidad. Puedes ejercer tus derechos de protección de datos contactándonos por email.</p>
      <img src="${req.protocol}://${req.get('host')}/kyc/tracking/${orden.token}.gif" width="1" height="1" alt=""/>
    </div>
  </div>
</body>
</html>`;

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
    let apiOrderId = null;

    try {
      apiOrderResult = await api.createOrder(orderPayload);
      apiOrderId = apiOrderResult?.id || apiOrderResult?.orderId || null;
    } catch (apiErr) {
      console.error('Error al crear orden en API:', apiErr.message);
      // Rollback: marcar la orden con error
      db.prepare("UPDATE altas_ordenes SET estado = 'error_api', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orden_id);
      db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run(
        'error_api', 'Error al enviar orden a Likes Telecom: ' + apiErr.message, orden.client_id
      );
      return res.status(500).json({ ok: false, error: 'Error al crear orden en API: ' + apiErr.message });
    }

    // Transacción atómica para actualizaciones en base de datos
    const completarOrden = db.transaction(() => {
      db.prepare(`UPDATE altas_ordenes SET estado = 'completada', likes_order_id = ?, orden_data = ?, paso = 5, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
        apiOrderId, JSON.stringify(orderPayload), orden_id
      );

      db.prepare('INSERT INTO orders (client_id, likes_order_id, estado, tipo, producto, detalles) VALUES (?, ?, ?, ?, ?, ?)').run(
        orden.client_id, apiOrderId, 'activa', datosProducto.tipo_contratacion || 'NUEVA_ALTA', datosProducto.producto_id, JSON.stringify(orderPayload)
      );

      db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run(
        'alta_completada', 'Orden completada y enviada a Likes Telecom. ID: ' + (apiOrderId || ''), orden.client_id
      );
    });

    completarOrden();

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

// POST /altas/reanudar-orden - resume order (returns all data for the agent)
router.post('/reanudar-orden', requireAuth, async (req, res) => {
  try {
    const { orden_id } = req.body;
    if (!orden_id) return res.status(400).json({ ok: false, error: 'Se requiere orden_id' });

    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE id = ?').get(orden_id);
    if (!orden) return res.status(404).json({ ok: false, error: 'Orden no encontrada' });

    // Parsear todos los campos JSON
    const datosCompletos = {
      id: orden.id,
      token: orden.token,
      client_id: orden.client_id,
      likes_customer_id: orden.likes_customer_id,
      likes_order_id: orden.likes_order_id,
      estado: orden.estado,
      paso: orden.paso,
      datos_cliente: JSON.parse(orden.datos_cliente || '{}'),
      datos_producto: JSON.parse(orden.datos_producto || '{}'),
      datos_pago: JSON.parse(orden.datos_pago || '{}'),
      datos_cobertura: JSON.parse(orden.datos_cobertura || '{}'),
      datos_donante: JSON.parse(orden.datos_donante || '{}'),
      orden_data: orden.orden_data ? JSON.parse(orden.orden_data) : null,
      email_enviado: orden.email_enviado,
      email_leido: orden.email_leido,
      email_veces_leido: orden.email_veces_leido,
      kyc_completado: orden.kyc_completado,
      kyc_docs_subidos: orden.kyc_docs_subidos,
      kyc_contrato_firmado: orden.kyc_contrato_firmado,
      created_at: orden.created_at,
      updated_at: orden.updated_at
    };

    // Obtener datos del cliente local si existe
    let cliente = null;
    if (orden.client_id) {
      cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(orden.client_id);
    }

    // Obtener documentos KYC subidos
    const docs = db.prepare('SELECT * FROM altas_kyc_docs WHERE orden_id = ? ORDER BY created_at').all(orden_id);

    res.json({
      ok: true,
      orden: datosCompletos,
      cliente,
      documentos_kyc: docs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
