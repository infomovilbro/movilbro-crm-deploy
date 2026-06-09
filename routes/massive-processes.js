const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const processes = await api.getProcesses();

    const typeLabels = {
      SIM_CHANGE: 'Cambio SIM',
      PRODUCT_CHANGE: 'Cambio Producto',
      TITULAR_CHANGE: 'Cambio Titular',
      CREATE_SHARED_GROUP: 'Grupo Compartido',
      ADD_FIXED_IP: 'IP Fija',
      ADD_MULTISIM: 'MultiSIM',
      SMS_MASSIVE: 'SMS Masivo'
    };

    const byType = {};
    const byStatus = {};
    const byMonth = {};

    (processes || []).forEach(p => {
      const t = (p.type || 'OTRO').toUpperCase();
      byType[t] = (byType[t] || 0) + 1;

      const s = (p.status || 'DESCONOCIDO').toUpperCase();
      byStatus[s] = (byStatus[s] || 0) + 1;

      const d = new Date(p.changeDate || p.fecha_cambio);
      if (!isNaN(d.getTime())) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        byMonth[key] = (byMonth[key] || 0) + 1;
      }
    });

    const sortedMonths = Object.keys(byMonth).sort();

    const charts = {
      byType: { labels: Object.keys(byType).map(k => typeLabels[k] || k), data: Object.values(byType) },
      byStatus: { labels: Object.keys(byStatus), data: Object.values(byStatus) },
      byMonth: { labels: sortedMonths, data: sortedMonths.map(m => byMonth[m]) }
    };

    res.render('massive-processes/index', {
      title: 'Procesos Masivos',
      processes: processes || [],
      charts,
      layout: 'layout'
    });
  } catch (err) {
    const empty = { byType: { labels: [], data: [] }, byStatus: { labels: [], data: [] }, byMonth: { labels: [], data: [] } };
    res.render('massive-processes/index', {
      title: 'Procesos Masivos',
      processes: [],
      charts: empty,
      error: err.message,
      layout: 'layout'
    });
  }
});

module.exports = router;
