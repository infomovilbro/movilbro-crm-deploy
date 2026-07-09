const express = require('express');
const router = express.Router();
const { db } = require('../database');

// Zona Clientes - login con DNI + telefono
router.get('/', (req, res) => {
  res.render('portal/login', { title: 'Zona Clientes', error: null, success: null });
});

router.post('/acceso', async (req, res) => {
  try {
    var dni = (req.body.dni || '').trim().toUpperCase();
    var telefono = (req.body.telefono || '').trim();
    if (!dni || !telefono) return res.render('portal/login', { title: 'Zona Clientes', error: 'DNI y teléfono requeridos', success: null });
    
    var cliente = db.prepare("SELECT id, nombre, apellidos, dni_nif, email, telefono FROM clients WHERE dni_nif=? AND (telefono=? OR telefono2=?)").get(dni, telefono, telefono);
    // Fallback: buscar en API si no esta en DB local
    if (!cliente) {
      try {
        var LikesAPI = require('./likes-api');
        var api = LikesAPI.getApiInstance();
        var apiCustomers = await api.getCustomers();
        var found = apiCustomers.find(function(c) { return c.fiscalId === dni; });
        if (found) {
          var name = (found.name || '') + ' ' + (found.firstSurname || '');
          cliente = { id: dni, nombre: name, apellidos: '', dni_nif: dni, email: found.email || '', telefono: found.phone || found.contactPhone || '' };
        }
      } catch(e) { console.error('[Portal] API fallback error:', e.message); }
    }
    if (!cliente) return res.render('portal/login', { title: 'Zona Clientes', error: 'Cliente no encontrado. Verifica DNI y teléfono.', success: null });
    
    // Obtener datos del cliente para mostrar
    var facturas = db.prepare("SELECT * FROM isp_facturas WHERE fiscal_id=? ORDER BY periodo DESC").all(dni);
    var contratos = db.prepare("SELECT * FROM isp_contratos WHERE client_id=? ORDER BY fecha_alta DESC").all(cliente.id);
    var incidencias = db.prepare("SELECT * FROM isp_incidencias WHERE client_id=? ORDER BY created_at DESC").all(cliente.id);
    
    res.render('portal/dashboard', {
      title: 'Mi cuenta - ' + cliente.nombre,
      cliente: cliente,
      facturas: facturas,
      contratos: contratos,
      incidencias: incidencias
    });
  } catch(e) {
    res.render('portal/login', { title: 'Zona Clientes', error: 'Error: ' + e.message, success: null });
  }
});

module.exports = router;
