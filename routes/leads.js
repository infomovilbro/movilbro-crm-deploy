const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let leads = [];
    try { leads = await api.getLeads(); } catch {}
    res.render('leads/index', { title: 'Leads', leads, layout: 'layout' });
  } catch (err) {
    res.render('leads/index', { title: 'Leads', leads: [], error: err.message, layout: 'layout' });
  }
});

module.exports = router;
