const express = require('express');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const raw = await api.request('GET', '/getBrandResources');
    const resources = Array.isArray(raw) ? raw : (raw.data || raw.resources || raw.results || []);

    const categoryCounts = {};
    const monthCounts = {};
    resources.forEach(cat => {
      const docs = (cat.folders || []).reduce((sum, f) => sum + (f.documents || []).length, 0);
      const key = cat.title || 'Otros';
      categoryCounts[key] = (categoryCounts[key] || 0) + docs;
      (cat.folders || []).forEach(f => {
        if (f.title) {
          monthCounts[f.title] = (monthCounts[f.title] || 0) + (f.documents || []).length;
        }
      });
    });

    res.render('resources/index', {
      title: 'Recursos',
      resources,
      categoryCounts,
      monthCounts,
      layout: 'layout'
    });
  } catch (err) {
    console.error('Error fetching resources:', err.message);
    res.render('resources/index', {
      title: 'Recursos',
      resources: [],
      categoryCounts: {},
      monthCounts: {},
      layout: 'layout'
    });
  }
});

router.get('/download', requireAuth, async (req, res) => {
  try {
    const { path } = req.query;
    if (!path) return res.status(400).json({ error: 'path required' });
    const api = LikesAPI.getApiInstance();
    const result = await api.request('GET', '/getBrandResource?path=' + encodeURIComponent(path));
    const url = result.url || result.downloadUrl || result.download_url || (typeof result === 'string' ? result : null);
    if (url) return res.redirect(url);
    res.status(500).json({ error: 'No download URL returned' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
