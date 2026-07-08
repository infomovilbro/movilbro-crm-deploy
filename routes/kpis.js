const express = require('express');
const router = express.Router();
const { getStats } = require('./stats');

router.get('/', async (req, res) => {
  try {
    const stats = await getStats();
    res.render('kpis/index', {
      title: 'KPIs',
      stats,
      layout: 'layout',
      kpiDebug: {
        generatedAt: new Date().toISOString(),
        hasStats: !!stats
      }
    });
  } catch (err) {
    res.render('kpis/index', {
      title: 'KPIs',
      stats: null,
      error: err.message,
      layout: 'layout',
      kpiDebug: {
        generatedAt: new Date().toISOString(),
        hasStats: false,
        error: err.message
      }
    });
  }
});

module.exports = router;
