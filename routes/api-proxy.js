const express = require('express');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();

function getApiFromDb() {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const config = {};
  settings.forEach(s => config[s.key] = s.value);
  return {
    apiUrl: config.likes_api_url || 'https://api.likestelecom.com',
    email: config.likes_client_id,
    password: config.likes_client_secret,
    brandId: config.likes_brand_id
  };
}

async function getAllSubscriptions(api, creds) {
  const customers = await api.getCustomers();
  const fiscalIds = customers.map(c => c.fiscalId).filter(Boolean);
  const allSubs = [];
  const batchSize = 10;
  for (let i = 0; i < fiscalIds.length; i += batchSize) {
    const batch = fiscalIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(fid =>
        api.request('GET', `/subscriptions?fiscalId=${encodeURIComponent(fid)}&brand_id=${creds.brandId}`)
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
    const creds = getApiFromDb();
    const api = new LikesAPI(creds);
    const token = await api.getToken();

    let endpoint = req.url;
    const isSubscriptions = /^\/subscriptions/i.test(endpoint);
    const fiscalIdMatch = endpoint.match(/[?&]fiscalId=([^&]*)/);

    if (isSubscriptions && (!fiscalIdMatch || fiscalIdMatch[1] === '')) {
      // First try: direct brand-level call (faster)
      try {
        const direct = await api.request('GET', `/subscriptions?brand_id=${creds.brandId}`);
        const items = await api.extractData(direct);
        if (Array.isArray(items) && items.length > 0) return res.json(items);
      } catch {}
      // Fallback: iterate all customers (slower but reliable)
      const result = await getAllSubscriptions(api, creds);
      return res.json(result);
    }

    const hasBrandId = /[?&]brand_id=/.test(endpoint);
    if (fiscalIdMatch && fiscalIdMatch[1] === '') {
      endpoint = endpoint.replace(/[?&]fiscalId=[^&]*/, '');
    }
    if (!hasBrandId) {
      const sep = endpoint.includes('?') ? '&' : '?';
      endpoint += `${sep}brand_id=${creds.brandId}`;
    }

    const axios = require('axios');
    const config = {
      method: req.method,
      url: `${creds.apiUrl}${endpoint}`,
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
