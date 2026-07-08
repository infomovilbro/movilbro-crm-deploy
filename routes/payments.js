const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let payments = [];
    try { payments = await api.getPayments(); } catch {}
    res.render('payments/index', { title: 'Pagos', payments, layout: 'layout' });
  } catch (err) {
    res.render('payments/index', { title: 'Pagos', payments: [], error: err.message, layout: 'layout' });
  }
});

module.exports = router;
