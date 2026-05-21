const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  const resources = [];
  res.render('resources/index', { title: 'Recursos', resources, layout: 'layout' });
});

module.exports = router;
