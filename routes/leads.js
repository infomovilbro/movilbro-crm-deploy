const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let leads = [];
    try { leads = await api.getLeads(); } catch {}
    const charts = { status: { labels: [], data: [] }, sources: { labels: [], data: [] }, monthly: { labels: [], data: [] }, conversion: { labels: [], data: [] } };
    if (leads.length > 0) {
      const converted = leads.filter(l => (l.status || '').toUpperCase() === 'CONVERTED').length;
      const nuevos = leads.filter(l => { const s = (l.status || '').toUpperCase(); return s === 'NEW' || s === 'PENDING'; }).length;
      const lost = leads.filter(l => (l.status || '').toUpperCase() === 'LOST').length;
      charts.status = { labels: ['Convertidos', 'Nuevos/Pendientes', 'Perdidos'], data: [converted, nuevos, lost] };
      const sourceMap = {};
      const monthMap = {};
      const convMonthMap = {};
      const totalMonthMap = {};
      leads.forEach(l => {
        const src = l.source || l.origen || 'Otro';
        sourceMap[src] = (sourceMap[src] || 0) + 1;
        const d = new Date(l.created || l.fecha);
        if (!isNaN(d.getTime())) {
          const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          monthMap[key] = (monthMap[key] || 0) + 1;
          totalMonthMap[key] = (totalMonthMap[key] || 0) + 1;
          if ((l.status || '').toUpperCase() === 'CONVERTED') convMonthMap[key] = (convMonthMap[key] || 0) + 1;
        }
      });
      const sortedSrc = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      charts.sources = { labels: sortedSrc.map(e => e[0]), data: sortedSrc.map(e => e[1]) };
      const monthEntries = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));
      charts.monthly = { labels: monthEntries.map(e => e[0]), data: monthEntries.map(e => e[1]) };
      const convMonths = Object.keys(totalMonthMap).sort();
      charts.conversion = { labels: convMonths, data: convMonths.map(m => totalMonthMap[m] > 0 ? Math.round(((convMonthMap[m] || 0) / totalMonthMap[m]) * 100) : 0) };
    }
    res.render('leads/index', { title: 'Leads', leads, charts, layout: 'layout' });
  } catch (err) {
    const empty = { status: { labels: [], data: [] }, sources: { labels: [], data: [] }, monthly: { labels: [], data: [] }, conversion: { labels: [], data: [] } };
    res.render('leads/index', { title: 'Leads', leads: [], charts: empty, error: err.message, layout: 'layout' });
  }
});

module.exports = router;
