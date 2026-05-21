const express = require('express');
const router = express.Router();
const LikesAPI = require('../likes-api');
const { db } = require('../database');

const { getApiInstance } = LikesAPI;

async function apiData(fn, fallback = []) {
  try {
    const api = getApiInstance();
    const data = await fn(api);
    return Array.isArray(data) && data.length ? data : fallback;
  } catch { return fallback; }
}

// ---- PORTABILIDADES ----
router.get('/portabilities', async (req, res) => {
  try {
    const portabilities = await apiData(api => api.getPortabilities());
    res.render('aftersales/portabilities', { title: 'Portabilidades', portabilities, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/portabilities', { title: 'Portabilidades', portabilities: [], error: err.message, layout: 'layout' });
  }
});

// ---- INSTALACIONES ----
router.get('/installations', async (req, res) => {
  try {
    const installations = await apiData(api => api.getInstallations());
    res.render('aftersales/installations', { title: 'Instalaciones', installations, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/installations', { title: 'Instalaciones', installations: [], error: err.message, layout: 'layout' });
  }
});

// ---- ÓRDENES ----
router.get('/orders', async (req, res) => {
  try {
    const apiOrders = await apiData(api => api.getOrders(), []);
    const localOrders = db.prepare(`
      SELECT o.*, c.nombre as cliente_nombre 
      FROM orders o JOIN clients c ON o.client_id = c.id 
      ORDER BY o.created_at DESC LIMIT 50
    `).all();
    const orders = apiOrders.length ? apiOrders : localOrders;
    res.render('aftersales/orders', { title: 'Órdenes', orders, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/orders', { title: 'Órdenes', orders: [], error: err.message, layout: 'layout' });
  }
});

// ---- ENVÍOS ----
router.get('/shipments', async (req, res) => {
  try {
    const shipments = await apiData(api => api.getShipments());
    res.render('aftersales/shipments', { title: 'Envíos', shipments, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/shipments', { title: 'Envíos', shipments: [], error: err.message, layout: 'layout' });
  }
});

// ---- PENALIZACIONES ROUTER ----
router.get('/router-penalties', async (req, res) => {
  try {
    const penalties = await apiData(api => api.getRouterPenalties());
    res.render('aftersales/router-penalties', { title: 'Penalizaciones', penalties, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/router-penalties', { title: 'Penalizaciones', penalties: [], error: err.message, layout: 'layout' });
  }
});

// ---- PROCESOS ----
router.get('/processes', async (req, res) => {
  try {
    const processes = await apiData(api => api.getProcesses());
    res.render('aftersales/processes', { title: 'Procesos', processes, layout: 'layout' });
  } catch (err) {
    res.render('aftersales/processes', { title: 'Procesos', processes: [], error: err.message, layout: 'layout' });
  }
});

module.exports = router;
