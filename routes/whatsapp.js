const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  var phone = (req.query.phone || '').replace(/[^0-9]/g, '');
  if (phone) {
    res.redirect('https://web.whatsapp.com/send?phone=34' + phone);
  } else {
    res.redirect('/tienda');
  }
});

module.exports = router;
