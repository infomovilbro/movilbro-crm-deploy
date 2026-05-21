const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');

router.get('/', async (req, res) => {
  try {
    const api = LikesAPI.getApiInstance();
    let surveys = [];
    try { surveys = await api.getSurveys(); } catch {}
    res.render('surveys/index', { title: 'Encuestas', surveys, layout: 'layout' });
  } catch (err) {
    res.render('surveys/index', { title: 'Encuestas', surveys: [], error: err.message, layout: 'layout' });
  }
});

module.exports = router;
