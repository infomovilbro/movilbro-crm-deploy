const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    // First try local data
    var localCount = 0;
    try { var cr = db.prepare('SELECT COUNT(*) as c FROM isp_contratos').get(); localCount = cr.c; } catch(e) {}
    
    if (localCount > 0) {
      var contratos = db.prepare('SELECT c.*, cl.nombre as cliente_nombre FROM isp_contratos c LEFT JOIN clients cl ON c.client_id=cl.id ORDER BY c.created_at DESC').all();
      return res.render('isp/contratos', { title: 'Contratos', contratos });
    }

    // No local data - fetch from API
    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}

    var allSubs = [];
    var fiscalIds = customers.map(function(c) { return c.fiscalId; }).filter(Boolean);
    var batchSize = 20;
    for (var i = 0; i < fiscalIds.length; i += batchSize) {
      var batch = fiscalIds.slice(i, i + batchSize);
      var results = await Promise.allSettled(batch.map(function(fid) {
        return api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=264')
          .then(function(data) { return Array.isArray(data) ? data : (data.data || data.subscriptions || []); });
      }));
      results.forEach(function(r) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach(function(s) { allSubs.push(s); });
        }
      });
    }

    var contratos = allSubs.map(function(s) {
      var subFiscalId = s.fiscalId || s.fiscalId || '';
      var cliente = customers.find(function(c) { return c.fiscalId === subFiscalId; });
      return {
        id: s.subscriptionId || s.id || subFiscalId,
        cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (subFiscalId || ''),
        tipo: s.productName || (s.products && s.products[0] ? s.products[0].productName : '') || '',
        tarifa: s.productName || (s.products && s.products[0] ? s.products[0].productName : '') || '',
        precio: s.price || (s.products && s.products[0] ? s.products[0].price : 0) || 0,
        estado: s.status || 'active',
        linea: s.fixedNumber || (s.products && s.products[0] ? s.products[0].fixedNumber : '') || '',
        fecha_alta: (s.created || s.createdAt || s.startDate || '').split('T')[0]
      };
    });

    res.render('isp/contratos', { title: 'Contratos', contratos: contratos });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.get('/create', (req, res) => {
  try {
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();
    const tarifas = db.prepare('SELECT * FROM isp_tarifas WHERE activo=1').all();
    res.render('isp/contratos-create', { title: 'Nuevo Contrato', clientes, tarifas, contrato: {}, errors: [] });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/create', (req, res) => {
  try {
    db.prepare('INSERT INTO isp_contratos (client_id, tipo, producto, tarifa, precio, descuento, permanencia_meses, fecha_alta, linea, iccid, pin, puk, notas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.body.client_id, req.body.tipo, req.body.producto || '', req.body.tarifa || '', parseFloat(req.body.precio || 0), parseFloat(req.body.descuento || 0), parseInt(req.body.permanencia_meses || 0), req.body.fecha_alta || null, req.body.linea || '', req.body.iccid || '', req.body.pin || '', req.body.puk || '', req.body.notas || '');
    res.redirect('/isp/contratos');
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/:id', async (req, res) => {
  try {
    // Try local first
    var contrato = null;
    try { contrato = db.prepare('SELECT c.*, cl.nombre as cliente_nombre, cl.dni_nif, cl.telefono, cl.email FROM isp_contratos c LEFT JOIN clients cl ON c.client_id=cl.id WHERE c.id=?').get(req.params.id); } catch(e) {}
    
    if (!contrato) {
      // Try API - fetch subscriptions and find by id
      var api = LikesAPI.getApiInstance();
      var customers = [];
      try { customers = await api.getCustomers(); } catch(e) {}
      var fiscalIds = customers.map(function(c) { return c.fiscalId; }).filter(Boolean).slice(0, 10);
      for (var fid of fiscalIds) {
        try {
          var data = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=264');
          var items = Array.isArray(data) ? data : [];
          var found = items.find(function(s) { return String(s.subscriptionId || s.id) === req.params.id; });
          if (found) {
            var cliente = customers.find(function(c) { return c.fiscalId === (found.fiscalId || fid); });
            contrato = {
              id: found.subscriptionId || found.id,
              cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : fid,
              tipo: found.productName || '',
              tarifa: found.productName || '',
              precio: found.price || 0,
              estado: found.status || 'active',
              linea: found.fixedNumber || '',
              fecha_alta: (found.created || '').split('T')[0],
              dni_nif: cliente ? cliente.fiscalId : '',
              telefono: cliente ? cliente.contactPhone : '',
              email: cliente ? cliente.email : ''
            };
            break;
          }
        } catch(e) {}
      }
    }

    if (!contrato) return res.status(404).send('No encontrado');
    res.render('isp/contratos-view', { title: 'Contrato #' + contrato.id, contrato });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.post('/:id/estado', (req, res) => {
  try { db.prepare('UPDATE isp_contratos SET estado=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(req.body.estado, req.params.id); res.json({ ok: true }); } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router;
