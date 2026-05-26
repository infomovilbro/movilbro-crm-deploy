const express = require('express');
const bcrypt = require('bcryptjs');
const { requireAuth, requireTiendaPermission } = require('../middleware/auth');
const { db } = require('../database');
const agentesLogin = require('./agentes-login');
const router = express.Router();

// Agentes login routes (before agentes page)
router.use('/agentes', agentesLogin.router);

// ============================================================
// HELPERS
// ============================================================
function generarCalendario(mes, ano) {
  const primerDia = new Date(ano, mes - 1, 1);
  const ultimoDia = new Date(ano, mes, 0);
  const hoy = getToday();
  const diasEnMes = ultimoDia.getDate();
  const diaSemanaInicio = primerDia.getDay();
  const semanas = [];
  let semana = [];
  for (let i = 0; i < diaSemanaInicio; i++) semana.push(null);
  for (let d = 1; d <= diasEnMes; d++) {
    const dateStr = `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    semana.push({ dia: d, dateStr, esHoy: dateStr === hoy });
    if (semana.length === 7) {
      semanas.push(semana);
      semana = [];
    }
  }
  if (semana.length > 0) {
    while (semana.length < 7) semana.push(null);
    semanas.push(semana);
  }
  return semanas;
}

function parsearImporteNota(texto) {
  if (!texto || typeof texto !== 'string') return null;
  let m;
  m = texto.match(/\+(\d+(?:[.,]\d+)?)\s*€?/);
  if (m) return { importe: parseFloat(m[1].replace(',', '.')), tipo: 'ingreso' };
  m = texto.match(/-(\d+(?:[.,]\d+)?)\s*€?/);
  if (m) return { importe: parseFloat(m[1].replace(',', '.')), tipo: 'gasto' };
  m = texto.match(/(?:gast[ée]|compr[ée])\s+(\d+(?:[.,]\d+)?)\s*€?/i);
  if (m) return { importe: parseFloat(m[1].replace(',', '.')), tipo: 'gasto' };
  m = texto.match(/(?:ingres[oó]|gan[ée])\s+(\d+(?:[.,]\d+)?)\s*€?/i);
  if (m) return { importe: parseFloat(m[1].replace(',', '.')), tipo: 'ingreso' };
  return null;
}

function guardarNotaDiaria(nota, userId, importeAuto, tipoAuto, persist = true) {
  if (!persist) {
    // Still parse the note for return value, but don't persist
    const hoy = getToday();
    const parsed = importeAuto ? { importe: importeAuto, tipo: tipoAuto || 'ingreso' } : parsearImporteNota(nota);
    const importe = parsed ? parsed.importe : 0;
    const tipoRegistro = parsed ? parsed.tipo : 'nota';
    return { importe, tipo: tipoRegistro };
  }

  const hoy = getToday();
  const parsed = importeAuto ? { importe: importeAuto, tipo: tipoAuto || 'ingreso' } : parsearImporteNota(nota);
  const importe = parsed ? parsed.importe : 0;
  // For the nota diaria, we always store as tipo='nota'
  const tipoNota = 'nota';
  // For the caja, we use the parsed type if available and is ingreso/gasto, else default to ingreso
  const cajaTipo = (parsed && (parsed.tipo === 'ingreso' || parsed.tipo === 'gasto')) ? parsed.tipo : 'ingreso';
  const existente = db.prepare('SELECT id, nota FROM tienda_notas_diarias WHERE fecha = ?').get(hoy);
  const notaCompleta = existente ? existente.nota + '\n• ' + nota : '• ' + nota;
  if (existente) {
    db.prepare('UPDATE tienda_notas_diarias SET nota = ?, importe = ?, tipo = ?, user_id = ? WHERE id = ?').run(notaCompleta, importe, tipoNota, userId, existente.id);
  } else {
    db.prepare('INSERT INTO tienda_notas_diarias (fecha, nota, importe, tipo, user_id) VALUES (?, ?, ?, ?, ?)').run(hoy, notaCompleta, importe, tipoNota, userId);
  }
  const concepto = importe > 0
    ? (cajaTipo === 'gasto' ? 'Gasto: ' : 'Ingreso: ') + nota.substring(0, 100)
    : 'Nota: ' + nota.substring(0, 100);
  db.prepare('INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(hoy, cajaTipo, concepto, importe, 'efectivo', 'nota_diaria', userId);
  return { importe, tipo: tipoNota };
}

// ============================================================
// PANEL TIENDA - Dashboard principal
// ============================================================
router.get('/', requireAuth, requireTiendaPermission('dashboard'), (req, res) => {
  const hoy = getToday();
  const cajaHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'ingreso'").get(hoy);
  const gastosHoy = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'gasto'").get(hoy);
  const citasHoy = db.prepare("SELECT COUNT(*) as count FROM tienda_agenda WHERE fecha = ? AND estado != 'completada'").get(hoy);
  const prepagoPend = db.prepare("SELECT COUNT(*) as count FROM tienda_prepago WHERE estado = 'pendiente_activar'").get();
  const inventarioBajo = db.prepare('SELECT COUNT(*) as count FROM tienda_inventario WHERE cantidad <= stock_minimo').get();
  const plantillaActiva = db.prepare('SELECT COUNT(*) as count FROM tienda_plantilla WHERE activo = 1').get();
  const presupPend = db.prepare("SELECT COUNT(*) as count FROM tienda_presupuestos WHERE estado = 'pendiente'").get();
  const movimientosHoy = db.prepare("SELECT c.*, u.nombre as user_name FROM tienda_caja c LEFT JOIN users u ON c.user_id = u.id WHERE c.fecha = ? ORDER BY c.created_at DESC LIMIT 10").all(hoy);
  const citasHoyList = db.prepare("SELECT * FROM tienda_agenda WHERE fecha = ? AND estado != 'completada' ORDER BY hora").all(hoy);
  const notaDiaria = db.prepare('SELECT * FROM tienda_notas_diarias WHERE fecha = ? AND tipo = ?').get(hoy, 'nota');

  res.render('tienda/index', {
    title: 'Panel Tienda',
    cajaHoy: cajaHoy.total,
    gastosHoy: gastosHoy.total,
    citasHoy: citasHoy.count,
    prepagoPend: prepagoPend.count,
    inventarioBajo: inventarioBajo.count,
    plantillaActiva: plantillaActiva.count,
    presupPend: presupPend.count,
    movimientosHoy,
    citasHoyList,
    notaDiaria
  });
});

router.post('/index/nota-diaria', requireAuth, (req, res) => {
  try {
    const { nota, importe_auto, tipo_auto } = req.body;
    const result = guardarNotaDiaria(nota || '', req.session.user?.id, importe_auto, tipo_auto);
    res.json({ ok: true, importe: result.importe, tipo: result.tipo });
  } catch (e) {
    console.error('Error guardar nota diaria:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// AGENDA
// ============================================================
router.get('/agenda', requireAuth, requireTiendaPermission('agenda'), (req, res) => {
  const { fecha, mes, ano } = req.query;
  const today = new Date();
  const filterDate = fecha || getToday();
  const mesNum = parseInt(mes) || (new Date().getMonth() + 1);
  const anoNum = parseInt(ano) || new Date().getFullYear();
  const calendario = generarCalendario(mesNum, anoNum);
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mesNombre = meses[mesNum - 1];

  const primerDiaStr = `${anoNum}-${String(mesNum).padStart(2, '0')}-01`;
  const ultimoDia = new Date(anoNum, mesNum, 0).getDate();
  const ultimoDiaStr = `${anoNum}-${String(mesNum).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  const fechasConCitas = db.prepare('SELECT DISTINCT fecha FROM tienda_agenda WHERE fecha >= ? AND fecha <= ?').all(primerDiaStr, ultimoDiaStr);
  const diasConCitas = fechasConCitas.map(f => f.fecha);

  const citas = db.prepare('SELECT a.*, u.nombre as user_name FROM tienda_agenda a LEFT JOIN users u ON a.user_id = u.id WHERE a.fecha = ? ORDER BY a.hora').all(filterDate);
  const todasFechas = db.prepare('SELECT DISTINCT fecha FROM tienda_agenda ORDER BY fecha DESC LIMIT 30').all();

  const notaDiaria = db.prepare('SELECT * FROM tienda_notas_diarias WHERE fecha = ? AND tipo = ?').get(getToday(), 'nota');

  const proximasCitas = db.prepare("SELECT * FROM tienda_agenda WHERE fecha >= ? AND fecha <= date(?, '+7 days') AND estado = 'pendiente' ORDER BY fecha, hora").all(getToday(), getToday());

  res.render('tienda/agenda', {
    title: 'Agenda Tienda',
    citas,
    filterDate,
    todasFechas,
    calendario,
    mesActual: mesNum,
    anoActual: anoNum,
    mesNombre,
    diasConCitas,
    notaDiaria,
    proximasCitas
  });
});

router.post('/agenda/crear', requireAuth, (req, res) => {
   const { cliente_nombre, telefono, fecha, hora, tipo, motivo, notas } = req.body;
   db.prepare('INSERT INTO tienda_agenda (cliente_nombre, telefono, fecha, hora, tipo, motivo, notas, user_id) VALUES (?,?,?,?,?,?,?,?)').run(cliente_nombre, telefono, fecha, hora, tipo || 'cita', motivo, notas, req.session.user?.id);
   guardarNotaDiaria(`Cita creada: ${cliente_nombre} - ${fecha} ${hora||''}${motivo ? ' ('+motivo+')' : ''}`, req.session.user?.id, null, null, false);
   res.redirect('/tienda/agenda?fecha=' + fecha);
});

router.post('/agenda/estado', requireAuth, (req, res) => {
   const { id, estado } = req.body;
   const cita = db.prepare('SELECT cliente_nombre, fecha, estado as old_estado FROM tienda_agenda WHERE id = ?').get(id);
   db.prepare('UPDATE tienda_agenda SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, id);
   if (cita) guardarNotaDiaria(`Cita #${id} (${cita.cliente_nombre}): ${cita.old_estado} → ${estado}`, req.session.user?.id, null, null, false);
   res.json({ ok: true });
});

router.post('/agenda/eliminar', requireAuth, (req, res) => {
   const cita = db.prepare('SELECT cliente_nombre, fecha FROM tienda_agenda WHERE id = ?').get(req.body.id);
   db.prepare('DELETE FROM tienda_agenda WHERE id = ?').run(req.body.id);
   if (cita) guardarNotaDiaria(`Cita eliminada: ${cita.cliente_nombre} (${cita.fecha})`, req.session.user?.id, null, null, false);
   res.json({ ok: true });
});

router.post('/agenda/nota-diaria', requireAuth, (req, res) => {
  const { nota, importe_auto, tipo_auto } = req.body;
  const result = guardarNotaDiaria(nota, req.session.user?.id, importe_auto, tipo_auto);
  res.json({ ok: true });
});

router.post('/prepago/cobrar', requireAuth, (req, res) => {
   try {
     const { id, metodo_pago, mes } = req.body;
     const cliente = db.prepare('SELECT * FROM tienda_prepago WHERE id = ?').get(id);
     if (!cliente) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
     const mesPagar = parseInt(mes) || (new Date().getMonth() + 1);
     const pagados = cliente.meses_pagados ? cliente.meses_pagados.split(',').filter(Boolean).map(Number) : [];
     const yaPagado = pagados.includes(mesPagar);
     const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

     // Handle desmarcar actions (pendiente / no_pagado)
     if (metodo_pago === 'pendiente' || metodo_pago === 'no_pagado') {
       if (!yaPagado) return res.json({ success: false, error: 'Este mes no está pagado' });
       const idx = pagados.indexOf(mesPagar);
       pagados.splice(idx, 1);
       db.prepare('UPDATE tienda_prepago SET meses_pagados = ? WHERE id = ?').run(pagados.join(','), id);
       // Remove the caja entry for this client+month
       const conceptoMes = `Prepago ${cliente.nombre} - ${mesesNombres[mesPagar]}`;
       db.prepare("DELETE FROM tienda_caja WHERE concepto = ? AND categoria = 'recarga'").run(conceptoMes);
       const label = metodo_pago === 'pendiente' ? 'marcado como pendiente' : 'marcado como no pagado';
       guardarNotaDiaria(`Prepago ${label}: ${cliente.nombre} - ${mesesNombres[mesPagar]}`, req.session.user?.id, null, null, false);
       return res.json({ success: true, message: `${cliente.nombre} ${label}` });
     }

     // Normal cobrar flow (efectivo / tarjeta / stripe)
     if (yaPagado) {
       const idx = pagados.indexOf(mesPagar);
       pagados.splice(idx, 1);
     }
     pagados.push(mesPagar);
     db.prepare('UPDATE tienda_prepago SET meses_pagados = ? WHERE id = ?').run(pagados.join(','), id);
     const hoy = getToday();
     const importe = cliente.importe || 0;
     const conceptoMes = `Prepago ${cliente.nombre} - ${mesesNombres[mesPagar]}`;
     db.prepare('INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(hoy, 'ingreso', conceptoMes, importe, metodo_pago || 'efectivo', 'recarga', req.session.user?.id);
     const accion = yaPagado ? 'Prepago recobrado' : 'Prepago cobrado';
     guardarNotaDiaria(`${accion}: ${cliente.nombre} - ${importe.toFixed(2)}€ (${metodo_pago || 'efectivo'}) - ${mesesNombres[mesPagar]}`, req.session.user?.id, null, null, false);
      res.json({ success: true, message: `${cliente.nombre} pagado (${importe.toFixed(2)}€)` });
   } catch (e) {
     console.error('Error cobrar prepago:', e);
     res.status(500).json({ success: false, error: e.message });
   }
});

// ============================================================
// CLIENTES PREPAGO
// ============================================================
router.get('/prepago', requireAuth, requireTiendaPermission('prepago'), (req, res) => {
  const todosClientes = db.prepare('SELECT * FROM tienda_prepago ORDER BY nombre').all();
  const clientes = todosClientes.filter(c => c.estado !== 'finalizado');
  const finalizados = todosClientes.filter(c => c.estado === 'finalizado');
  const mesActual = parseInt(req.query.mes) || (new Date().getMonth() + 1);
  const anoActual = new Date().getFullYear();
  const mesesNombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const mesesNombresArr = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Get payment methods from caja for each client
  const pagosPrepago = db.prepare("SELECT concepto, metodo_pago, importe, created_at, fecha FROM tienda_caja WHERE categoria = 'recarga' AND concepto LIKE 'Prepago%' ORDER BY created_at DESC").all();
  const metodoPorCliente = {};
  pagosPrepago.forEach(p => {
    const nombre = p.concepto.replace('Prepago ', '').trim();
    // Extract target month from concepto: "Prepago Cliente - Marzo"
    const mesMatch = p.concepto.match(/- (\w+)$/);
    const mesNombre = mesMatch ? mesMatch[1] : '';
    const mesIdx = mesesNombresArr.indexOf(mesNombre);
    const mesPago = mesIdx > 0 ? mesIdx : parseInt(p.fecha.split('-')[1]);
    if (!metodoPorCliente[nombre]) metodoPorCliente[nombre] = {};
    if (!metodoPorCliente[nombre][mesPago]) metodoPorCliente[nombre][mesPago] = p.metodo_pago;
  });

  const meses = [];
  for (let i = 0; i < 12; i++) {
    const mesNum = i + 1;
    const pagados = clientes.filter(c => (c.meses_pagados || '').split(',').map(Number).includes(mesNum));
    const pendientes = clientes.filter(c => !(c.meses_pagados || '').split(',').map(Number).includes(mesNum));
    const pagadosConMetodo = pagados.map(c => ({
      ...c,
      metodo_pago: metodoPorCliente[c.nombre]?.[mesNum] || 'efectivo'
    }));
    meses.push({ mes: mesNum, label: mesesNombres[i], pagados: pagados.length, total: clientes.length, pagadosDetalle: pagadosConMetodo, pendientesDetalle: pendientes });
  }
  res.render('tienda/prepago', { title: 'Clientes Prepago', clientes, finalizados, mesActual, anoActual, meses, metodoPorCliente: JSON.stringify(metodoPorCliente), pagosPrepago });
});

router.post('/prepago/crear', requireAuth, (req, res) => {
  const { nombre, apellidos, dni_nif, telefono, email, pin, puk, operador, linea, iccid, importe, notas } = req.body;
  db.prepare('INSERT INTO tienda_prepago (nombre, apellidos, dni_nif, telefono, email, pin, puk, operador, linea, iccid, importe, notas, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(nombre, apellidos || '', dni_nif || '', telefono || '', email || '', pin || '', puk || '', operador || 'Movilbro', linea || '', iccid || '', parseFloat(importe || 0), notas || '', req.session.user?.id);
  guardarNotaDiaria(`Prepago creado: ${nombre} ${apellidos||''} - ${importe||0}€/mes`, req.session.user?.id, null, null, false);
  res.redirect('/tienda/prepago');
});

router.post('/prepago/editar', requireAuth, (req, res) => {
  const { id, nombre, apellidos, dni_nif, telefono, email, pin, puk, operador, linea, iccid, importe, estado, notas } = req.body;
  const old = db.prepare('SELECT nombre FROM tienda_prepago WHERE id = ?').get(id);
  db.prepare('UPDATE tienda_prepago SET nombre=?, apellidos=?, dni_nif=?, telefono=?, email=?, pin=?, puk=?, operador=?, linea=?, iccid=?, importe=?, estado=?, notas=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nombre, apellidos || '', dni_nif || '', telefono || '', email || '', pin || '', puk || '', operador || 'Movilbro', linea || '', iccid || '', parseFloat(importe || 0), estado || 'pendiente_activar', notas || '', id);
  guardarNotaDiaria(`Prepago editado: ${old?.nombre||nombre} → ${nombre}`, req.session.user?.id, null, null, false);
  res.redirect('/tienda/prepago');
});

router.post('/prepago/finalizar', requireAuth, (req, res) => {
  const { id } = req.body;
  const cliente = db.prepare('SELECT nombre FROM tienda_prepago WHERE id = ?').get(id);
  if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  db.prepare('UPDATE tienda_prepago SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('finalizado', id);
  guardarNotaDiaria(`Prepago finalizado: ${cliente.nombre}`, req.session.user?.id, null, null, false);
  res.json({ ok: true });
});

router.post('/prepago/reactivar', requireAuth, (req, res) => {
  const { id } = req.body;
  const cliente = db.prepare('SELECT nombre FROM tienda_prepago WHERE id = ?').get(id);
  if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
  db.prepare('UPDATE tienda_prepago SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('activo', id);
  guardarNotaDiaria(`Prepago reactivado: ${cliente.nombre}`, req.session.user?.id, null, null, false);
  res.json({ ok: true });
});

router.post('/prepago/eliminar', requireAuth, (req, res) => {
  const cliente = db.prepare('SELECT nombre FROM tienda_prepago WHERE id = ?').get(req.body.id);
  db.prepare('DELETE FROM tienda_prepago WHERE id = ?').run(req.body.id);
  if (cliente) guardarNotaDiaria(`Prepago eliminado: ${cliente.nombre}`, req.session.user?.id, null, null, false);
  res.json({ ok: true });
});

// ============================================================
// CAJA / OPERACIONES
// ============================================================
router.get('/caja', requireAuth, requireTiendaPermission('caja'), (req, res) => {
  const { fecha, tipo } = req.query;
  const filterDate = fecha || getToday();
  let sql = 'SELECT c.*, u.nombre as user_name FROM tienda_caja c LEFT JOIN users u ON c.user_id = u.id WHERE c.fecha = ?';
  const params = [filterDate];
  if (tipo && (tipo === 'ingreso' || tipo === 'gasto')) {
    sql += ' AND c.tipo = ?';
    params.push(tipo);
  }
  sql += ' ORDER BY c.created_at DESC';
  const movimientos = db.prepare(sql).all(...params);
  const ingresos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'ingreso'").get(filterDate);
  const gastos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'gasto'").get(filterDate);
  res.render('tienda/caja', { title: 'Caja y Operaciones', movimientos, filterDate, ingresos: ingresos.total, gastos: gastos.total, saldo: ingresos.total - gastos.total });
});

router.post('/caja/crear', requireAuth, (req, res) => {
   const { fecha, tipo, concepto, importe, metodo_pago, categoria, descripcion } = req.body;
   db.prepare('INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria, descripcion, user_id) VALUES (?,?,?,?,?,?,?,?)').run(fecha || getToday(), tipo, concepto, parseFloat(importe), metodo_pago || 'efectivo', categoria, descripcion, req.session.user?.id);
   guardarNotaDiaria(`${tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} manual: ${concepto} - ${parseFloat(importe).toFixed(2)}€${metodo_pago ? ' ('+metodo_pago+')' : ''}`, req.session.user?.id, null, null, false);
   res.redirect('/tienda/caja?fecha=' + (fecha || ''));
});

router.post('/caja/eliminar', requireAuth, (req, res) => {
   const mov = db.prepare('SELECT concepto, importe, tipo FROM tienda_caja WHERE id = ?').get(req.body.id);
   db.prepare('DELETE FROM tienda_caja WHERE id = ?').run(req.body.id);
   if (mov) guardarNotaDiaria(`Movimiento eliminado: ${mov.concepto} - ${mov.importe.toFixed(2)}€`, req.session.user?.id, null, null, false);
   res.json({ ok: true });
});

router.post('/caja/vaciar-todo', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM tienda_caja').run();
    guardarNotaDiaria('Caja vaciada: se eliminaron todos los movimientos', req.session.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error vaciar caja:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// PRESUPUESTOS
// ============================================================
router.get('/presupuestos', requireAuth, requireTiendaPermission('presupuestos'), (req, res) => {
  const allPresupuestos = db.prepare('SELECT * FROM tienda_presupuestos ORDER BY created_at DESC').all();
  const presupuestosAbiertos = allPresupuestos.filter(p => p.estado !== 'reparado y cobrado');

  const mesesMap = {};
  const mesesNombres = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now = new Date();
  const currentYear = now.getFullYear();
  for (let i = 0; i < 12; i++) {
    const key = `${currentYear}-${String(i+1).padStart(2,'0')}`;
    mesesMap[key] = { key, label: `${mesesNombres[i]} ${currentYear}`, presupuestos: [] };
  }
  allPresupuestos.forEach(p => {
    const d = new Date(p.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!mesesMap[key]) {
      mesesMap[key] = { key, label: `${mesesNombres[d.getMonth()]} ${d.getFullYear()}`, presupuestos: [] };
    }
    mesesMap[key].presupuestos.push(p);
  });
  const meses = Object.values(mesesMap).sort((a, b) => b.key.localeCompare(a.key));

  res.render('tienda/presupuestos', { title: 'Presupuestos', presupuestosAbiertos, meses });
});

router.post('/presupuestos/crear', requireAuth, (req, res) => {
  const { cliente_nombre, telefono, email, lineas, pieza_costo, notas, mano_obra, tipo } = req.body;
  const costo = parseFloat(pieza_costo || 0);
  const iva = costo * 0.21;
  const mo = parseFloat(mano_obra || 0);
  const total = costo + iva + mo;
  db.prepare('INSERT INTO tienda_presupuestos (cliente_nombre, telefono, email, lineas, pieza_costo, total, descuento, estado, notas, mano_obra, tipo) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(cliente_nombre, telefono, email, lineas || '', costo, total, 0, 'pendiente', notas, mo, tipo || 'presupuesto');
  guardarNotaDiaria(`Presupuesto creado: ${cliente_nombre} - ${total.toFixed(2)}€ (${tipo||'presupuesto'})`, req.session.user?.id);
  res.redirect('/tienda/presupuestos');
});

router.post('/presupuestos/estado', requireAuth, (req, res) => {
  const { id, estado } = req.body;
  const presupuesto = db.prepare('SELECT * FROM tienda_presupuestos WHERE id = ?').get(id);
   if (presupuesto) {
     const nota = `Presupuesto #${id} (${presupuesto.cliente_nombre}): ${presupuesto.estado} → ${estado}`;
     guardarNotaDiaria(nota, req.session.user?.id, null, null, false);
   }
  db.prepare('UPDATE tienda_presupuestos SET estado = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estado, id);
  res.json({ ok: true });
});

router.post('/presupuestos/eliminar', requireAuth, (req, res) => {
  const p = db.prepare('SELECT cliente_nombre FROM tienda_presupuestos WHERE id = ?').get(req.body.id);
  db.prepare('DELETE FROM tienda_presupuestos WHERE id = ?').run(req.body.id);
  if (p) guardarNotaDiaria(`Presupuesto eliminado: ${p.cliente_nombre} (#${req.body.id})`, req.session.user?.id);
  res.json({ ok: true });
});

// ============================================================
// INVENTARIO
// ============================================================
router.get('/inventario', requireAuth, requireTiendaPermission('inventario'), (req, res) => {
  const items = db.prepare('SELECT * FROM tienda_inventario ORDER BY nombre').all();
  const devoluciones = db.prepare('SELECT d.*, u.nombre as user_name FROM tienda_devoluciones d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50').all();
  res.render('tienda/inventario', { title: 'Inventario', items, devoluciones });
});

router.post('/inventario/crear', requireAuth, (req, res) => {
  const { nombre, tipo, cantidad, precio_compra, precio_venta, proveedor, ubicacion, stock_minimo, notas } = req.body;
  db.prepare('INSERT INTO tienda_inventario (nombre, tipo, cantidad, precio_compra, precio_venta, proveedor, ubicacion, stock_minimo, notas) VALUES (?,?,?,?,?,?,?,?,?)').run(nombre, tipo, parseInt(cantidad || 0), parseFloat(precio_compra || 0), parseFloat(precio_venta || 0), proveedor, ubicacion, parseInt(stock_minimo || 5), notas);
  guardarNotaDiaria(`Producto creado: ${nombre} (${tipo||'sin tipo'}) - ${parseInt(cantidad||0)} uds.`, req.session.user?.id);
  res.redirect('/tienda/inventario');
});

router.post('/inventario/editar', requireAuth, (req, res) => {
  const { id, nombre, tipo, cantidad, precio_compra, precio_venta, proveedor, ubicacion, stock_minimo, notas } = req.body;
  const old = db.prepare('SELECT cantidad FROM tienda_inventario WHERE id = ?').get(id);
  db.prepare('UPDATE tienda_inventario SET nombre=?, tipo=?, cantidad=?, precio_compra=?, precio_venta=?, proveedor=?, ubicacion=?, stock_minimo=?, notas=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(nombre, tipo, parseInt(cantidad), parseFloat(precio_compra), parseFloat(precio_venta), proveedor, ubicacion, parseInt(stock_minimo), notas, id);
  if (old && parseInt(old.cantidad) !== parseInt(cantidad)) {
    guardarNotaDiaria(`Stock editado: ${nombre} -> ${parseInt(cantidad)} uds. (antes: ${old.cantidad})`, req.session.user?.id);
  }
  res.redirect('/tienda/inventario');
});

router.post('/inventario/ajustar-stock', requireAuth, (req, res) => {
  const { id, cantidad } = req.body;
  const prod = db.prepare('SELECT nombre, cantidad as old_cant FROM tienda_inventario WHERE id = ?').get(id);
  if (prod) {
    guardarNotaDiaria(`Stock ajustado: ${prod.nombre} -> ${parseInt(cantidad)} uds. (antes: ${prod.old_cant})`, req.session.user?.id);
  }
  db.prepare('UPDATE tienda_inventario SET cantidad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(parseInt(cantidad), id);
  res.json({ ok: true });
});

router.post('/inventario/eliminar', requireAuth, (req, res) => {
  const prod = db.prepare('SELECT nombre FROM tienda_inventario WHERE id = ?').get(req.body.id);
  db.prepare('DELETE FROM tienda_inventario WHERE id = ?').run(req.body.id);
  if (prod) guardarNotaDiaria(`Producto eliminado: ${prod.nombre}`, req.session.user?.id);
  res.json({ ok: true });
});

router.post('/inventario/devolucion/crear', requireAuth, (req, res) => {
  const { producto_id, producto_nombre, motivo, notas } = req.body;
  const hoy = getToday();
  const userId = req.session.user?.id;
  db.prepare('UPDATE tienda_inventario SET cantidad = MAX(0, cantidad - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(producto_id);
  db.prepare('INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria, descripcion, user_id) VALUES (?,?,?,?,?,?,?,?)').run(hoy, 'gasto', `Devolución: ${producto_nombre}`, 0, 'efectivo', 'devolucion', motivo || '', userId);
  const notaTexto = `Devolución pendiente: ${producto_nombre}${motivo ? ' - ' + motivo : ''}`;
  guardarNotaDiaria(notaTexto, userId);
  db.prepare('INSERT INTO tienda_devoluciones (producto_id, producto_nombre, cantidad, estado, motivo, fecha_devolucion, notas, user_id) VALUES (?,?,?,?,?,?,?,?)').run(producto_id, producto_nombre, 1, 'pendiente', motivo || '', hoy, notas || '', userId);
  res.json({ ok: true });
});

router.post('/inventario/devolucion/resolver', requireAuth, (req, res) => {
  const { id, resolucion } = req.body;
  const hoy = getToday();
  const estadoFinal = resolucion === 'perdida' ? 'no_devuelto' : 'finalizada';
  db.prepare('UPDATE tienda_devoluciones SET estado = ?, fecha_resolucion = ?, resolucion = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(estadoFinal, hoy, resolucion || 'dinero', id);
  const dev = db.prepare('SELECT producto_nombre FROM tienda_devoluciones WHERE id = ?').get(id);
  guardarNotaDiaria(`Devolución resuelta: ${dev.producto_nombre} - ${({ dinero: 'Devolución en dinero', articulo: 'Nos mandarán el artículo', perdida: 'Perdemos la devolución' })[resolucion] || resolucion}`, req.session.user?.id);
  res.json({ ok: true });
});

// ============================================================
// HISTORIAL DEL DÍA
// ============================================================
router.get('/historial-dia', requireAuth, requireTiendaPermission('historial'), (req, res) => {
  const { fecha } = req.query;
  const filterDate = fecha || getToday();
  const historial = db.prepare('SELECT * FROM tienda_historial_dia WHERE fecha = ?').get(filterDate);
  const movimientos = db.prepare('SELECT c.*, u.nombre as user_name FROM tienda_caja c LEFT JOIN users u ON c.user_id = u.id WHERE c.fecha = ? ORDER BY c.created_at DESC').all(filterDate);
  const todosLosDias = db.prepare('SELECT DISTINCT fecha FROM tienda_historial_dia ORDER BY fecha DESC LIMIT 30').all();
  const cajaDias = db.prepare('SELECT * FROM tienda_historial_dia ORDER BY fecha DESC LIMIT 15').all();
  res.render('tienda/historial-dia', { title: 'Historial del Día', historial, movimientos, filterDate, todosLosDias, cajaDias });
});

router.post('/historial-dia/cerrar', requireAuth, (req, res) => {
  try {
    const { fecha } = req.body;
    const targetDate = fecha || getToday();
    const ingresos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'ingreso'").get(targetDate);
    const gastos = db.prepare("SELECT COALESCE(SUM(importe),0) as total FROM tienda_caja WHERE fecha = ? AND tipo = 'gasto'").get(targetDate);
    const numOps = db.prepare('SELECT COUNT(*) as count FROM tienda_caja WHERE fecha = ? AND tipo = ?').get(targetDate, 'ingreso');
    const saldo = ingresos.total - gastos.total;
    const existente = db.prepare('SELECT id FROM tienda_historial_dia WHERE fecha = ?').get(targetDate);
    if (existente) {
      db.prepare('UPDATE tienda_historial_dia SET total_ingresos=?, total_gastos=?, saldo_final=?, num_ventas=?, cerrado=1, user_id=? WHERE fecha=?').run(ingresos.total, gastos.total, saldo, numOps.count, req.session.user?.id, targetDate);
    } else {
      db.prepare('INSERT INTO tienda_historial_dia (fecha, total_ingresos, total_gastos, saldo_final, num_ventas, cerrado, user_id) VALUES (?,?,?,?,?,1,?)').run(targetDate, ingresos.total, gastos.total, saldo, numOps.count, req.session.user?.id);
    }
    const cierreExistente = db.prepare('SELECT id FROM tienda_cierres WHERE fecha = ?').get(targetDate);
    if (!cierreExistente) {
      db.prepare('INSERT INTO tienda_cierres (fecha, total_ingresos, gastos, saldo, num_operaciones, cerrado_por) VALUES (?,?,?,?,?,?)').run(targetDate, ingresos.total, gastos.total, saldo, numOps.count, req.session.user?.id);
    }
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('json'))) {
      guardarNotaDiaria(`Día cerrado: ${targetDate} - Ingresos: ${ingresos.total.toFixed(2)}€ | Gastos: ${gastos.total.toFixed(2)}€ | Saldo: ${saldo.toFixed(2)}€`, req.session.user?.id);
      res.json({ success: true, fecha: targetDate, message: 'Día cerrado correctamente' });
    } else {
      guardarNotaDiaria(`Día cerrado: ${targetDate} - Ingresos: ${ingresos.total.toFixed(2)}€ | Gastos: ${gastos.total.toFixed(2)}€ | Saldo: ${saldo.toFixed(2)}€`, req.session.user?.id);
      res.redirect('/tienda/historial-dia?fecha=' + targetDate);
    }
  } catch (e) {
    console.error('Error cerrar día:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================
// AGENTES (formerly Plantilla) - User management with full CRM permissions
// ============================================================
// Complete list of all CRM sections with their sub-actions
const CRM_SECTIONS = {
  'Panel Tienda': {
    prefix: 'tienda',
    color: '#28a745',
    sections: {
      'dashboard': ['ver'],
      'agenda': ['ver', 'crear', 'editar', 'eliminar'],
      'prepago': ['ver', 'cobrar', 'crear', 'editar', 'eliminar'],
      'caja': ['ver', 'crear', 'eliminar'],
      'presupuestos': ['ver', 'crear', 'editar', 'eliminar'],
      'inventario': ['ver', 'crear', 'editar', 'eliminar', 'devoluciones'],
      'historial': ['ver', 'cerrar'],
      'plantilla': ['ver', 'crear', 'editar', 'eliminar'],
      'cierres': ['ver', 'crear']
    }
  },
  'Panel Clientes': {
    prefix: 'crm',
    color: '#0050A1',
    sections: {
      'kpis': ['ver'],
      'cobertura': ['ver'],
      'altas': ['ver', 'crear'],
      'clientes': ['ver', 'crear', 'editar', 'eliminar'],
      'suscripciones': ['ver', 'crear', 'editar', 'eliminar'],
      'productos': ['ver', 'crear', 'editar', 'eliminar'],
      'encuestas': ['ver'],
      'leads': ['ver', 'crear', 'editar', 'eliminar'],
      'facturas': ['ver', 'crear', 'editar', 'eliminar'],
      'pagos': ['ver'],
      'remesas': ['ver'],
      'recursos': ['ver', 'crear', 'editar', 'eliminar'],
      'tickets': ['ver', 'crear', 'editar', 'eliminar'],
      'configuracion': ['ver', 'editar']
    }
  },
  'PostVenta': {
    prefix: 'postventa',
    color: '#fd7e14',
    sections: {
      'portabilidades': ['ver', 'crear', 'editar', 'eliminar'],
      'instalaciones': ['ver', 'crear', 'editar', 'eliminar'],
      'ordenes': ['ver', 'crear', 'editar', 'eliminar'],
      'envios': ['ver', 'crear', 'editar', 'eliminar'],
      'penalizaciones': ['ver', 'crear', 'editar', 'eliminar'],
      'procesos': ['ver', 'crear', 'editar', 'eliminar'],
      'masivos': ['ver', 'crear']
    }
  },
  'Redes y Herramientas': {
    prefix: 'redes',
    color: '#6f42c1',
    sections: {
      'canales': ['ver', 'crear', 'editar', 'eliminar'],
      'correo': ['ver'],
      'stripe': ['ver', 'crear', 'cobrar'],
      'whatsapp': ['ver', 'enviar'],
      'ia': ['ver']
    }
  }
};

router.get('/agentes', requireAuth, requireTiendaPermission('plantilla'), require('./agentes-login').requireAgenteAuth, (req, res) => {
  const agentes = db.prepare(`
    SELECT u.id, u.username, u.nombre, u.email, u.rol, u.permissions, u.created_at,
           t.apellidos, t.puesto, t.salario, t.activo, t.user_id
    FROM users u
    LEFT JOIN tienda_plantilla t ON t.user_id = u.id
    ORDER BY u.nombre
  `).all();
  const sections = CRM_SECTIONS;
  res.render('tienda/agentes', { title: 'Gestión de Agentes', agentes, sections });
});

// Alias for backwards compatibility
router.get('/plantilla', requireAuth, (req, res) => {
  res.redirect('/tienda/agentes');
});

router.post('/plantilla/crear', requireAuth, (req, res) => {
  try {
    const { username, password, nombre, apellidos, email, puesto, salario, rol, activo } = req.body;
    if (!username || !password || !nombre) return res.json({ ok: false, error: 'Usuario, contraseña y nombre obligatorios' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.json({ ok: false, error: 'El nombre de usuario ya existe' });
    const perms = {};
    Object.keys(req.body).forEach(k => {
      if (k.startsWith('perm_')) perms[k.replace('perm_', '')] = true;
    });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, nombre, email, rol, permissions) VALUES (?,?,?,?,?,?)').run(username, hash, nombre, email || null, rol || 'user', JSON.stringify(perms));
    const userId = result.lastInsertRowid;
    db.prepare('INSERT INTO tienda_plantilla (nombre, apellidos, dni_nif, telefono, email, puesto, salario, activo, notas, user_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(nombre, apellidos || '', '', '', email || '', puesto || '', parseFloat(salario || 0), parseInt(activo !== undefined && activo !== '' ? activo : 1), '', userId);
    guardarNotaDiaria(`Usuario creado: ${nombre} ${apellidos||''} - ${username}`, req.session.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error crear usuario:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/plantilla/editar', requireAuth, (req, res) => {
  try {
    const { id, username, password, nombre, apellidos, email, puesto, salario, rol, activo } = req.body;
    if (!id || !nombre) return res.json({ ok: false, error: 'ID y nombre obligatorios' });
    const perms = {};
    Object.keys(req.body).forEach(k => {
      if (k.startsWith('perm_')) perms[k.replace('perm_', '')] = true;
    });
    const permsJson = JSON.stringify(perms);
    if (password && password.trim()) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET nombre=?, email=?, rol=?, password=?, permissions=? WHERE id=?').run(nombre, email || null, rol || 'user', hash, permsJson, id);
    } else {
      db.prepare('UPDATE users SET nombre=?, email=?, rol=?, permissions=? WHERE id=?').run(nombre, email || null, rol || 'user', permsJson, id);
    }
    const pActivo = parseInt(activo !== undefined && activo !== '' ? activo : 1);
    const existing = db.prepare('SELECT id FROM tienda_plantilla WHERE user_id = ?').get(id);
    if (existing) {
      db.prepare('UPDATE tienda_plantilla SET nombre=?, apellidos=?, email=?, puesto=?, salario=?, activo=? WHERE user_id=?').run(nombre, apellidos || '', email || '', puesto || '', parseFloat(salario || 0), pActivo, id);
    } else {
      db.prepare('INSERT INTO tienda_plantilla (nombre, apellidos, email, puesto, salario, activo, user_id) VALUES (?,?,?,?,?,?,?)').run(nombre, apellidos || '', email || '', puesto || '', parseFloat(salario || 0), pActivo, id);
    }
    guardarNotaDiaria(`Usuario editado: ${nombre} ${apellidos||''}`, req.session.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error editar usuario:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/plantilla/eliminar', requireAuth, (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ ok: false, error: 'ID requerido' });
    if (parseInt(id) === req.session.user.id) return res.json({ ok: false, error: 'No puedes eliminarte a ti mismo' });
    const user = db.prepare('SELECT nombre FROM users WHERE id = ?').get(id);
    db.prepare('DELETE FROM tienda_plantilla WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (user) guardarNotaDiaria(`Usuario eliminado: ${user.nombre}`, req.session.user?.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Error eliminar usuario:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ============================================================
// HISTORIAL DE CIERRES
// ============================================================
router.get('/cierres', requireAuth, requireTiendaPermission('cierres'), (req, res) => {
  const cierres = db.prepare('SELECT c.*, u.nombre as user_name FROM tienda_cierres c LEFT JOIN users u ON c.cerrado_por = u.id ORDER BY c.fecha DESC').all();
  res.render('tienda/cierres', { title: 'Cierres', cierres });
});

router.post('/cierres/crear', requireAuth, (req, res) => {
  const { fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia, gastos, observaciones } = req.body;
  const totalIng = parseFloat(ingresos_efectivo || 0) + parseFloat(ingresos_tarjeta || 0) + parseFloat(ingresos_transferencia || 0);
  const saldo = totalIng - parseFloat(gastos || 0);
  const numOps = db.prepare("SELECT COUNT(*) as count FROM tienda_caja WHERE fecha = ? AND tipo = 'ingreso'").get(fecha);
  db.prepare('INSERT INTO tienda_cierres (fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia, total_ingresos, gastos, saldo, num_operaciones, observaciones, cerrado_por) VALUES (?,?,?,?,?,?,?,?,?,?)').run(fecha, parseFloat(ingresos_efectivo || 0), parseFloat(ingresos_tarjeta || 0), parseFloat(ingresos_transferencia || 0), totalIng, parseFloat(gastos || 0), saldo, numOps.count, observaciones, req.session.user?.id);
  res.redirect('/tienda/cierres');
});

// ============================================================
// PERFIL
// ============================================================
router.get('/perfil', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user?.id);
  res.render('tienda/perfil', { title: 'Perfil Tienda', user });
});

module.exports = router;
