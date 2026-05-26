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

module.exports = router;
