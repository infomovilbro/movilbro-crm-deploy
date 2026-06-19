const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let surveys = [];
    try { surveys = await api.getSurveys(); } catch {}
    const charts = { scores: { labels: [], data: [] }, categories: { labels: [], data: [] }, monthly: { labels: [], data: [] } };
    if (surveys.length > 0) {
      const scoreCounts = [0, 0, 0, 0, 0];
      const catMap = {};
      const monthMap = {};
      surveys.forEach(s => {
        const sc = parseInt(s.score || s.puntuacion || s.rating || 0, 10);
        if (sc >= 1 && sc <= 5) scoreCounts[sc - 1]++;
        const cat = s.title || s.titulo || s.name || 'Sin categoría';
        catMap[cat] = (catMap[cat] || 0) + 1;
        const d = new Date(s.date || s.fecha);
        if (!isNaN(d.getTime())) {
          const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          monthMap[key] = (monthMap[key] || 0) + 1;
        }
      });
      charts.scores = { labels: ['1', '2', '3', '4', '5'], data: scoreCounts };
      const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
      charts.categories = { labels: catEntries.map(e => e[0]), data: catEntries.map(e => e[1]) };
      const monthEntries = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));
      charts.monthly = { labels: monthEntries.map(e => e[0]), data: monthEntries.map(e => e[1]) };
    }
    res.render('surveys/index', { title: 'Encuestas', surveys, charts, layout: 'layout' });
  } catch (err) {
    const empty = { scores: { labels: [], data: [] }, categories: { labels: [], data: [] }, monthly: { labels: [], data: [] } };
    res.render('surveys/index', { title: 'Encuestas', surveys: [], charts: empty, error: err.message, layout: 'layout' });
  }
});

module.exports = router;
