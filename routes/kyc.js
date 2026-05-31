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

function paginaError(titulo, error, mensaje, empresaNombre) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo}</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<style>
  body{background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;min-height:100vh}
  .card-error{max-width:480px;margin:auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);padding:40px;text-align:center}
  .card-error .icono{font-size:64px;margin-bottom:16px}
  .card-error h2{font-size:22px;font-weight:600;margin-bottom:12px;color:#333}
  .card-error p{color:#666;font-size:15px;margin-bottom:8px;line-height:1.5}
  .card-error .btn-contacto{display:inline-block;margin-top:20px;padding:10px 28px;background:#0050A1;color:#fff;text-decoration:none;border-radius:8px;font-size:14px}
</style>
</head>
<body>
  <div class="card-error">
    <div class="icono">⚠️</div>
    <h2>${error}</h2>
    <p>${mensaje}</p>
    <p style="font-size:13px;color:#999">${empresaNombre || 'Movilbro'} - Atención al cliente</p>
  </div>
</body>
</html>`;
}

// GET /kyc/:token - main KYC page (public, no auth)
router.get('/:token', async (req, res) => {
  try {
    const orden = db.prepare('SELECT * FROM altas_ordenes WHERE token = ?').get(req.params.token);
    if (!orden) {
      return res.status(404).send(paginaError(
        'Enlace no válido',
        'Enlace no válido o expirado',
        'El enlace que has utilizado no es válido o ha expirado. Por favor, contacta con nuestro equipo de atención al cliente para que te enviemos uno nuevo.',
        db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value
      ));
    }

    const datos = JSON.parse(orden.datos_cliente || '{}');
    const producto = JSON.parse(orden.datos_producto || '{}');

    const empresaNombre = db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value || 'Movilbro';
    const empresaLogo = db.prepare("SELECT value FROM settings WHERE key='empresa_logo'").get()?.value || '';

    // Track email open
    db.prepare('UPDATE altas_ordenes SET email_leido = 1, email_veces_leido = email_veces_leido + 1, updated_at = CURRENT_TIMESTAMP WHERE token = ?').run(req.params.token);

    // Detección de paso mejorada
    let paso = 1;
    let pasoTexto = 'Verificación de identidad';

    if (orden.kyc_completado || orden.estado === 'completada') {
      paso = 3;
      pasoTexto = 'Proceso completado';
    } else if (orden.kyc_contrato_firmado) {
      paso = 3;
      pasoTexto = 'Contrato firmado';
    } else if (orden.kyc_docs_subidos >= 2) {
      paso = 2;
      pasoTexto = 'Firma del contrato';
    } else if (orden.kyc_docs_subidos === 1) {
      paso = 1;
      pasoTexto = 'Verificación de identidad (1/2 documentos)';
    }

    // Si la orden ya está completada, mostrar pantalla de completado
    if (orden.estado === 'completada') {
      return res.render('altas/kyc', {
        title: 'Completado - ' + empresaNombre,
        layout: false,
        token: req.params.token,
        orden, datos, producto,
        paso: 3,
        pasoTexto: 'Completado',
        empresaNombre,
        empresaLogo,
        kycCompletado: 1,
        kycDocsSubidos: orden.kyc_docs_subidos,
        kycContratoFirmado: orden.kyc_contrato_firmado
      });
    }

    // Si la orden está cancelada
    if (orden.estado === 'cancelada') {
      return res.status(410).send(paginaError(
        'Proceso cancelado',
        'Proceso cancelado',
        'Este proceso de alta ha sido cancelado. Si crees que es un error, contacta con nuestro equipo de atención al cliente para resolverlo.',
        empresaNombre
      ));
    }

    res.render('altas/kyc', {
      title: 'Verificación - ' + empresaNombre,
      layout: false,
      token: req.params.token,
      orden, datos, producto,
      paso,
      pasoTexto,
      empresaNombre,
      empresaLogo,
      kycCompletado: orden.kyc_completado,
      kycDocsSubidos: orden.kyc_docs_subidos,
      kycContratoFirmado: orden.kyc_contrato_firmado
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(paginaError(
      'Error interno',
      'Error interno',
      'Ha ocurrido un error inesperado. Por favor, inténtalo de nuevo más tarde. Si el problema persiste, contacta con atención al cliente.',
      db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value
    ));
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

    // Intentar subir la firma a Likes Telecom API como documento
    try {
      const api = getApi();
      const datosCliente = JSON.parse(orden.datos_cliente || '{}');
      let customers = await api.getCustomers();
      let custArr = Array.isArray(customers) ? customers : [];
      let customer = custArr.find(c => c.fiscalId === datosCliente.dni);
      if (customer) {
        const docs = customer.documentation || customer.documents || [];
        const docFirma = docs.find(d => d.documentType === 'SIGNED_CONTRACT' || d.documentType === 'CONTRATO_FIRMADO');
        if (docFirma && docFirma.uploadURL) {
          const axios = require('axios');
          await axios.put(docFirma.uploadURL, sigBuf, {
            headers: { 'Content-Type': 'image/png' }
          });
          console.log('Firma subida correctamente a Likes Telecom API');
        }
      }
    } catch (e) {
      console.error('Error al subir firma a API (no crítico):', e.message);
    }

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
    if (!orden) {
      return res.status(404).send(paginaError(
        'No encontrado',
        'Contrato no encontrado',
        'El contrato solicitado no existe o ha expirado.',
        db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value
      ));
    }

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

    // Cláusula IBAN si el método de pago es IBAN
    const mostrarClausulaIBAN = pago.metodo === 'IBAN';
    const clausulaIBAN = 'CLÁUSULA ADICIONAL - VERIFICACIÓN DE IBAN: El cliente autoriza el cargo de 0,50€ en la cuenta bancaria proporcionada para verificar la titularidad y validez del IBAN. Dicho importe será reembolsado en la primera factura emitida. En caso de que el IBAN no sea válido o no se pueda verificar, se informará al cliente para que proporcione un método de pago alternativo.';

    res.render('altas/contrato-preview', {
      title: 'Contrato',
      layout: false,
      datos, producto, pago, orden,
      empresaNombre, empresaCif, empresaDireccion, empresaTelefono,
      productName,
      mostrarClausulaIBAN,
      clausulaIBAN,
      hoy: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    });
  } catch (error) {
    console.error(error);
    res.status(500).send(paginaError(
      'Error interno',
      'Error interno',
      'Ha ocurrido un error al generar el contrato. Inténtalo de nuevo más tarde.',
      db.prepare("SELECT value FROM settings WHERE key='empresa_nombre'").get()?.value
    ));
  }
});

// GET /kyc/tracking/:token.gif - tracking pixel (1x1 transparent)
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
