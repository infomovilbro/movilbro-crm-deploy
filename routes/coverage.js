const express = require('express');
const { requireAuth } = require('../middleware/auth');
const LikesAPI = require('../likes-api');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.render('coverage/index', { title: 'Consultar Cobertura', error: null, direccion: '', addresses: null, selectedAddress: null, coverage: null, products: null });
});

router.post('/search', requireAuth, async (req, res) => {
  const { direccion } = req.body;
  if (!direccion) {
    return res.render('coverage/index', { title: 'Consultar Cobertura', error: 'Introduce una dirección', direccion: '', addresses: null, selectedAddress: null, coverage: null, products: null });
  }
  try {
    const api = LikesAPI.getApiInstance();
    const data = await api.request('GET', '/coverage/address?label=' + encodeURIComponent(direccion));
    const addresses = Array.isArray(data) ? data : (data.data || data.results || []);
    res.render('coverage/index', { title: 'Consultar Cobertura', error: addresses.length === 0 ? 'No se encontraron direcciones' : null, direccion, addresses, selectedAddress: null, coverage: null, products: null });
  } catch (err) {
    res.render('coverage/index', { title: 'Consultar Cobertura', error: 'Error al buscar: ' + (err.response?.data?.message || err.message), direccion, addresses: null, selectedAddress: null, coverage: null, products: null });
  }
});

router.post('/check', requireAuth, async (req, res) => {
  const { gescal, sessionId, label } = req.body;
  if (!gescal || !sessionId) {
    return res.render('coverage/index', { title: 'Consultar Cobertura', error: 'Faltan datos de la dirección seleccionada', direccion: label || '', addresses: null, selectedAddress: null, coverage: null, products: null });
  }
  try {
    const api = LikesAPI.getApiInstance();
    let coverage;
    try {
      const buildings = await api.request('GET', '/coverage/buildings?gescal=' + encodeURIComponent(gescal) + '&sessionId=' + encodeURIComponent(sessionId));
      const buildingData = Array.isArray(buildings) ? buildings : (buildings.data || buildings.results || []);
      coverage = await api.request('POST', '/coverage/format-coverage', { gescal, sessionId, buildings: buildingData });
    } catch {
      coverage = await api.request('POST', '/coverage/format-coverage', { gescal, sessionId });
    }
    const items = Array.isArray(coverage) ? coverage : (coverage.data || coverage.results || []);
    const products = coverage.products || coverage.productos || items;
    const hasCoverage = coverage.coverage || coverage.hasCoverage || coverage.disponible || products.length > 0;
    res.render('coverage/index', { title: 'Consultar Cobertura', error: null, direccion: label || '', addresses: null, selectedAddress: { gescal, sessionId, label }, coverage: { ...coverage, hasCoverage }, products: Array.isArray(products) ? products : [] });
  } catch (err) {
    res.render('coverage/index', { title: 'Consultar Cobertura', error: 'Error al verificar cobertura: ' + (err.response?.data?.message || err.message), direccion: label || '', addresses: null, selectedAddress: null, coverage: null, products: null });
  }
});

module.exports = router;
