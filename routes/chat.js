const express = require('express');
const axios = require('axios');
const router = express.Router();

module.exports = function(db) {
  const AI_LOCAL_ENABLED = process.env.AI_LOCAL_ENABLED === 'true';
  const AI_CLOUD_ENABLED = process.env.AI_CLOUD_ENABLED === 'true';
  const AI_SAFE_MODE = process.env.AI_SAFE_MODE !== 'false';
  const AI_WRITE_ENABLED = process.env.AI_WRITE_ENABLED === 'true';
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
  const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const pendingActions = new Map();

  function q(query, params) {
    try { return db.prepare(query).all(...(params||[])); } catch(e) { return []; }
  }
  function q1(query, params) {
    try { return db.prepare(query).get(...(params||[])); } catch(e) { return null; }
  }

  function getStats() {
    return {
      clientes: q1("SELECT COUNT(*) as c FROM clients")?.c || 0,
      productos: q1("SELECT COUNT(*) as c FROM products")?.c || 0,
      tickets: q1("SELECT COUNT(*) as c FROM tickets")?.c || 0,
      ticketsAbiertos: q1("SELECT COUNT(*) as c FROM tickets WHERE estado='abierto'")?.c || 0,
      facturas: q1("SELECT COUNT(*) as c FROM invoices")?.c || 0,
      facturasPendientes: q1("SELECT COUNT(*) as c FROM invoices WHERE estado='pendiente'")?.c || 0,
      suscripciones: q1("SELECT COUNT(*) as c FROM subscriptions")?.c || 0,
      suscripcionesActivas: q1("SELECT COUNT(*) as c FROM subscriptions WHERE estado='activa'")?.c || 0,
      usuarios: q1("SELECT COUNT(*) as c FROM users")?.c || 0,
      leads: q1("SELECT COUNT(*) as c FROM leads")?.c || 0,
      altas: q1("SELECT COUNT(*) as c FROM alta_requests")?.c || 0,
      presupuestosPendientes: q1("SELECT COUNT(*) as c FROM tienda_presupuestos WHERE estado='pendiente'")?.c || 0,
      citasHoy: q1("SELECT COUNT(*) as c FROM tienda_agenda WHERE fecha=? AND estado!='completada'", [getToday()])?.c || 0,
      movimientosHoy: q1("SELECT COUNT(*) as c FROM tienda_caja WHERE fecha=?", [getToday()])?.c || 0,
      prepagoActivos: q1("SELECT COUNT(*) as c FROM tienda_prepago WHERE estado='activo'")?.c || 0,
      inventarioItems: q1("SELECT COUNT(*) as c FROM tienda_inventario")?.c || 0,
      stockBajo: q1("SELECT COUNT(*) as c FROM tienda_inventario WHERE cantidad <= stock_minimo")?.c || 0,
      ingresosHoy: q1("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE fecha=? AND tipo='ingreso'", [getToday()])?.t || 0,
      gastosHoy: q1("SELECT COALESCE(SUM(importe),0) as t FROM tienda_caja WHERE fecha=? AND tipo='gasto'", [getToday()])?.t || 0,
    };
  }

  function getNow() {
    const d = new Date();
    return {
      hora: d.getHours(),
      minutos: d.getMinutes(),
      fecha: d.toLocaleDateString('es-ES', { weekday:'long', year:'numeric', month:'long', day:'numeric' }),
      horaStr: d.toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
    };
  }

  function getSaludo(hora) {
    if (hora < 6) return '¡Madrugador!';
    if (hora < 12) return '¡Buenos días!';
    if (hora < 18) return '¡Buenas tardes!';
    if (hora < 21) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  }

  function tienePalabras(texto, palabras) {
    return palabras.some(p => texto.includes(p));
  }

  function tieneTodas(texto, palabras) {
    return palabras.every(p => texto.includes(p));
  }

  function formatNum(n) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0 }); }
  function formatEur(n) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + '€'; }

  function isDangerousIntent(text) {
    const t = String(text || '').toLowerCase();
    return ['borrar', 'eliminar', 'vaciar', 'cobrar', 'crear', 'editar', 'actualizar', 'modificar', 'dar de baja', 'cambiar titular'].some(k => t.includes(k));
  }

  function parseKvCommand(raw, prefix) {
    const txt = String(raw || '').trim();
    if (!txt.toLowerCase().startsWith(prefix)) return null;
    const body = txt.slice(prefix.length).trim();
    const fields = {};
    body.split(',').forEach(pair => {
      const i = pair.indexOf('=');
      if (i > 0) {
        const k = pair.slice(0, i).trim().toLowerCase();
        const v = pair.slice(i + 1).trim();
        if (k) fields[k] = v;
      }
    });
    return fields;
  }

  function createToken() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function askLocalAI(message, stats, now) {
    const system = [
      'Eres un asistente administrador local del CRM Movilbro.',
      'Responde en español de forma clara y accionable.',
      'No inventes datos.',
      'Si faltan datos para una acción, pide solo los campos necesarios.',
      'No expongas secretos ni credenciales.',
      AI_SAFE_MODE && !AI_WRITE_ENABLED ? 'Modo seguro activo: solo lectura. No ejecutes cambios, solo guía y validación.' : ''
    ].filter(Boolean).join(' ');

    const context = `Fecha: ${now.fecha} ${now.horaStr}. Resumen: clientes=${stats.clientes}, productos=${stats.productos}, facturasPendientes=${stats.facturasPendientes}, citasHoy=${stats.citasHoy}, ingresosHoy=${stats.ingresosHoy}, gastosHoy=${stats.gastosHoy}.`;

    const payload = {
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context + '\n\nConsulta: ' + message }
      ]
    };

    const r = await axios.post(`${OLLAMA_URL}/api/chat`, payload, { timeout: 20000 });
    return r?.data?.message?.content ? String(r.data.message.content).trim() : '';
  }

  async function askCloudAI(message, stats, now) {
    const system = [
      'Eres un asistente administrador del CRM Movilbro.',
      'Responde en español de forma clara y accionable.',
      'No inventes datos.',
      'Si faltan datos para una acción, pide solo los campos necesarios.',
      'No expongas secretos ni credenciales.',
      AI_SAFE_MODE && !AI_WRITE_ENABLED ? 'Modo seguro activo: solo lectura. No ejecutes cambios, solo guía y validación.' : ''
    ].filter(Boolean).join(' ');

    const context = `Fecha: ${now.fecha} ${now.horaStr}. Resumen: clientes=${stats.clientes}, productos=${stats.productos}, facturasPendientes=${stats.facturasPendientes}, citasHoy=${stats.citasHoy}, ingresosHoy=${stats.ingresosHoy}, gastosHoy=${stats.gastosHoy}.`;

    const payload = {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: context + '\n\nConsulta: ' + message }
      ],
      temperature: 0.7,
      max_tokens: 2048
    };

    const r = await axios.post(DEEPSEEK_API_URL, payload, {
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    return r?.data?.choices?.[0]?.message?.content ? String(r.data.choices[0].message.content).trim() : '';
  }

  router.post('/', async (req, res) => {
    const msg = (req.body.message || '').trim().toLowerCase();
    if (!msg) return res.json({ response: 'Dime algo, estoy aquí para ayudarte.' });

    const s = getStats();
    const n = getNow();
    const t = msg;
    const saludo = getSaludo(n.hora);

    // --- Confirmación segura de acciones de escritura ---
    const sid = req.sessionID || 'anon';
    const confirmCmd = (req.body.message || '').trim();
    const mConfirm = confirmCmd.match(/^confirmar\s+([A-Z0-9]{4,10})$/i);
    if (mConfirm) {
      const token = mConfirm[1].toUpperCase();
      const key = `${sid}:${token}`;
      const action = pendingActions.get(key);
      if (!action) return res.json({ response: 'No encuentro esa operación pendiente. Vuelve a solicitarla para generar un nuevo código.' });
      if (!AI_WRITE_ENABLED) return res.json({ response: 'La escritura está desactivada por seguridad (AI_WRITE_ENABLED=false).' });
      try {
        if (action.type === 'crear_cita') {
          db.prepare('INSERT INTO tienda_agenda (cliente_nombre, telefono, fecha, hora, tipo, motivo, notas, user_id) VALUES (?,?,?,?,?,?,?,?)')
            .run(action.data.cliente_nombre, action.data.telefono || '', action.data.fecha, action.data.hora || '', action.data.tipo || 'cita', action.data.motivo || '', action.data.notas || '', req.session.user?.id || null);
          pendingActions.delete(key);
          return res.json({ response: `OK. Cita creada para ${action.data.cliente_nombre} el ${action.data.fecha} ${action.data.hora || ''}.` });
        }
      } catch (e) {
        return res.json({ response: `Error ejecutando la operación: ${e.message}` });
      }
      return res.json({ response: 'Operación no soportada.' });
    }

    // --- Crear cita con doble confirmación ---
    const citaFields = parseKvCommand(req.body.message || '', 'crear cita:');
    if (citaFields) {
      const cliente_nombre = citaFields.nombre || citaFields.cliente || '';
      const fecha = citaFields.fecha || '';
      if (!cliente_nombre || !fecha) {
        return res.json({ response: 'Faltan datos. Formato: crear cita: nombre=Juan, fecha=2026-05-20, hora=10:30, telefono=600123123, motivo=Portabilidad' });
      }
      const token = createToken();
      const key = `${sid}:${token}`;
      pendingActions.set(key, {
        type: 'crear_cita',
        data: {
          cliente_nombre,
          fecha,
          hora: citaFields.hora || '',
          telefono: citaFields.telefono || '',
          motivo: citaFields.motivo || '',
          notas: citaFields.notas || '',
          tipo: citaFields.tipo || 'cita'
        },
        createdAt: Date.now()
      });
      return res.json({ response: `Preparado para crear cita: ${cliente_nombre} | ${fecha} ${citaFields.hora || ''}. Para ejecutar con seguridad escribe: confirmar ${token}` });
    }

    if (AI_LOCAL_ENABLED) {
      if (AI_SAFE_MODE && !AI_WRITE_ENABLED && isDangerousIntent(msg)) {
        return res.json({ response: 'Modo seguro activo (solo lectura). Escritura bloqueada salvo comandos confirmados y AI_WRITE_ENABLED=true.' });
      }
      try {
        const localResp = await askLocalAI(req.body.message || '', s, n);
        if (localResp) return res.json({ response: localResp });
        return res.json({ response: 'IA local activa pero sin respuesta. Revisa el modelo de Ollama.' });
      } catch (_) {
        if (!AI_CLOUD_ENABLED || !DEEPSEEK_API_KEY) {
          return res.json({ response: 'La IA local no está disponible ahora mismo (Ollama/modelo apagado). Inicia Ollama y el modelo para usar la IA privada.' });
        }
      }
    }
    if (AI_CLOUD_ENABLED && DEEPSEEK_API_KEY) {
      try {
        const cloudResp = await askCloudAI(req.body.message || '', s, n);
        if (cloudResp) return res.json({ response: cloudResp });
      } catch (_) {}
    }

    let resp = '';

    // ============================
    // SALUDOS
    // ============================
    if (tienePalabras(t, ['alta nueva','crear alta','generar alta','dar de alta','nuevo alta'])) {
      resp = `Perfecto. Para crear un alta nueva necesito estos datos:\n\n1) Cliente: nombre, apellidos, DNI/NIF, email y teléfono\n2) Dirección completa: calle, número, CP, ciudad y provincia\n3) Producto: familia (Móvil/Fibra/TV/Device), producto exacto y precio\n4) Línea: nueva o portabilidad\n5) Si es portabilidad: número a portar y operador donante\n6) Pago: IBAN (si aplica) y método de pago\n7) Firma: digital o manual\n\nSi quieres, te lo pido paso a paso y te dejo la ficha lista para cargar en Altas.`;
    }

    // ============================
    // SALUDOS
    // ============================
    else if (tienePalabras(t, ['hola','buenas','buenos días','buenas tardes','buenas noches','hey','qué tal','que tal','saludos','alo','ola','hello','hi','buen dia'])) {
      resp = `${saludo} Soy la IA del CRM de Movilbro. Aquí tienes un resumen rápido: <b>${formatNum(s.clientes)} clientes</b>, <b>${formatNum(s.suscripcionesActivas)} suscripciones activas</b>, <b>${formatNum(s.facturasPendientes)} facturas pendientes</b> y <b>${formatNum(s.citasHoy)} citas hoy</b>. ¿Qué necesitas?`;
    }

    // ============================
    // DESPEDIDAS
    // ============================
    else if (tienePalabras(t, ['adios','chao','bye','hasta luego','nos vemos','hasta pronto','hasta la vista','me voy','nos vemos'])) {
      resp = '¡Hasta luego! Si necesitas algo, aquí estaré. Que tengas un buen día.';
    }

    // ============================
    // AGRADECIMIENTOS
    // ============================
    else if (tienePalabras(t, ['gracias','thanks','thank you','grax','te agradezco','gracias'])) {
      resp = '¡De nada! Para eso estoy. Siempre que necesites algo del CRM, ya sabes.';
    }

    // ============================
    // CÓMO ESTÁS / PRESENTACIÓN
    // ============================
    else if (tienePalabras(t, ['como estas','cómo estás','como va','qué tal estás','que tal estas','como te va']) || 
             (tienePalabras(t, ['como','cómo']) && tienePalabras(t, ['vas','vas','estas','estás','va']))) {
      resp = `Estoy al 100%, viendo todo lo que pasa en el CRM. Hoy es ${n.fecha} y son las ${n.horaStr}. Llevamos ${formatEur(s.ingresosHoy)} en ingresos hoy y ${formatEur(s.gastosHoy)} en gastos. ¿En qué te echo una mano?`;
    }

    else if (tienePalabras(t, ['como te llamas','cómo te llamas','quien eres','quién eres','tu nombre','como te llamas','nombre','presentate','preséntate'])) {
      resp = `Soy la IA del CRM de Movilbro. Estoy integrada directamente en el sistema, sin depender de internet. Conozco cada rincón del CRM: clientes, ventas, tienda, tickets, facturación, y puedo ayudarte a gestionar tu negocio de telecomunicaciones. ¿Qué quieres saber?`;
    }

    // ============================
    // HORA / FECHA
    // ============================
    else if (tienePalabras(t, ['hora','qué hora','que hora','reloj']) && !tienePalabras(t, ['factura','cliente','cobro','pago'])) {
      resp = `Son las <b>${n.horaStr}</b> del <b>${n.fecha}</b>.`;
    }

    else if ((tienePalabras(t, ['fecha','qué día','que dia','que día','fecha','dia','día','hoy','fecha actual'])) && !tienePalabras(t, ['factura','vencimient','cliente','cobro'])) {
      resp = `Hoy es <b>${n.fecha}</b>.`;
    }

    // ============================
    // ESTADÍSTICAS GLOBALES
    // ============================
    else if (tienePalabras(t, ['resumen','dashboard','panorama','situación','situacion','visión general','vision general','como vamos','cómo vamos','estado general','estado del negocio'])) {
      resp = `Aquí tienes el estado actual del CRM:\n\n📊 <b>Clientes:</b> ${formatNum(s.clientes)} totales\n📱 <b>Suscripciones:</b> ${formatNum(s.suscripcionesActivas)} activas de ${formatNum(s.suscripciones)}\n🎫 <b>Tickets:</b> ${formatNum(s.tickets)} totales (${formatNum(s.ticketsAbiertos)} abiertos)\n💰 <b>Facturación:</b> ${formatNum(s.facturas)} facturas (${formatNum(s.facturasPendientes)} pendientes)\n🏪 <b>Tienda:</b> ${formatNum(s.presupuestosPendientes)} presupuestos pend, ${formatNum(s.citasHoy)} citas hoy\n📦 <b>Stock:</b> ${formatNum(s.inventarioItems)} productos (${formatNum(s.stockBajo)} con stock bajo)\n📈 <b>Hoy:</b> ${formatEur(s.ingresosHoy)} ingresos, ${formatEur(s.gastosHoy)} gastos\n\n¿Quieres detalles de algo en concreto?`;
    }

    else if (tienePalabras(t, ['cuantos','cuántos','cuantas','cuántas','contar','número','numeros','total','estadisticas','estadísticas','estadistica','estadística','cuenta','hay']) && !tienePalabras(t, ['hora','fecha','tiempo'])) {
      let partes = [];
      if (tienePalabras(t, ['cliente','clientes','persona','personas','gente','usuario'])) partes.push(`📊 <b>Clientes:</b> ${formatNum(s.clientes)} registrados`);
      if (tienePalabras(t, ['producto','productos','articulo','articulos','items'])) partes.push(`📦 <b>Productos:</b> ${formatNum(s.productos)} en catálogo`);
      if (tienePalabras(t, ['ticket','tickets','soporte','incidencia','incidencias'])) partes.push(`🎫 <b>Tickets:</b> ${formatNum(s.tickets)} totales (${formatNum(s.ticketsAbiertos)} abiertos)`);
      if (tienePalabras(t, ['factura','facturas','facturacion','facturación','recibo','recibos'])) partes.push(`💰 <b>Facturas:</b> ${formatNum(s.facturas)} (${formatNum(s.facturasPendientes)} pendientes)`);
      if (tienePalabras(t, ['suscripcion','suscripciones','subscripcion','subscripciones','contrato','contratos','linea','lineas','línea','líneas'])) partes.push(`📱 <b>Suscripciones:</b> ${formatNum(s.suscripciones)} (${formatNum(s.suscripcionesActivas)} activas)`);
      if (tienePalabras(t, ['usuario','usuarios','empleado','empleados','trabajador','trabajadores','staff'])) partes.push(`👤 <b>Usuarios:</b> ${formatNum(s.usuarios)} en el sistema`);
      if (tienePalabras(t, ['lead','leads','oportunidad','oportunidades','potencial','potenciales'])) partes.push(`🎯 <b>Leads:</b> ${formatNum(s.leads)} registrados`);
      if (tienePalabras(t, ['alta','altas','nuevo cliente','nueva orden','nuevos'])) partes.push(`📋 <b>Altas:</b> ${formatNum(s.altas)} en curso`);
      if (tienePalabras(t, ['presupuesto','presupuestos'])) partes.push(`📝 <b>Presupuestos pendientes:</b> ${formatNum(s.presupuestosPendientes)}`);
      if (tienePalabras(t, ['cita','citas','agenda','calendario','evento','eventos'])) partes.push(`📅 <b>Citas hoy:</b> ${formatNum(s.citasHoy)}`);
      if (tienePalabras(t, ['prepago','prepagos'])) partes.push(`📱 <b>Prepago activos:</b> ${formatNum(s.prepagoActivos)}`);
      if (tienePalabras(t, ['stock','inventario','existencia','existencias','almacen'])) partes.push(`📦 <b>Inventario:</b> ${formatNum(s.inventarioItems)} productos (${formatNum(s.stockBajo)} con stock bajo)`);
      if (tienePalabras(t, ['ingreso','ingresos','gasto','gastos','caja','movimiento','movimientos','dinero','venta','ventas'])) partes.push(`💵 <b>Hoy:</b> ${formatEur(s.ingresosHoy)} ingresos / ${formatEur(s.gastosHoy)} gastos`);
      
      if (partes.length > 0) {
        resp = partes.join('\n');
      } else {
        resp = `Aquí tienes un resumen general:\n📊 ${formatNum(s.clientes)} clientes | 📱 ${formatNum(s.suscripcionesActivas)} suscripciones activas | 🎫 ${formatNum(s.tickets)} tickets | 💰 ${formatNum(s.facturasPendientes)} facturas pendientes | 📅 ${formatNum(s.citasHoy)} citas hoy | 💵 ${formatEur(s.ingresosHoy)} ingresos hoy`;
      }
      resp += '\n\n¿Quieres saber más sobre algo en concreto?';
    }

    // ============================
    // CLIENTES - BÚSQUEDA AVANZADA
    // ============================
    else if (tienePalabras(t, ['cliente','clientes','buscar cliente','busca cliente','buscar clientes','localizar cliente','encuentra cliente']) && 
             (tienePalabras(t, ['llama','llame','llamado','llamada','nombre','apellido','telefono','teléfono','tlf','busca','buscar','encuentra','localiza','dime','dame']) ||
              msg.includes('que se llama') || msg.includes('que se llame') || msg.includes('cuyo nombre') || msg.includes('con nombre') || msg.includes('con telefono') || msg.includes('con teléfono'))) {
      // Extract search term
      let searchTerm = '';
      const palabras = t.split(/\s+/);
      // Try to extract the name/tel after certain keywords
      const keywords = ['llama','llame','llamado','llamada','nombre','llama','busca','buscar','dime','dame','encuentra','localiza','llamado','llamada'];
      for (let i = 0; i < palabras.length; i++) {
        if (palabras[i] === 'cliente' && i + 1 < palabras.length) {
          if (['que','se','llama','llame','llamado','llamada','con','de','por'].includes(palabras[i+1])) continue;
          searchTerm = palabras[i+1];
          break;
        }
        if (keywords.includes(palabras[i]) && i + 1 < palabras.length) {
          // Skip connecting words
          let j = i + 1;
          while (j < palabras.length && ['de','del','la','el','los','las','un','una','al','por','para','que','se','con'].includes(palabras[j])) j++;
          if (j < palabras.length) { searchTerm = palabras.slice(j, j + 3).join(' '); break; }
        }
      }
      if (!searchTerm && msg.includes('que se llama')) {
        const idx = msg.indexOf('que se llama');
        searchTerm = msg.substring(idx + 13).trim().split(/\s+/).slice(0, 3).join(' ');
      }
      if (!searchTerm && msg.includes('con nombre')) {
        const idx = msg.indexOf('con nombre');
        searchTerm = msg.substring(idx + 10).trim().split(/\s+/).slice(0, 3).join(' ');
      }
      
      if (searchTerm && searchTerm.length > 1) {
        const like = `%${searchTerm}%`;
        const encontrados = q("SELECT id, nombre, apellidos, telefono, email, ciudad FROM clients WHERE nombre LIKE ? OR apellidos LIKE ? OR telefono LIKE ? OR email LIKE ? LIMIT 5", [like, like, like, like]);
        if (encontrados.length > 0) {
          resp = `He encontrado ${encontrados.length} cliente(s) con "${searchTerm}":\n\n`;
          encontrados.forEach(c => {
            resp += `• <a href="/clientes/${c.id}" target="_parent">${c.nombre} ${c.apellidos || ''}</a> — 📞 ${c.telefono || '-'} — 📧 ${c.email || '-'}\n`;
          });
          resp += '\n¿Quieres que abra alguno?';
        } else {
          resp = `No encontré ningún cliente con "${searchTerm}". Prueba con otro nombre o teléfono.`;
        }
      } else {
        resp = `Hay <b>${formatNum(s.clientes)} clientes</b> registrados. Dime un nombre, apellido o teléfono y lo busco. Por ejemplo: "busca cliente Ivan" o "dime cliente con telefono 694".`;
      }
    }

    // ============================
    // CLIENTES - GENERAL
    // ============================
    else if (tienePalabras(t, ['cliente','clientes'])) {
      resp = `Hay <b>${formatNum(s.clientes)} clientes</b> en el CRM. Puedes verlos todos en <a href="/clientes" target="_parent">Clientes</a>, buscar por nombre o teléfono, y gestionar sus datos.`;
      resp += `\n\nTambién hay <b>${formatNum(s.prepagoActivos)} clientes prepago</b> activos en <a href="/tienda/prepago" target="_parent">Prepago</a>.`;
      resp += '\n\nSi quieres que busque un cliente en concreto, dime su nombre o teléfono.';
    }

    // ============================
    // PRODUCTOS
    // ============================
    else if (tienePalabras(t, ['producto','productos','catalogo','catálogo','tarifa','tarifas'])) {
      resp = `Hay <b>${formatNum(s.productos)} productos</b> en el catálogo. Puedes verlos en <a href="/products" target="_parent">Productos</a> con familias, precios y stock.`;
      resp += `\n\nEn la tienda hay <b>${formatNum(s.inventarioItems)} items en inventario</b> (${formatNum(s.stockBajo)} con stock bajo). Gestiona el stock en <a href="/tienda/inventario" target="_parent">Inventario</a>.`;
    }

    // ============================
    // FACTURAS
    // ============================
    else if (tienePalabras(t, ['factura','facturas','facturacion','facturación','recibo','recibos','impago','impagos','pendiente de pago'])) {
      if (tienePalabras(t, ['pendiente','pendientes','impago','impagos','sin pagar','no pagada','no pagadas','vencida','vencidas'])) {
        resp = `Actualmente hay <b>${formatNum(s.facturasPendientes)} facturas pendientes</b> de pago. Puedes gestionarlas en <a href="/invoices" target="_parent">Facturación</a>.`;
      } else {
        resp = `Hay <b>${formatNum(s.facturas)} facturas</b> registradas (${formatNum(s.facturasPendientes)} pendientes de pago). Todo en <a href="/invoices" target="_parent">Facturación</a>.`;
      }
      resp += '\nTambién puedes ver <a href="/payments" target="_parent">Pagos</a> y <a href="/stripe" target="_parent">Stripe</a> para cobros online.';
    }

    // ============================
    // TICKETS / SOPORTE
    // ============================
    else if (tienePalabras(t, ['ticket','tickets','soporte','incidencia','incidencias','problema técnico','problema tecnico','avería','averia','reclamacion','reclamación'])) {
      const abiertos = s.ticketsAbiertos;
      resp = `Hay <b>${formatNum(s.tickets)} tickets</b> totales, <b>${formatNum(abiertos)} abiertos</b>. Puedes gestionarlos en <a href="/tickets" target="_parent">Tickets</a>.`;
      if (abiertos > 0) {
        resp += `\n\n⚠️ Tienes ${formatNum(abiertos)} tickets sin resolver actualmente.`;
      }
    }

    // ============================
    // PRESUPUESTOS
    // ============================
    else if (tienePalabras(t, ['presupuesto','presupuestos','presupuestar','cotizacion','cotización'])) {
      resp = `Hay <b>${formatNum(s.presupuestosPendientes)} presupuestos pendientes</b> de aprobación. Puedes gestionarlos en <a href="/tienda/presupuestos" target="_parent">Presupuestos</a>.`;
    }

    // ============================
    // AGENDA / CITAS
    // ============================
    else if (tienePalabras(t, ['cita','citas','agenda','calendario','evento','eventos','reunión','reunion','recordatorio'])) {
      resp = `Hoy tienes <b>${formatNum(s.citasHoy)} citas</b> programadas. Puedes ver tu agenda en <a href="/tienda/agenda" target="_parent">Agenda</a>.`;
      if (s.citasHoy > 0) {
        resp += '\n\n📅 No olvides revisar las citas de hoy.';
      }
    }

    // ============================
    // CAJA / DINERO
    // ============================
    else if (tienePalabras(t, ['caja','dinero','ingreso','ingresos','gasto','gastos','movimiento','movimientos','venta','ventas','cobro','cobros','balance','saldo'])) {
      resp = `💰 <b>Movimientos de hoy:</b> ${formatNum(s.movimientosHoy)} operaciones\n• <b>Ingresos:</b> ${formatEur(s.ingresosHoy)}\n• <b>Gastos:</b> ${formatEur(s.gastosHoy)}\n• <b>Saldo:</b> ${formatEur(s.ingresosHoy - s.gastosHoy)}`;
      resp += `\n\nPuedes ver el detalle en <a href="/tienda/caja" target="_parent">Caja</a> y los cierres en <a href="/tienda/cierres" target="_parent">Cierres</a>.`;
    }

    // ============================
    // SUSCRIPCIONES
    // ============================
    else if (tienePalabras(t, ['suscripcion','suscripciones','subscripcion','subscripciones','linea','lineas','línea','líneas','contrato','contratos'])) {
      resp = `Hay <b>${formatNum(s.suscripciones)} suscripciones</b> en total, <b>${formatNum(s.suscripcionesActivas)} activas</b>. Puedes gestionarlas en <a href="/subscriptions" target="_parent">Suscripciones</a>.`;
    }

    // ============================
    // STOCK / INVENTARIO
    // ============================
    else if (tienePalabras(t, ['stock','inventario','existencia','existencias','almacén','almacen','reponer','pedido','pedidos a proveedores','falta stock'])) {
      resp = `📦 <b>Inventario:</b> ${formatNum(s.inventarioItems)} productos registrados`;
      if (s.stockBajo > 0) {
        resp += `\n⚠️ <b>${formatNum(s.stockBajo)} productos</b> tienen stock bajo o mínimo. Revisa en <a href="/tienda/inventario" target="_parent">Inventario</a>.`;
      }
      resp += `\n\nGestiona tu inventario en <a href="/tienda/inventario" target="_parent">Inventario</a>.`;
    }

    // ============================
    // LEADS
    // ============================
    else if (tienePalabras(t, ['lead','leads','oportunidad','oportunidades','cliente potencial','cliente potenciales','posible cliente'])) {
      resp = `Hay <b>${formatNum(s.leads)} leads</b> registrados. Puedes gestionarlos en <a href="/leads" target="_parent">Leads</a>.`;
    }

    // ============================
    // ALTAS
    // ============================
    else if (tienePalabras(t, ['alta','altas','portabilidad','portabilidades','nueva línea','nueva linea','nueva orden','alta nueva'])) {
      resp = `Actualmente hay <b>${formatNum(s.altas)} altas</b> en curso. Puedes gestionarlas en <a href="/altas" target="_parent">Altas</a>.`;
    }

    // ============================
    // TIENDA - GENERAL
    // ============================
    else if (tienePalabras(t, ['tienda','panel tienda','panel de tienda','store'])) {
      resp = `El Panel Tienda incluye:\n📅 <a href="/tienda/agenda" target="_parent">Agenda</a> | 💰 <a href="/tienda/caja" target="_parent">Caja</a> | 📦 <a href="/tienda/inventario" target="_parent">Inventario</a> | 📝 <a href="/tienda/presupuestos" target="_parent">Presupuestos</a>\n📱 <a href="/tienda/prepago" target="_parent">Clientes Prepago</a> | 👥 <a href="/tienda/plantilla" target="_parent">Plantilla</a> | 📊 <a href="/tienda/cierres" target="_parent">Cierres</a> | 📋 <a href="/tienda/historial-dia" target="_parent">Historial</a>`;
      resp += `\n\nHoy: ${formatNum(s.movimientosHoy)} movimientos, ${formatEur(s.ingresosHoy)} ingresos.`;
    }

    // ============================
    // CONFIGURACIÓN
    // ============================
    else if (tienePalabras(t, ['configuracion','configuración','settings','ajustes','preferencias','personalizar'])) {
      resp = `Puedes configurar el CRM en <a href="/settings" target="_parent">Configuración</a>: nombre de empresa, colores, API de Likes Telecom, módulos y más.`;
    }

    // ============================
    // WHATSAPP
    // ============================
    else if (tienePalabras(t, ['whatsapp','wasap','whats','mensaje','mensajes'])) {
      resp = `Accede a WhatsApp Web desde <a href="/whatsapp" target="_parent">WhatsApp</a> para contactar con tus clientes directamente.`;
    }

    // ============================
    // CORREO
    // ============================
    else if (tienePalabras(t, ['correo','email','mail','emails','correos','enviar correo'])) {
      resp = `Puedes gestionar el correo desde <a href="/email" target="_parent">Correo</a>. También hay integración con <a href="/stripe" target="_parent">Stripe</a> para cobros por email.`;
    }

    // ============================
    // KPIs / GRÁFICOS
    // ============================
    else if (tienePalabras(t, ['kpi','kpis','grafico','gráfico','graficas','gráficas','indicadores','métricas','metricas','rendimiento','desempeño','desempeno'])) {
      resp = `Los KPIs y gráficos están en <a href="/kpis" target="_parent">KPIs</a>: estadísticas de productos, clientes, ingresos y más.`;
    }

    // ============================
    // HISTORIAL / ACTIVIDAD
    // ============================
    else if (tienePalabras(t, ['historial','actividad','historial de actividad','actividad reciente','ultimos movimientos','últimos movimientos','registro','log'])) {
      resp = `Puedes ver el historial de actividad en:\n📋 <a href="/history" target="_parent">Historial</a> | 📅 <a href="/tienda/historial-dia" target="_parent">Historial del Día</a> | 📊 <a href="/tienda/cierres" target="_parent">Cierres</a>`;
    }

    // ============================
    // POSTVENTA
    // ============================
    else if (tienePalabras(t, ['postventa','post venta','post-venta','posventa','envio','envíos','instalacion','instalaciones','instalación','instalaciones','portabilidade','orden','órdenes','órden','penalizacion','penalización'])) {
      resp = `Puedes gestionar postventa en:\n📦 <a href="/aftersales/orders" target="_parent">Órdenes</a>\n🚚 <a href="/aftersales/shipments" target="_parent">Envíos</a>\n🔧 <a href="/aftersales/installations" target="_parent">Instalaciones</a>\n🔄 <a href="/aftersales/portabilities" target="_parent">Portabilidades</a>\n⚙️ <a href="/aftersales/processes" target="_parent">Procesos</a>\n⚠️ <a href="/aftersales/router-penalties" target="_parent">Penalizaciones Router</a>`;
    }

    // ============================
    // PROCESOS MASIVOS
    // ============================
    else if (tienePalabras(t, ['masivo','masivos','proceso masivo','procesos masivos','lote','lotes','batch','importar','exportar','csv'])) {
      resp = `Puedes gestionar procesos masivos en <a href="/massive-processes" target="_parent">Procesos Masivos</a>.`;
    }

    // ============================
    // CANALES / CHANNEL
    // ============================
    else if (tienePalabras(t, ['canal','canales','channel','distribuidor','distribuidores','partner','partners'])) {
      resp = `Gestiona los canales de venta y distribuidores en <a href="/channel" target="_parent">Canales</a>.`;
    }

    // ============================
    // RECURSOS
    // ============================
    else if (tienePalabras(t, ['recurso','recursos','material','materiales'])) {
      resp = `Puedes ver los recursos disponibles en <a href="/resources" target="_parent">Recursos</a>.`;
    }

    // ============================
    // USUARIOS
    // ============================
    else if (tienePalabras(t, ['usuario','usuarios','empleado','empleados','trabajador','trabajadores','staff','equipo'])) {
      resp = `Hay <b>${formatNum(s.usuarios)} usuarios</b> registrados en el CRM. Puedes gestionarlos en <a href="/users" target="_parent">Usuarios</a>.`;
    }

    // ============================
    // PLANTILLA (TRABAJADORES TIENDA)
    // ============================
    else if (tienePalabras(t, ['plantilla','trabajadore','empleados tienda','personal'])) {
      resp = `Gestiona la plantilla de trabajadores en <a href="/tienda/plantilla" target="_parent">Plantilla</a>.`;
    }

    // ============================
    // COBERTURA
    // ============================
    else if (tienePalabras(t, ['cobertura','fibra','coverage','cobertura fibra','internet disponible','llega fibra'])) {
      resp = `Consulta la cobertura disponible en <a href="/coverage" target="_parent">Cobertura</a>.`;
    }

    // ============================
    // PERFIL
    // ============================
    else if (tienePalabras(t, ['perfil','mi cuenta','mi perfil','mi usuario','mi email','mi contraseña','cambiar contraseña','cambiar password'])) {
      resp = `Puedes ver y editar tu perfil en <a href="/tienda/perfil" target="_parent">Perfil</a>.`;
    }

    // ============================
    // SEGURIDAD / LOGIN / ACCESO
    // ============================
    else if (tienePalabras(t, ['seguridad','login','acceso','contraseña','password','sesión','sesion','iniciar sesión','iniciar sesion','cookies','proteccion','protección'])) {
      resp = `El CRM ahora usa autenticación por email. Cuando necesites acceder:\n1. Ve a <a href="/auth/login" target="_parent">Iniciar Sesión</a>\n2. Introduce tu email\n3. Haz clic en "Solicitar contraseña"\n4. Recibirás una contraseña temporal en tu correo\n5. Inicia sesión con ella`;
      resp += `\n\n🔒 La sesión tiene una duración de 2 horas y las contraseñas se almacenan cifradas con bcrypt.`;
    }

    // ============================
    // AYUDA / QUÉ PUEDES HACER
    // ============================
    else if (tienePalabras(t, ['ayuda','help','que puedes hacer','qué puedes hacer','capacidades','funciones','que sabes hacer','qué sabes hacer','que haces','qué haces','que sabes','qué sabes','tutorial','instrucciones','comandos','manual','guia','guía'])) {
      resp = `Puedo ayudarte con todo esto:\n\n📊 <b>Consultar datos:</b> "¿cuántos clientes hay?", "resumen del CRM"\n🔍 <b>Buscar clientes:</b> "busca cliente Ivan", "dime cliente con teléfono 694"\n📅 <b>Agenda y citas:</b> "qué citas tengo hoy", "llévame a la agenda"\n💰 <b>Caja y dinero:</b> "ingresos de hoy", "balance del día"\n📦 <b>Inventario:</b> "productos con stock bajo", "qué hay en inventario"\n🧭 <b>Navegar:</b> "llévame a clientes", "abre facturación", "quiero ver tickets"\n❓ <b>Preguntar:</b> "cómo configuro el SMTP", "qué es esto"\n😄 <b>Charlar:</b> "cuéntame un chiste", "cómo estás"\n\nPruébame con lo que se te ocurra.`;
    }

    // ============================
    // NAVEGACIÓN DIRECTA
    // ============================
    else if (tienePalabras(t, ['lleva','llevame','llévame','abre','abrir','navega a','navegar a','ir a','vamos a','quiero ver','muestrame','muéstrame','enseñame','enséñame','quiero ir']) || 
             (tienePalabras(t, ['abrir','abre','ir','vamos']) && tienePalabras(t, ['clientes','productos','tickets','facturas','caja','agenda','inventario','settings','usuarios','kpis','tienda','presupuestos','prepago','cobertura','whatsapp','stripe','altas','leads','suscripciones','canales','postventa','historial','perfil','configuracion','cierres','plantilla']))) {
      
      const destinos = {
        'cliente': '/clientes', 'clientes': '/clientes', 'customers': '/clientes',
        'producto': '/products', 'productos': '/products', 'products': '/products',
        'ticket': '/tickets', 'tickets': '/tickets',
        'factura': '/invoices', 'facturas': '/invoices', 'facturacion': '/invoices', 'facturación': '/invoices', 'invoices': '/invoices',
        'caja': '/tienda/caja',
        'agenda': '/tienda/agenda',
        'inventario': '/tienda/inventario',
        'presupuesto': '/tienda/presupuestos', 'presupuestos': '/tienda/presupuestos',
        'prepago': '/tienda/prepago',
        'tienda': '/tienda',
        'configuracion': '/settings', 'configuración': '/settings', 'settings': '/settings',
        'usuario': '/users', 'usuarios': '/users', 'users': '/users',
        'kpi': '/kpis', 'kpis': '/kpis',
        'cobertura': '/coverage',
        'whatsapp': '/whatsapp',
        'stripe': '/stripe',
        'altas': '/altas',
        'lead': '/leads', 'leads': '/leads',
        'suscripcion': '/subscriptions', 'suscripciones': '/subscriptions', 'subscriptions': '/subscriptions',
        'canales': '/channel', 'canal': '/channel', 'channel': '/channel',
        'postventa': '/aftersales', 'post-venta': '/aftersales', 'aftersales': '/aftersales',
        'historial': '/history',
        'perfil': '/tienda/perfil',
        'cierres': '/tienda/cierres',
        'plantilla': '/tienda/plantilla',
        'historial-dia': '/tienda/historial-dia',
        'dia': '/tienda/historial-dia',
        'email': '/email', 'correo': '/email',
        'masivo': '/massive-processes', 'massive': '/massive-processes',
        'recursos': '/resources', 'resources': '/resources',
        'encuestas': '/surveys', 'surveys': '/surveys',
        'pagos': '/payments', 'payments': '/payments',
        'remesas': '/remittances', 'remittances': '/remittances',
      };
      
      let destino = null;
      for (const [key, url] of Object.entries(destinos)) {
        if (t.includes(key)) { destino = url; break; }
      }
      
      if (destino) {
        const nombres = { '/clientes': 'Clientes', '/products': 'Productos', '/tickets': 'Tickets', '/invoices': 'Facturación', '/tienda/caja': 'Caja', '/tienda/agenda': 'Agenda', '/tienda/inventario': 'Inventario', '/tienda/presupuestos': 'Presupuestos', '/tienda/prepago': 'Prepago', '/tienda': 'Panel Tienda', '/settings': 'Configuración', '/users': 'Usuarios', '/kpis': 'KPIs', '/coverage': 'Cobertura', '/whatsapp': 'WhatsApp', '/stripe': 'Stripe', '/altas': 'Altas', '/leads': 'Leads', '/subscriptions': 'Suscripciones', '/channel': 'Canales', '/aftersales': 'PostVenta', '/history': 'Historial', '/tienda/perfil': 'Perfil', '/tienda/cierres': 'Cierres', '/tienda/plantilla': 'Plantilla', '/tienda/historial-dia': 'Historial del Día', '/email': 'Correo', '/massive-processes': 'Procesos Masivos', '/resources': 'Recursos', '/surveys': 'Encuestas', '/payments': 'Pagos', '/remittances': 'Remesas' };
        resp = `Te llevo a <b>${nombres[destino] || destino}</b>. <a href="${destino}" target="_parent" style="display:inline-block;margin-top:8px;padding:8px 16px;background:#0050A1;color:#fff;border-radius:6px;text-decoration:none;">👉 Abrir ${nombres[destino] || destino}</a>`;
      } else {
        resp = '¿A qué sección quieres ir? Puedo llevarte a clientes, productos, facturación, tienda, caja, agenda, inventario, usuarios, configuración, kpis, y más.';
      }
    }

    // ============================
    // CHISTES
    // ============================
    else if (tienePalabras(t, ['chiste','broma','ríe','risa','humor','cuenta algo','algo gracioso','diviérteme','divierteme'])) {
      const chistes = [
        '¿Qué le dice un cable de fibra a otro? — "Tenemos buena conexión".',
        '¿Por qué el router fue al médico? — Porque tenía mala señal.',
        'Llamada de soporte: — "Mi WiFi no funciona". — "¿Has pagado la factura?" — "..."',
        '¿Cuántos informáticos hacen falta para cambiar una bombilla? — Ninguno, es un problema de hardware.',
        '— "Se me ha roto el ordenador" — "¿Has probado a apagarlo y encenderlo?" — "Sí, pero no se me ha arreglado la nevera"',
        'El cliente perfecto es como los unicornios: todo el mundo habla de ellos pero nadie ha visto uno.',
        '¿Cuál es el colmo de un informático? — Tener mala conexión a internet en su propia casa.',
        '— "He perdido el número de teléfono de mi proveedor de internet" — "No te preocupes, él tampoco tiene cobertura".',
      ];
      resp = chistes[Math.floor(Math.random() * chistes.length)];
    }

    // ============================
    // PREGUNTAS SOBRE MÍ
    // ============================
    else if (tienePalabras(t, ['quien te creo','quién te creó','quien te hizo','quién te hizo','quien te programo','quién te programó','tu creador','tu dueño','tu jefe'])) {
      resp = 'Me creó el equipo de Movilbro, integrada directamente en el CRM para ayudarte con la gestión diaria. Estoy aquí para facilitarte el trabajo.';
    }

    else if (tienePalabras(t, ['te gusta','gustas','opinión','opinion','piensas','parece','cual es tu']) && !tienePalabras(t, ['hora','fecha','nombre'])) {
      resp = `Como IA, no tengo sentimientos, pero te diré que el CRM tiene buena pinta hoy: ${formatNum(s.clientes)} clientes, ${formatEur(s.ingresosHoy)} en ingresos... ¡se mueve!`;
    }

    // ============================
    // RESPUESTA POR DEFECTO - INTELIGENTE
    // ============================
    else {
      // Analizar si la consulta parece sobre un tema específico
      const temas = [
        { patron: ['vencido','vencida','vencidas','vencidos','caducado','caducada'], resp: `Revisa las facturas vencidas en <a href="/invoices" target="_parent">Facturación</a> o los tickets en <a href="/tickets" target="_parent">Tickets</a>.` },
        { patron: ['nuevo','nueva','crear','añadir','agregar','dar de alta','registrar','insertar'], resp: `Puedes crear:\n• <b>Cliente:</b> en <a href="/clientes" target="_parent">Clientes</a> → "Nuevo Cliente"\n• <b>Producto:</b> en <a href="/products" target="_parent">Productos</a>\n• <b>Ticket:</b> en <a href="/tickets" target="_parent">Tickets</a>\n• <b>Presupuesto:</b> en <a href="/tienda/presupuestos" target="_parent">Presupuestos</a>\n• <b>Prepago:</b> en <a href="/tienda/prepago" target="_parent">Prepago</a>\n¿Cuál necesitas?` },
        { patron: ['modificar','editar','cambiar','actualizar','update','modificación','modificacion'], resp: `Puedes editar cualquier registro desde su página de detalle. ¿Qué necesitas modificar?` },
        { patron: ['eliminar','borrar','quitar','suprimir','dar de baja','baja','cancelar'], resp: `Las opciones de eliminación están en cada sección. Ten cuidado con las bajas, ¿quieres que te lleve a alguna sección en concreto?` },
        { patron: ['informe','report','reporte','listado','lista','listar','exportar','descargar','pdf','excel'], resp: `Puedes generar informes desde varias secciones. ¿Qué tipo de informe necesitas? ¿Clientes, facturas, ventas, inventario?` },
        { patron: ['como se','cómo se','cómo puedo','como puedo','como hago','cómo hago','cómo configuro','como configuro','se puede'], resp: `Dime exactamente qué necesitas hacer y te guío. Por ejemplo: "cómo creo un cliente", "cómo configuro el SMTP", "cómo hago un presupuesto".` },
        { patron: ['no funciona','error','fallo','bug','problema técnico','se ha roto','da error','pantalla en blanco','no carga','no va'], resp: `Cuéntame más del problema. ¿En qué sección ocurre? ¿Qué estabas haciendo? Si es urgente, abre un <a href="/tickets" target="_parent">Ticket de soporte</a>.` },
        { patron: ['mañana','ayer','semana','mes','año','periodo','rango','fechas','último','ultimo'], resp: `Puedes ver información por periodos en <a href="/kpis" target="_parent">KPIs</a>, <a href="/analytics" target="_parent">Analítica</a> o <a href="/history" target="_parent">Historial</a>. Dime qué periodo te interesa.` },
      ];
      
      for (const tema of temas) {
        if (tienePalabras(t, tema.patron)) {
          resp = tema.resp;
          break;
        }
      }
      
      if (!resp) {
        const fallbacks = [
          `Entiendo. Dime exactamente qué necesitas y te ayudo. Puedo consultar clientes, productos, facturas, la tienda, o llevarte a cualquier sección del CRM.`,
          `Vale. ¿Qué necesitas hacer? Puedo buscarte información, guiarte por el CRM, o contestar tus dudas.`,
          `Estoy aquí. Pregúntame lo que necesites: "cuántos clientes hay", "llévame a facturación", "resumen del CRM"...`,
          `Dime qué quieres. Puedo consultar estadísticas, buscar clientes, navegar a secciones, o lo que necesites.`,
          `Cuéntame. ¿Necesitas ayuda con algo del CRM? Puedo buscar datos, abrir secciones o responder preguntas.`,
          `¡Dime! Puedo ayudarte con el CRM de Movilbro: datos, informes, navegación, y más. ¿Qué necesitas?`,
          `Aquí estoy. ¿Sobre qué necesitas ayuda? Clientes, facturación, tienda, productos, usuarios... lo que sea.`,
        ];
        resp = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }
    }

    res.json({ response: resp });
  });

  return router;
};
