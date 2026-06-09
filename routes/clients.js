const express = require('express');
const { db } = require('../database');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const search = req.query.search || '';

  let apiClientes = [];
  try {
    const api = LikesAPI.getApiInstance();
    const raw = await api.request('GET', '/customers?brand_id=' + api.brandId);
    const customers = Array.isArray(raw) ? raw : raw.customers || raw.data || [];
    apiClientes = customers.map(c => ({
      origen: 'API',
      id_api: c.id,
      nombre: c.name || c.firstName || '',
      apellidos: c.lastName || c.surname || '',
      email: c.email || c.contactInfo?.email || '',
      telefono: c.phone || c.contactInfo?.phone || '',
      dni_nif: c.fiscalId || c.fiscalNumber || '',
      direccion: (c.billingAddress?.street || '') + ' ' + (c.billingAddress?.cityName || ''),
      ciudad: c.billingAddress?.cityName || c.address?.city || '',
      tipo: c.customerType || 'Residential',
      estado: c.status || 'CREATED',
      created_at: c.created || null
    }));
  } catch (e) {
    console.error('API customers fetch error:', e.message);
  }

  // Auto-sync: save API customers to local DB
  const insertLocal = db.prepare(`
    INSERT OR IGNORE INTO clients (nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, tipo_cliente, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findExisting = db.prepare('SELECT id FROM clients WHERE telefono = ? OR dni_nif = ?');
  const updateLocal = db.prepare(`
    UPDATE clients SET nombre=?, apellidos=?, email=?, telefono=?, dni_nif=?, direccion=?, ciudad=?, tipo_cliente=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);

  for (const api of apiClientes) {
    if (!api.telefono && !api.dni_nif) continue;
    const existing = api.telefono ? findExisting.get(api.telefono, '') : 
                     api.dni_nif ? findExisting.get('', api.dni_nif) : null;
    if (existing) {
      updateLocal.run(api.nombre, api.apellidos, api.email, api.telefono, api.dni_nif, api.direccion, api.ciudad, api.tipo, existing.id);
    } else {
      insertLocal.run(api.nombre, api.apellidos, api.email, api.telefono, api.dni_nif, api.direccion, api.ciudad, api.tipo, api.created_at);
    }
  }

  // Fetch merged data
  let locales;
  if (search) {
    locales = db.prepare(`
      SELECT id as id_local, nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, tipo_cliente as tipo, '' as estado, created_at
      FROM clients 
      WHERE nombre LIKE ? OR apellidos LIKE ? OR email LIKE ? OR telefono LIKE ? OR dni_nif LIKE ?
      ORDER BY created_at DESC
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    locales = db.prepare(`
      SELECT id as id_local, nombre, apellidos, email, telefono, dni_nif, direccion, ciudad, tipo_cliente as tipo, '' as estado, created_at
      FROM clients ORDER BY created_at DESC
    `).all();
  }

  // Merge API + local, deduplicate by phone
  const seenPhones = new Set();
  const merged = [];
  locales.forEach(c => {
    if (c.telefono) seenPhones.add(c.telefono.replace(/[^\d]/g, ''));
    merged.push({ ...c, origen: 'LOCAL' });
  });
  apiClientes.forEach(api => {
    const phoneClean = api.telefono ? api.telefono.replace(/[^\d]/g, '') : '';
    if (!phoneClean || !seenPhones.has(phoneClean)) {
      if (phoneClean) seenPhones.add(phoneClean);
      merged.push({ ...api, id_local: null });
    }
  });

  res.render('clients/list', { 
    title: 'Clientes', 
    clientes: merged, 
    search, 
    apiCount: apiClientes.length, 
    localCount: locales.length 
  });
});

router.get('/nuevo', requireAuth, (req, res) => {
  res.render('clients/create', { title: 'Nuevo Cliente', cliente: {}, errors: [] });
});

router.post('/nuevo', requireAuth, (req, res) => {
  const { nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente } = req.body;
  if (!nombre || !telefono) {
    return res.render('clients/create', { title: 'Nuevo Cliente', cliente: req.body, errors: ['Nombre y teléfono son obligatorios'] });
  }
  const result = db.prepare(`
    INSERT INTO clients (nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_creado', 'Cliente ' + nombre + ' ' + (apellidos || '') + ' creado', result.lastInsertRowid);
  res.redirect('/customers');
});

router.get('/:id', requireAuth, async (req, res) => {
  const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!cliente) return res.redirect('/customers');
  const ordenes = db.prepare('SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);
  const suscripciones = db.prepare('SELECT * FROM subscriptions WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id).map(s => ({ ...s, origen: 'local' }));
  const tickets = db.prepare('SELECT * FROM tickets WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);

  // Fetch API subscriptions for this client by phone/fiscalId
  let apiSuscripciones = [];
  try {
    const api = LikesAPI.getApiInstance();
    if (cliente.telefono) {
      const raw = await api.getSubscriptions();
      const allSubs = Array.isArray(raw) ? raw : [];
      apiSuscripciones = allSubs
        .filter(sub => {
          const subPhone = (sub.phone || sub.line || sub.linea || '').replace(/[^\d]/g, '');
          const cliPhone = (cliente.telefono || '').replace(/[^\d]/g, '');
          return subPhone && cliPhone && subPhone === cliPhone;
        })
        .map(sub => {
          var prod = (sub.products && sub.products[0]) || {};
          return {
            linea: prod.lineNumber || prod.line || prod.phone || sub.phone || sub.line || '',
            producto: prod.productName || sub.productName || sub.product || sub.producto || '',
            estado: (prod.status || sub.status || sub.estado || 'activa').toLowerCase(),
            fecha_alta: sub.created || sub.sellDate || sub.created_at || sub.fecha_alta || sub.startDate || null,
            fecha_baja: sub.cancelled_at || sub.fecha_baja || sub.endDate || null,
            origen: 'api'
          };
        });
    }
  } catch (e) {
    console.error('Error fetching API subscriptions for client:', e.message);
  }

  const todasSuscripciones = [...suscripciones, ...apiSuscripciones];
  todasSuscripciones.sort((a, b) => {
    const da = a.fecha_alta || '';
    const db2 = b.fecha_alta || '';
    return da < db2 ? 1 : da > db2 ? -1 : 0;
  });

  // Compute chart data
  var linesByStatus = {};
  var lineNumbers = [];
  todasSuscripciones.forEach(function(s) {
    var estado = s.estado || 'desconocido';
    linesByStatus[estado] = (linesByStatus[estado] || 0) + 1;
    if (s.linea && lineNumbers.indexOf(s.linea) === -1) {
      lineNumbers.push(s.linea);
    }
  });

  res.render('clients/view', {
    title: 'Cliente: ' + cliente.nombre,
    cliente,
    ordenes,
    suscripciones: todasSuscripciones,
    tickets,
    apiSubCount: apiSuscripciones.length,
    linesByStatus: JSON.stringify(linesByStatus),
    lineNumbers: JSON.stringify(lineNumbers),
    apiActions: { canBlock: true, canChangeTariff: true, canDuplicateSim: true, canViewConsumption: true }
  });
});

router.get('/:id/editar', requireAuth, (req, res) => {
  const cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!cliente) return res.redirect('/customers');
  res.render('clients/edit', { title: 'Editar Cliente', cliente, errors: [] });
});

router.post('/:id/editar', requireAuth, (req, res) => {
  const { nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente } = req.body;
  db.prepare(`
    UPDATE clients SET nombre=?, apellidos=?, dni_nif=?, email=?, telefono=?, telefono2=?, direccion=?, ciudad=?, provincia=?, codigo_postal=?, notas=?, tipo_cliente=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(nombre, apellidos, dni_nif, email, telefono, telefono2, direccion, ciudad, provincia, codigo_postal, notas, tipo_cliente, req.params.id);
  db.prepare('INSERT INTO activity_log (tipo, descripcion, client_id) VALUES (?, ?, ?)').run('cliente_actualizado', 'Cliente ' + nombre + ' actualizado', req.params.id);
  res.redirect('/customers/' + req.params.id);
});

router.post('/:id/eliminar', requireAuth, (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.redirect('/customers');
});

// --- API Action Routes ---
router.post('/:id/line/:lineNumber/block', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.blockLine(req.params.lineNumber, req.body.blocked !== false);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/consumption', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.getLineGB(req.params.lineNumber);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/change-tariff', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.changeProduct(req.body);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/cdrs', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.getLineCDRs(req.params.lineNumber);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/line/:lineNumber/duplicate-sim', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.lineChangeSim(req.body);
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id/compatible-products', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const result = await api.getProducts();
    res.json({ ok: true, data: result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
