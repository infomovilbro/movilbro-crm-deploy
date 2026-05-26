const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const LikesAPI = require('../../likes-api');
const router = express.Router();

const today = () => new Date().toISOString().split('T')[0];
const getApi = () => LikesAPI.getApiInstance();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    // Local ISP data
    const totalWorkflows = db.prepare('SELECT COUNT(*) as c FROM isp_workflows WHERE activo=1').get();
    const totalTareas = db.prepare('SELECT COUNT(*) as c FROM isp_tareas').get();
    const tareasPend = db.prepare('SELECT COUNT(*) as c FROM isp_tareas WHERE completada=0').get();
    const ingresosHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM isp_caja WHERE fecha=? AND tipo='ingreso'").get(today());
    const gastosHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as t FROM isp_caja WHERE fecha=? AND tipo='gasto'").get(today());
    const campanasActivas = db.prepare("SELECT COUNT(*) as c FROM isp_campanas WHERE estado='activa' AND activo=1").get();

    // API data for contracts and incidences
    var ultimosContratos = [];
    var ultimasIncidencias = [];
    var totalClientesApi = 0;
    var totalContratosApi = 0;
    var contratosActivosApi = 0;
    var incAbiertasApi = 0;

    try {
      const api = getApi();
      const customers = await api.getCustomers();
      totalClientesApi = Array.isArray(customers) ? customers.length : 0;

      // Get subscriptions for each customer (limit to 20 to avoid timeouts)
      var allSubs = [];
      var fiscalIds = (Array.isArray(customers) ? customers : []).map(function(c) { return c.fiscalId; }).filter(Boolean).slice(0, 20);
      var results = await Promise.allSettled(fiscalIds.map(function(fid) {
        return api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=264')
          .then(function(data) { return api.extractData(data); });
      }));
      results.forEach(function(r) {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach(function(s) { allSubs.push(s); });
        }
      });

      if (allSubs.length > 0) {
        var recentSubs = allSubs.slice(-5).reverse();
        var seenFiscalIds = {};
        recentSubs.forEach(function(s) {
          var subFiscalId = s.fiscalId || '';
          if (!seenFiscalIds[subFiscalId]) {
            seenFiscalIds[subFiscalId] = true;
            var cliente = customers.find(function(c) { return c.fiscalId === subFiscalId; });
            ultimosContratos.push({
              id: s.subscriptionId || s.id || subFiscalId,
              cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (subFiscalId || ''),
              tipo: s.productName || (s.products && s.products[0] ? s.products[0].productName : '') || '',
              estado: s.status || 'active',
              fecha_alta: (s.created || s.createdAt || '').split('T')[0]
            });
          }
        });
        totalContratosApi = allSubs.length;
        contratosActivosApi = allSubs.filter(function(s) { return s.status === 'active' || s.status === 'activa'; }).length;
      }

      try {
        const ticketsData = await api.request('GET', '/tickets?brand_id=264&limit=5');
        var ticketList = [];
        if (ticketsData && Array.isArray(ticketsData.tickets)) {
          ticketList = ticketsData.tickets;
        } else if (Array.isArray(ticketsData)) {
          ticketList = ticketsData;
        }
        ultimasIncidencias = ticketList.slice(0, 5).map(function(t) {
          var cliente = customers.find(function(c) { return c.fiscalId === t.fiscalId; });
          return {
            id: t.id || t.ticketId,
            cliente_nombre: cliente ? (cliente.name + ' ' + (cliente.firstSurname || '')) : (t.fiscalId || ''),
            tipo: t.typology || t.type || t.typologyName || '',
            estado: t.status || 'abierta',
            created_at: (t.created || t.createdAt || '').split('T')[0]
          };
        });
        incAbiertasApi = ticketList.filter(function(t) { return t.status === 'open' || t.status === 'abierta'; }).length;
      } catch(e) { console.error('Tickets API error:', e.message); }
    } catch(e) { console.error('API error in ISP dashboard:', e.message); }

    // Local ISP incidencias (from isp_incidencias table)
    var incLocal = db.prepare('SELECT COUNT(*) as c FROM isp_incidencias').get();
    var incAbiertasLocal = db.prepare("SELECT COUNT(*) as c FROM isp_incidencias WHERE estado='abierta'").get();

    res.render('isp/dashboard', {
      title: 'Panel ISP',
      stats: {
        totalWorkflows: totalWorkflows.c,
        totalContratos: totalContratosApi + (totalContratosApi > 0 ? 0 : 0),
        contratosActivos: contratosActivosApi + (contratosActivosApi > 0 ? 0 : 0),
        totalIncidencias: ultimasIncidencias.length + incLocal.c,
        incAbiertas: incAbiertasApi + incAbiertasLocal.c,
        totalTareas: totalTareas.c,
        tareasPend: tareasPend.c,
        ingresosHoy: ingresosHoy.t,
        gastosHoy: gastosHoy.t
      },
      ultimosContratos: ultimosContratos.length > 0 ? ultimosContratos : [],
      ultimasIncidencias: ultimasIncidencias.length > 0 ? ultimasIncidencias : [],
      campanasActivas: campanasActivas.c,
      totalClientes: totalClientesApi
    });
  } catch (e) { console.error(e); res.status(500).send('Error: ' + e.message); }
});

router.get('/panel-mando', (req, res) => {
  try {
    res.render('isp/panel-mando', { title: 'Panel de Mando ISP' });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
