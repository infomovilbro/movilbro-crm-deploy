const express = require('express');
const { getApiInstance } = require('../likes-api');
const router = express.Router();

router.get('/all-subscriptions', async (req, res) => {
  try {
    const api = getApiInstance();
    const customers = await api.getCustomers();
    const fiscalIds = customers
      .map(c => c.fiscalId)
      .filter(Boolean);

    const allSubs = [];
    const batchSize = 10;

    for (let i = 0; i < fiscalIds.length; i += batchSize) {
      const batch = fiscalIds.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map(fid =>
          api.request('GET', `/subscriptions?fiscalId=${encodeURIComponent(fid)}`)
            .then(data => api.extractData(data))
        )
      );
      results.forEach(r => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          allSubs.push(...r.value);
        }
      });
    }

    res.json(allSubs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const api = getApiInstance();
    const data = await api.getCustomers();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/portabilities', async (req, res) => {
  try {
    const api = getApiInstance();
    const data = await api.getPortabilities();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products', async (req, res) => {
  try {
    const api = getApiInstance();
    const data = await api.getProducts();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
