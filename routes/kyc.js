const express = require('express');
const { db } = require('../database');
const LikesAPI = require('../likes-api');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const kycUploads = path.join(__dirname, '..', 'public', 'uploads', 'kyc');
if (!fs.existsSync(kycUploads)) fs.mkdirSync(kycUploads, { recursive: true });

const upload = multer({ dest: kycUploads });

function getApi() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  return new LikesAPI({ apiUrl: c.likes_api_url, email: c.likes_client_id, password: c.likes_client_secret, brandId: c.likes_brand_id });
}

// GET /kyc/:token - main KYC page (public, no auth)
router.get('/:token', async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE token = ?').get(req.params.token);
    if (!orden) return res.status(404).send('Enlace no válido o expirado');

    const datos = JSON.parse(orden.datos_cliente || '{}');
    const producto = JSON.parse(orden.datos_producto || '{}');

    const empresaNombre = db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value || 'Movilbro';
    const empresaLogo = db.prepare("SELECT value FROM settings WHERE key='empresa_logo'").get()?.value || '';

    // Track email open
    db.prepare('UPDATE altas_ordenes SET email_leido = 1, email_veces_leido = email_veces_leido + 1, updated_at = CURRENT_TIMESTAMP WHERE token = ?').run(req.params.token);

    const paso = orden.kyc_docs_subidos >= 2 ? 2 : 1;

    res.render('altas/kyc', {
      title: 'Verificación - ' + empresaNombre,
      layout: false,
      token: req.params.token,
      orden,
      datos,
      producto,
      paso,
      empresaNombre,
      empresaLogo,
      kycCompletado: orden.kyc_completado,
      kycDocsSubidos: orden.kyc_docs_subidos,
      kycContratoFirmado: orden.kyc_contrato_firmado
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error: ' + error.message);
  }
});

// POST /kyc/:token/subir-doc - upload KYC document (photo)
router.post('/:token/subir-doc', upload.single('file'), async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE token = ?').get(req.params.token);
    if (!orden) return res.status(404).json({ ok: false, error: 'Enlace no válido' });

    const { tipo } = req.body;
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se recibió archivo' });

    const api = getApi();
    const datos = JSON.parse(orden.datos_cliente || '{}');

    // Re-fetch customer to get upload URLs
    let customers = await api.getCustomers();
    let custArr = Array.isArray(customers) ? customers : [];
    let customer = custArr.find(c => c.fiscalId === datos.dni);
    if (!customer) return res.status(404).json({ ok: false, error: 'Cliente no encontrado en API' });

    const docs = customer.documentation || customer.documents || [];
    const docInfo = docs.find(d => d.documentType === tipo || d.type === tipo);
    if (!docInfo || !docInfo.uploadURL) return res.status(400).json({ ok: false, error: 'No hay URL de subida para ' + tipo });

    // Upload to Likes Telecom API
    const fileBuf = fs.readFileSync(req.file.path);
    const axios = require('axios');
    await axios.put(docInfo.uploadURL, fileBuf, {
      headers: { 'Content-Type': req.file.mimetype || 'image/jpeg' }
    });

    // Save record
    db.prepare('INSERT INTO altas_kyc_docs (orden_id, tipo, archivo, upload_url, download_url, estado) VALUES (?, ?, ?, ?, ?, ?)').run(
      orden.id, tipo, req.file.filename, docInfo.uploadURL, docInfo.downloadURL || '', 'subido'
    );

    // Update count
    const count = db.prepare('SELECT COUNT(*) as c FROM altas_kyc_docs WHERE orden_id = ? AND estado = ?').get(orden.id, 'subido').c;
    db.prepare('UPDATE altas_ordenes SET kyc_docs_subidos = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(count, orden.id);

    // Clean up temp file
    try { fs.unlinkSync(req.file.path); } catch(e) {}

    res.json({ ok: true, message: 'Documento subido correctamente', count, paso: count >= 2 ? 2 : 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /kyc/:token/firmar - save contract signature
router.post('/:token/firmar', async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE token = ?').get(req.params.token);
    if (!orden) return res.status(404).json({ ok: false, error: 'Enlace no válido' });

    const { firma } = req.body;
    if (!firma) return res.status(400).json({ ok: false, error: 'No se recibió la firma' });

    // Decode base64 signature and save
    const matches = firma.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
    if (!matches) return res.status(400).json({ ok: false, error: 'Formato de firma no válido' });

    const sigBuf = Buffer.from(matches[2], 'base64');
    const sigFilename = 'firma_' + orden.token + '_' + Date.now() + '.png';
    const sigPath = path.join(kycUploads, sigFilename);
    fs.writeFileSync(sigPath, sigBuf);

    // Upload signed document if possible
    let contratoSubido = false;
    try {
      const api = getApi();
      const datos = JSON.parse(orden.datos_cliente || '{}');
      let customers = await api.getCustomers();
      let custArr = Array.isArray(customers) ? customers : [];
      let customer = custArr.find(c => c.fiscalId === datos.dni);
      if (customer) {
        // Try to get signed contract upload URL if digitalSignature is false
        // For digital signature it's handled by API automatically
        contratoSubido = true;
      }
    } catch(e) {}

    db.prepare("UPDATE altas_ordenes SET kyc_contrato_firmado = 1, kyc_completado = 1, estado = 'pendiente_aprobacion', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(orden.id);

    res.json({ ok: true, message: 'Contrato firmado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /kyc/contrato/:token - view contract preview
router.get('/contrato/:token', async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE token = ?').get(req.params.token);
    if (!orden) return res.status(404).send('No encontrado');

    const datos = JSON.parse(orden.datos_cliente || '{}');
    const producto = JSON.parse(orden.datos_producto || '{}');
    const pago = JSON.parse(orden.datos_pago || '{}');

    const empresaNombre = db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value || 'Movilbro';
    const empresaCif = db.prepare("SELECT value FROM settings WHERE key='empresa_cif'").get()?.value || '';
    const empresaDireccion = db.prepare("SELECT value FROM settings WHERE key='empresa_direccion'").get()?.value || '';
    const empresaTelefono = db.prepare("SELECT value FROM settings WHERE key='empresa_telefono'").get()?.value || '';

    const api = getApi();
    let productName = producto.producto_id || '';
    try {
      const products = await api.getProducts();
      const prodArr = Array.isArray(products) ? products : [];
      const prod = prodArr.find(p => String(p.id) === String(producto.producto_id) || String(p.productId) === String(producto.producto_id));
      if (prod) productName = prod.productName || prod.name || productName;
    } catch(e) {}

    res.render('altas/contrato-preview', {
      title: 'Contrato',
      layout: false,
      datos, producto, pago, orden,
      empresaNombre, empresaCif, empresaDireccion, empresaTelefono,
      productName,
      hoy: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    });
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
});

// GET /api/kyc/tracking/:token.gif - tracking pixel (1x1 transparent)
router.get('/tracking/:token.gif', async (req, res) => {
  try {
    const token = req.params.token.replace('.gif', '');
    db.prepare('UPDATE altas_ordenes SET email_leido = 1, email_veces_leido = email_veces_leido + 1, updated_at = CURRENT_TIMESTAMP WHERE token = ?').run(token);
  } catch(e) {}
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

module.exports = router;
