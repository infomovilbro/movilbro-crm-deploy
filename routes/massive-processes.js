const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('massive-processes/index', { title: 'Masivos', processes: [], layout: 'layout' });
});

module.exports = router;
