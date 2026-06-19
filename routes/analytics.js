const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getAllStats } = require('./stats');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const stats = await getAllStats();
    res.render('analytics', { title: 'Analítica', stats, error: null });
  } catch (error) {
    res.render('analytics', { title: 'Analítica', stats: null, error: error.message });
  }
});

module.exports = router;
