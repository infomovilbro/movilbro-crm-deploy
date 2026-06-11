const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  res.redirect('/clientes');
});

router.get('/detalle/:id', async (req, res) => {
  res.redirect('/clientes/' + req.params.id);
});

module.exports = router;
