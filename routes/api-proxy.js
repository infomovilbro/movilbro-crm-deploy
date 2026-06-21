const express = require('express');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();

async function getAllSubscriptions(api) {
  const customers = await api.getCustomers();
  const fiscalIds = customers.map(c => c.fiscalId).filter(Boolean);
  const allSubs = [];
  const batchSize = 10;
  for (let i = 0; i < fiscalIds.length; i += batchSize) {
    const batch = fiscalIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(fid =>
        api.request('GET', `/subscriptions?fiscalId=${encodeURIComponent(fid)}&brand_id=${api.brandId}`)
          .then(data => api.extractData(data))
      )
    );
    results.forEach(r => {
      if (r.status === 'fulfilled' && Array.isArray(r.value)) {
        allSubs.push(...r.value);
      }
    });
  }
  return allSubs;
}

router.all('/*', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    const token = await api.getToken();

    let endpoint = req.url;
    const isSubscriptions = /^\/subscriptions/i.test(endpoint);
    const fiscalIdMatch = endpoint.match(/[?&]fiscalId=([^&]*)/);

    if (isSubscriptions && (!fiscalIdMatch || fiscalIdMatch[1] === '')) {
      // Fallback: iterate all customers
      const result = await getAllSubscriptions(api);
      return res.json(result);
    }

    const hasBrandId = /[?&]brand_id=/.test(endpoint);
    if (fiscalIdMatch && fiscalIdMatch[1] === '') {
      endpoint = endpoint.replace(/[?&]fiscalId=[^&]*/, '');
    }
    if (!hasBrandId) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint += `${sep}brand_id=${api.brandId}`;
    }

    const axios = require('axios');
    const config = {
      method: req.method,
      url: `${api.apiUrl}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      config.data = req.body;
    }

    const response = await axios(config);
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: error.message };
    res.status(status).json(data);
  }
});

module.exports = router;
