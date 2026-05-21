const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let remittances = [];
    try { remittances = await api.getRemittances(); } catch {}
    res.render('remittances/index', { title: 'Remesas', remittances, layout: 'layout' });
  } catch (err) {
    res.render('remittances/index', { title: 'Remesas', remittances: [], error: err.message, layout: 'layout' });
  }
});

module.exports = router;
