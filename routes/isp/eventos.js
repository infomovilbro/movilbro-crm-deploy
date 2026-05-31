const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const { getApiInstance } = require('../../likes-api');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const eventos = db.prepare('SELECT e.*, cl.nombre as cliente_nombre FROM isp_eventos e LEFT JOIN clients cl ON e.client_id=cl.id ORDER BY e.fecha_inicio DESC').all();
    const clientes = db.prepare('SELECT id, nombre FROM clients ORDER BY nombre').all();

    var portasEvents = [], altasEvents = [], bajasEvents = [];

    try {
      var api = getApiInstance();

      // Portabilities
      var portas = await api.getPortabilities();
      var portasByDay = {};
      (portas || []).forEach(function(p) {
        var d = (p.createdAt || p.created_at || p.date || '').substring(0, 10);
        if (d) portasByDay[d] = (portasByDay[d] || 0) + 1;
      });
      portasEvents = Object.keys(portasByDay).map(function(d) {
        return { title: '\uD83D\uDD01 ' + portasByDay[d] + ' portabilidades', start: d, allDay: true, color: '#ffc107', textColor: '#000', display: 'auto' };
      });

      // Orders (altas - new activations)
      var orders = await api.getOrders();
      var altasByDay = {};
      (orders || []).forEach(function(o) {
        if (o.type === 'alta' || o.tipo === 'alta' || o.status === 'completed' || !o.type) {
          var d = (o.createdAt || o.created_at || o.date || '').substring(0, 10);
          if (d) altasByDay[d] = (altasByDay[d] || 0) + 1;
        }
      });
      altasEvents = Object.keys(altasByDay).map(function(d) {
        return { title: '\uD83D\uDCC8 ' + altasByDay[d] + ' altas', start: d, allDay: true, color: '#28a745' };
      });

      // Bajas (cancellations)
      try {
        var subs = await api.getSubscriptions();
        var bajasByDay = {};
        (subs || []).forEach(function(s) {
          if (s.status === 'cancelled' || s.estado === 'baja' || s.deleted_at) {
            var d = (s.cancelledAt || s.deleted_at || s.updatedAt || '').substring(0, 10);
            if (d) bajasByDay[d] = (bajasByDay[d] || 0) + 1;
          }
        });
        bajasEvents = Object.keys(bajasByDay).map(function(d) {
          return { title: '\uD83D\uDCC9 ' + bajasByDay[d] + ' bajas', start: d, allDay: true, color: '#dc3545' };
        });
      } catch(e) {}
    } catch(e) {
      console.error('Error fetching API events:', e.message);
    }

    var apiEvents = { portas: portasEvents, altas: altasEvents, bajas: bajasEvents };

    res.render('isp/eventos/index', { title: 'Calendario', eventos, eventosRaw: eventos, clientes, apiEvents: JSON.stringify(apiEvents) });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
