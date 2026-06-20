const { chromium } = require('playwright');
(async () => {
  var b;
  try {
    b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 8000 });
  } catch(e) { console.log('CDP no conecta:', e.message); return; }
  
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  
  // Buscar pagina del CRM
  var p = pages.find(pg => pg.url().includes('replit.dev') || pg.url().includes('6f335cd7'));
  if (!p) {
    console.log('No hay pagina del CRM, buscando en Replit...');
    p = pages.find(pg => pg.url().includes('replit.com'));
    if (!p) { console.log('No se encuentra Replit'); await b.close(); return; }
  }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  console.log('URL:', p.url().substring(0, 120));
  
  // Ir a /codeopen si no estamos
  if (!p.url().includes('codeopen')) {
    await p.goto(p.url().replace(/\/?$/, '') + '/codeopen', { timeout: 15000, waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
    console.log('Navegado a /codeopen');
  }

  // Analizar todo
  var result = await p.evaluate(() => {
    var r = {};

    // 1. Boton Analizar
    var analyzeBtns = document.querySelectorAll('.pending-analyze, .btn-analyze');
    r.analizarBtn = analyzeBtns.length > 0 ? analyzeBtns.length + ' botones visibles' : 'NO HAY';

    // 2. WhatsApp QR panel
    var qrPanel = document.getElementById('waQRPanel');
    r.qrPanel = qrPanel ? 'existe' : 'no existe';

    // 3. WhatsApp status
    var waStatus = document.getElementById('waStatusText');
    r.waStatus = waStatus ? waStatus.textContent.trim() : 'no hay';

    // 4. Conexion por telefono
    var phoneInput = document.getElementById('waPhoneInput');
    var phoneBtn = document.getElementById('waPhoneLoginBtn');
    r.phonePairing = phoneInput && phoneBtn ? 'SI (input + boton)' : 'NO';

    // 5. Boton cerrar sesion
    var logoutBtns = document.querySelectorAll('#waLogoutBtn, #waLogoutDropdown');
    r.logoutBtn = logoutBtns.length > 0 ? 'SI' : 'NO';

    // 6. Modelos dropdown
    var cerebroDropdown = document.getElementById('cerebroDropdown');
    if (cerebroDropdown) {
      cerebroDropdown.style.display = 'block';
      var items = cerebroDropdown.querySelectorAll('div[style*="padding"]');
      r.modelos = Array.from(items).map(i => i.textContent.trim()).filter(t => t && t.length < 60);
      cerebroDropdown.style.display = 'none';
    } else {
      r.modelos = 'no hay dropdown';
    }

    // 7. Contactos y numeros
    var waContacts = document.getElementById('waContactsList');
    if (waContacts) {
      var contactCards = waContacts.querySelectorAll('[class*="wa-contact-header"]');
      r.contactos = contactCards.length + ' contactos';
      if (contactCards.length > 0) {
        r.primerContacto = contactCards[0].textContent.trim().substring(0, 100);
      }
    } else {
      r.contactos = 'no hay lista';
    }

    // 8. Errores visibles
    var errs = [];
    document.querySelectorAll('[class*="error"], [class*="Error"], .alert-danger, .alert-warning').forEach(el => {
      if (el.textContent.trim() && el.offsetParent !== null) errs.push(el.textContent.trim().substring(0, 80));
    });
    r.errores = errs.length > 0 ? errs : 'ninguno visible';

    // 9. pending messages
    var pendingCount = document.getElementById('pendingBadge');
    r.pendingCount = pendingCount ? pendingCount.textContent : '0';

    // 10. Boton Enviar/Audio/Doc visibles
    var sendBtns = document.querySelectorAll('.btn-send-no-fwd, .btn-send-audio, .btn-send-doc, .pending-send, .pending-reject');
    r.sendBtns = sendBtns.length > 0 ? sendBtns.length + ' botones de envio' : 'NO HAY';

    return r;
  });

  console.log('\n=== ANALISIS DE LA WEB ===');
  for (var key in result) {
    var val = result[key];
    console.log(key + ':', Array.isArray(val) ? val.join(' | ') : val);
  }

  await b.close();
})();
