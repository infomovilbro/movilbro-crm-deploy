const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { db } = require('../../database');
const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  try {
    const noticias = db.prepare('SELECT n.*, u.nombre as user_name FROM isp_noticias n LEFT JOIN users u ON n.user_id=u.id WHERE n.activo=1 ORDER BY n.created_at DESC').all();
    res.render('isp/noticias/index', { title: 'Noticias', noticias });
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

module.exports = router;
