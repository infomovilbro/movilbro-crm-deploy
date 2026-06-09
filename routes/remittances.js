const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let remittances = [];
    try { remittances = await api.getRemittances(); } catch {}
    const statusCounts = { COMPLETED: 0, PENDING: 0, FAILED: 0, OTHER: 0 };
    const amountByStatus = { COMPLETED: 0, PENDING: 0, FAILED: 0, OTHER: 0 };
    const monthCounts = {};
    const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    remittances.forEach(r => {
      const st = (r.status || '').toUpperCase();
      const amt = parseFloat(r.amount || r.importe) || 0;
      if (st === 'PAID' || st === 'COMPLETED') { statusCounts.COMPLETED++; amountByStatus.COMPLETED += amt; }
      else if (st === 'PENDING') { statusCounts.PENDING++; amountByStatus.PENDING += amt; }
      else if (st === 'FAILED' || st === 'CANCELED') { statusCounts.FAILED++; amountByStatus.FAILED += amt; }
      else { statusCounts.OTHER++; amountByStatus.OTHER += amt; }
      const d = new Date(r.date || r.fecha);
      if (!isNaN(d.getTime())) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        monthCounts[key] = (monthCounts[key] || 0) + 1;
      }
    });
    const sortedMonths = Object.keys(monthCounts).sort();
    res.render('remittances/index', {
      title: 'Remesas', remittances, layout: 'layout',
      chartStatus: {
        labels: ['Completadas', 'Pendientes', 'Fallidas', 'Otras'],
        data: [statusCounts.COMPLETED, statusCounts.PENDING, statusCounts.FAILED, statusCounts.OTHER]
      },
      chartMonthly: {
        labels: sortedMonths.map(m => { const p = m.split('-'); return monthNames[parseInt(p[1],10)-1] + ' ' + p[0]; }),
        data: sortedMonths.map(m => monthCounts[m])
      },
      chartAmountByStatus: {
        labels: ['Completadas', 'Pendientes', 'Fallidas', 'Otras'],
        data: [amountByStatus.COMPLETED, amountByStatus.PENDING, amountByStatus.FAILED, amountByStatus.OTHER].map(v => Math.round(v * 100) / 100)
      }
    });
  } catch (err) {
    res.render('remittances/index', {
      title: 'Remesas', remittances: [], error: err.message, layout: 'layout',
      chartStatus: { labels: [], data: [] },
      chartMonthly: { labels: [], data: [] },
      chartAmountByStatus: { labels: [], data: [] }
    });
  }
});

module.exports = router;
