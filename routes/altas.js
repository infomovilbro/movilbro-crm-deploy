const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApi() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  return new LikesAPI({ apiUrl: c.likes_api_url, email: c.likes_client_id, password: c.likes_client_secret, brandId: c.likes_brand_id });
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const [customers, products, portabilities] = await Promise.all([
      api.getCustomers(),
      api.getProducts(),
      api.getPortabilities()
    ]);

    const familias = {};
    products.forEach(p => {
      const fam = p.family || 'Otros';
      if (!familias[fam]) familias[fam] = { name: fam, items: [] };
      familias[fam].items.push(p);
    });

    const localCustomers = db.prepare('SELECT id, nombre, apellidos, telefono, likes_customer_id FROM clients ORDER BY nombre').all();

    const allRecientes = customers
      .filter(c => c.created)
      .map(c => ({
        id: c.id,
        nombre: (c.name || c.firstName || '') + ' ' + (c.lastName || c.surname || ''),
        telefono: c.phone || c.contactInfo?.phone || '-',
        tipo: c.customerType || 'Residential',
        estado: c.status || 'CREATED',
        producto: '',
        fecha: c.created
      }))
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    res.render('altas/index', {
      title: 'Altas',
      familias: Object.values(familias),
      products,
      localCustomers,
      recientes: allRecientes,
      portabilidades: portabilities,
      error: null,
      success: req.query.success || null
    });
  } catch (error) {
    const localCustomers = db.prepare('SELECT id, nombre, apellidos, telefono, likes_customer_id FROM clients ORDER BY nombre').all();
    res.render('altas/index', {
      title: 'Altas',
      familias: [],
      products: [],
      localCustomers,
      recientes: [],
      portabilidades: [],
      error: 'Error al cargar datos: ' + error.message,
      success: null
    });
  }
});

router.post('/crear-cliente', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const { nombre, apellidos, email, telefono, dni, direccion, ciudad, codigo_postal } = req.body;

    // 1. Save locally
    const result = db.prepare(`
      INSERT INTO clients (nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, codigo_postal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(nombre, apellidos, email, telefono, dni, direccion, ciudad, codigo_postal);
    const clientId = result.lastInsertRowid;

    // 2. Create in Likes Telecom API
    try {
      const apiCustomer = await api.createCustomer({
        name: nombre,
        lastName: apellidos,
        email: email,
        phone: telefono,
        fiscalId: dni,
        billingAddress: { street: direccion, cityName: ciudad, zipCode: codigo_postal },
        brandId: api.brandId
      });
      if (apiCustomer && apiCustomer.id) {
        db.prepare('UPDATE clients SET likes_customer_id = ? WHERE id = ?').run(String(apiCustomer.id), clientId);
      }
    } catch (apiErr) {
      console.error('Error creating customer in API:', apiErr.message);
    }

    db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('alta_cliente', 'Cliente ' + nombre + ' ' + apellidos + ' dado de alta', clientId);
    res.redirect('/altas?success=Cliente ' + nombre + ' creado correctamente');
  } catch (error) {
    res.redirect('/altas?success=Error: ' + error.message);
  }
});

router.post('/crear-orden', requireAuth, async (req, res) => {
  try {
    const api = getApi();
    const { client_id, producto_id, tipo } = req.body;

    const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
    if (!cliente) return res.redirect('/altas?success=Error: Cliente no encontrado');

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
    res.redirect('/altas?success=Error: ' + error.message);
  }
});

module.exports = router;
