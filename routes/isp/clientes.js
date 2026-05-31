const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    var localCount = 0;
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM clients').get(); localCount = c.cnt; } catch(e) {}
    
    if (localCount > 0) {
      var ispClientes = db.prepare('SELECT DISTINCT cl.* FROM clients cl INNER JOIN isp_contratos c ON c.client_id=cl.id ORDER BY cl.nombre').all();
      if (ispClientes.length > 0) return res.render('isp/clientes', { title: 'Clientes ISP', clientes: ispClientes });
    }

    var api = LikesAPI.getApiInstance();
    var customers = [];
    try { customers = await api.getCustomers(); } catch(e) {}

    var clientes = (Array.isArray(customers) ? customers : []).map(function(c) {
      return {
        id: c.fiscalId || c.id,
        nombre: c.name + ' ' + (c.firstSurname || ''),
        dni_nif: c.fiscalId || '',
        email: c.email || '',
        telefono: c.contactPhone || '',
        direccion: c.billingAddress ? (c.billingAddress.street + ' ' + (c.billingAddress.streetNumber || '') + ', ' + c.billingAddress.cityName) : '',
        ciudad: c.billingAddress ? c.billingAddress.cityName : '',
        tipo_cliente: c.customerType || 'particular'
      };
    });

    res.render('isp/clientes', { title: 'Clientes ISP', clientes });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.get('/detalle/:id', async (req, res) => {
  try {
    var clientId = req.params.id;

    var cliente = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
    if (!cliente) return res.redirect('/isp/clientes');

    var contratos = db.prepare('SELECT * FROM isp_contratos WHERE client_id = ? ORDER BY created_at DESC').all(clientId);

    var lineas = contratos.map(function(c) {
      return {
        linea: c.linea || '',
        producto: c.producto || c.tarifa || '',
        estado: c.estado || 'desconocido',
        iccid: c.iccid || '',
        pin: c.pin || '',
        puk: c.puk || '',
        contrato_id: c.id,
        fecha_alta: c.fecha_alta
      };
    });

    var apiSubs = [];
    try {
      var api = LikesAPI.getApiInstance();
      if (cliente.dni_nif) {
        var raw = await api.getSubscriptions(cliente.dni_nif);
        var allSubs = Array.isArray(raw) ? raw : [];
        apiSubs = allSubs.map(function(sub) {
          var prod = (sub.products && sub.products[0]) || {};
          return {
            linea: prod.lineNumber || prod.line || prod.phone || sub.phone || sub.line || '',
            producto: prod.productName || sub.productName || sub.product || sub.producto || '',
            estado: (prod.status || sub.status || sub.estado || 'activa').toLowerCase(),
            fecha_alta: sub.created || sub.sellDate || sub.created_at || sub.fecha_alta || sub.startDate || null
          };
        });
      }
    } catch (e) {
      console.error('Error fetching API subscriptions for client:', e.message);
    }

    var altasOrdenes = db.prepare('SELECT * FROM altas_ordenes WHERE client_id = ? ORDER BY created_at DESC').all(clientId);

    if (altasOrdenes.length === 0 && cliente.dni_nif) {
      try {
        var ordenesPorDNI = db.prepare("SELECT * FROM altas_ordenes WHERE datos_cliente LIKE ? ORDER BY created_at DESC LIMIT 5").all('%' + cliente.dni_nif + '%');
        if (ordenesPorDNI.length > 0) altasOrdenes = ordenesPorDNI;
      } catch(e) {}
    }

    var kycDocsPorOrden = {};
    if (altasOrdenes.length > 0) {
      altasOrdenes.forEach(function(o) {
        var docs = db.prepare('SELECT * FROM altas_kyc_docs WHERE orden_id = ? ORDER BY created_at').all(o.id);
        kycDocsPorOrden[o.id] = docs;
      });
    }

    var documentos = db.prepare('SELECT * FROM isp_documentos WHERE client_id = ? ORDER BY created_at DESC').all(clientId);

    var tickets = db.prepare('SELECT * FROM tickets WHERE client_id = ? ORDER BY created_at DESC LIMIT 5').all(clientId);

    res.render('isp/cliente-detalle', {
      title: 'Cliente ISP: ' + cliente.nombre,
      cliente: cliente,
      contratos: contratos,
      lineas: lineas,
      apiSubs: apiSubs,
      altasOrdenes: altasOrdenes,
      kycDocsPorOrden: kycDocsPorOrden,
      documentos: documentos,
      tickets: tickets
    });
  } catch (e) {
    console.error(e);
    res.status(500).send('Error: ' + e.message);
  }
});

module.exports = router;
