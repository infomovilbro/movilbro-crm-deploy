const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.use(requireAuth);
router.use('/dashboard', require('./isp/dashboard'));
router.use('/panel-mando', require('./isp/dashboard'));
router.use('/contratos', require('./isp/contratos'));
router.use('/portabilidades', require('./isp/portabilidades'));
router.use('/workflows', require('./isp/workflows'));
router.use('/descuentos', require('./isp/descuentos'));
router.use('/permanencias', require('./isp/permanencias'));
router.use('/incidencias', require('./isp/incidencias'));
router.use('/tareas', require('./isp/tareas'));
router.use('/tickets', require('./isp/tickets'));
router.use('/documentos', require('./isp/documentos'));
router.use('/plantillas', require('./isp/plantillas'));
router.use('/campanas', require('./isp/campanas'));
router.use('/eventos', require('./isp/eventos'));
router.use('/equipos', require('./isp/equipos'));
router.use('/articulos', require('./isp/articulos'));
router.use('/listados', require('./isp/listados'));
router.use('/clientes', require('./isp/clientes'));
router.use('/facturacion', require('./isp/facturacion'));
router.use('/facturas', require('./isp/facturacion'));
router.use('/cdrs', require('./isp/cdrs'));
router.use('/nube', require('./isp/nube'));

module.exports = router;
