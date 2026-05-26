const { db } = require('./database');

const hoy = new Date().toISOString().split('T')[0];

// Verificar si ya existe el demo
const demoClient = db.prepare("SELECT id FROM clients WHERE nombre = 'Demo Cliente ISP'").get();
if (demoClient) { console.log('Demo ya existe. Saltando.'); process.exit(0); }

// 1. Usuario demo
let userId = db.prepare("SELECT id FROM users WHERE username = 'infomovilbro'").get()?.id;

// 2. Cliente demo
db.prepare("INSERT INTO clients (nombre, apellidos, dni_nif, email, telefono, direccion, ciudad, notas) VALUES (?,?,?,?,?,?,?,?)").run(
  'Demo Cliente ISP', 'Pruebas', 'DEMO00001T', 'demo@movilbro.local', '600000000', 'Calle Demo 1', 'Antequera', '@demo'
);
const clientId = db.prepare("SELECT id FROM clients WHERE nombre = 'Demo Cliente ISP'").get().id;

// 3. Tarifas demo
if (!db.prepare("SELECT id FROM isp_tarifas WHERE nombre='Fibra 100Mb Demo'").get()) {
  db.prepare("INSERT INTO isp_tarifas (nombre, tipo, descripcion, precio, velocidad, datos_gb, minutos) VALUES (?,?,?,?,?,?,?)").run('Fibra 100Mb Demo', 'fibra', '100Mb simétricos - DEMO', 29.90, '100Mb', '', '');
  db.prepare("INSERT INTO isp_tarifas (nombre, tipo, descripcion, precio, datos_gb, minutos) VALUES (?,?,?,?,?,?)").run('Móvil 10GB Demo', 'movil', '10GB+llamadas ilimitadas - DEMO', 15.00, '10', 'ilimitados');
}
const tarifaFibra = db.prepare("SELECT id FROM isp_tarifas WHERE nombre='Fibra 100Mb Demo'").get();

// 4. Descuentos
if (!db.prepare("SELECT id FROM isp_descuentos WHERE nombre='Pack Demo'").get()) {
  db.prepare("INSERT INTO isp_descuentos (nombre, tipo, valor, aplica_a) VALUES (?,?,?,?)").run('Pack Demo', 'porcentaje', 20, 'fibra_movil');
}
if (!db.prepare("SELECT id FROM isp_permanencias WHERE nombre='12 meses Demo'").get()) {
  db.prepare("INSERT INTO isp_permanencias (nombre, meses, penalizacion) VALUES (?,?,?)").run('12 meses Demo', 12, 50);
}

// 5. Contrato demo
db.prepare("INSERT INTO isp_contratos (client_id, tipo, tarifa, precio, estado, fecha_alta, linea, notas) VALUES (?,?,?,?,?,?,?,?)").run(clientId, 'fibra', tarifaFibra.nombre, 29.90, 'activo', hoy, '600000001', '@demo');
const contratoId = db.prepare("SELECT id FROM isp_contratos WHERE client_id=? ORDER BY id DESC LIMIT 1").get(clientId).id;

// 6. Portabilidad demo
db.prepare("INSERT INTO isp_portabilidades (contrato_id, client_id, linea, operador_origen, operador_destino, estado, referencia, notas) VALUES (?,?,?,?,?,?,?,?)").run(contratoId, clientId, '600000001', 'Yoigo', 'Movilbro', 'pendiente', 'REF-DEMO-001', '@demo');

// 7. Workflow tipos
if (!db.prepare("SELECT id FROM isp_workflow_tipos WHERE nombre='Activación Demo'").get()) {
  db.prepare("INSERT INTO isp_workflow_tipos (nombre, descripcion, departamento, icono) VALUES (?,?,?,?)").run('Activación Demo', 'Proceso demo', 'Soporte Técnico', 'fa-phone');
  db.prepare("INSERT INTO isp_workflow_tipos (nombre, descripcion, departamento, icono) VALUES (?,?,?,?)").run('Instalación Demo', 'Instalación demo', 'Instalaciones', 'fa-wifi');
}
const wfTipo = db.prepare("SELECT id FROM isp_workflow_tipos WHERE nombre='Activación Demo'").get();

// 8. Workflows
db.prepare("INSERT INTO isp_workflows (tipo_id, client_id, titulo, descripcion, estado, prioridad, user_id) VALUES (?,?,?,?,?,?,?)").run(wfTipo.id, clientId, 'Activar línea demo 600000001', 'Activación de prueba', 'pendiente', 'normal', userId);
const wfId = db.prepare("SELECT id FROM isp_workflows ORDER BY id DESC LIMIT 1").get().id;
db.prepare("INSERT INTO isp_workflow_tareas (workflow_id, nombre, orden) VALUES (?,?,?)").run(wfId, 'Verificar documentación', 1);
db.prepare("INSERT INTO isp_workflow_tareas (workflow_id, nombre, orden) VALUES (?,?,?)").run(wfId, 'Activar en plataforma', 2);
db.prepare("INSERT INTO isp_workflow_tareas (workflow_id, nombre, orden) VALUES (?,?,?)").run(wfId, 'Confirmar con cliente', 3);

// 9. Incidencias
db.prepare("INSERT INTO isp_incidencias (categoria, client_id, asunto, descripcion, estado, prioridad, user_id) VALUES (?,?,?,?,?,?,?)").run('Directas', clientId, 'Problema de conexión demo', 'El cliente reporta cortes de prueba', 'abierta', 'media', userId);

// 10. Tareas
db.prepare("INSERT INTO isp_tareas (titulo, prioridad, client_id, user_id) VALUES (?,?,?,?)").run('Revisar instalación demo', 'alta', clientId, userId);

// 11. Tickets
db.prepare("INSERT INTO tickets (client_id, asunto, descripcion, prioridad, departamento, user_id) VALUES (?,?,?,?,?,?)").run(clientId, 'Consulta demo', 'Ticket de prueba', 'normal', 'Soporte Técnico', userId);

// 12. Caja
db.prepare("INSERT INTO isp_caja (fecha, tipo, concepto, importe, metodo_pago, client_id, descripcion, user_id) VALUES (?,?,?,?,?,?,?,?)").run(hoy, 'ingreso', 'Pago demo contrato fibra', 29.90, 'efectivo', clientId, '@demo', userId);

// 13. Artículos
if (!db.prepare("SELECT id FROM isp_articulos WHERE codigo='DEMO-001'").get()) {
  db.prepare("INSERT INTO isp_articulos (codigo, nombre, fabricante, categoria, stock, stock_minimo, precio_compra, precio_venta, notas) VALUES (?,?,?,?,?,?,?,?,?)").run('DEMO-001', 'Router WiFi Demo', 'TP-Link', 'router', 10, 3, 35, 69, '@demo');
}

// 14. Nodos y equipos
if (!db.prepare("SELECT id FROM isp_nodos WHERE nombre='Nodo Demo'").get()) {
  db.prepare("INSERT INTO isp_nodos (nombre, direccion, tipo, notas) VALUES (?,?,?,?)").run('Nodo Demo', 'Calle Demo 1', 'nodo', '@demo');
  const nodoId = db.prepare("SELECT id FROM isp_nodos WHERE nombre='Nodo Demo'").get().id;
  db.prepare("INSERT INTO isp_equipos (nombre, nodo_id, tipo, fabricante, modelo, ip, mac, cliente_id, notas) VALUES (?,?,?,?,?,?,?,?,?)").run('Router Demo', nodoId, 'router', 'MikroTik', 'RB750Gr3', '10.0.0.1', '00:11:22:33:44:55', clientId, '@demo');
}

// 15. Plantillas
if (!db.prepare("SELECT id FROM isp_plantillas WHERE nombre='Bienvenida Demo'").get()) {
  db.prepare("INSERT INTO isp_plantillas (nombre, tipo, contenido) VALUES (?,?,?)").run('Bienvenida Demo', 'email', 'Bienvenido a Movilbro. Sus datos demo...');
}

// 16. Campañas
if (!db.prepare("SELECT id FROM isp_campanas WHERE nombre='Campaña Demo'").get()) {
  db.prepare("INSERT INTO isp_campanas (nombre, descripcion, tipo, estado, presupuesto) VALUES (?,?,?,?,?)").run('Campaña Demo', 'Campaña de pruebas', 'email', 'activa', 100);
}

// 17. Noticias
if (!db.prepare("SELECT id FROM isp_noticias WHERE titulo='Novedad Demo'").get()) {
  db.prepare("INSERT INTO isp_noticias (titulo, contenido, categoria, importante, user_id) VALUES (?,?,?,?,?)").run('Novedad Demo', 'Bienvenido al sistema ISP demo', 'general', 1, userId);
}

// 18. Eventos
db.prepare("INSERT INTO isp_eventos (titulo, fecha_inicio, tipo, client_id, user_id, color) VALUES (?,?,?,?,?,?)").run('Instalación Demo', hoy + ' 10:00', 'instalacion', clientId, userId, '#00a65a');

// 19. Listados
if (!db.prepare("SELECT id FROM isp_listados WHERE titulo='Clientes activos demo'").get()) {
  db.prepare("INSERT INTO isp_listados (titulo, tipo, categoria, descripcion) VALUES (?,?,?,?)").run('Clientes activos demo', 'listado', 'Clientes', '@demo');
}

console.log('=== DEMO DATA CREADO ===');
console.log('Cliente: Demo Cliente ISP (id: ' + clientId + ')');
console.log('Login: infomovilbro / movilbro2026');
console.log('Para borrar el demo usa: node cleanup-demo.js');
