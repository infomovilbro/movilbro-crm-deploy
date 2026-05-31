const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => res.redirect('/isp/incidencias'));

module.exports = router;
