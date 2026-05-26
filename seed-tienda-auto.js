const { db } = require('./database');

function seedTienda() {
  var tables = [
    'tienda_agenda', 'tienda_prepago', 'tienda_caja', 'tienda_presupuestos',
    'tienda_inventario', 'tienda_historial_dia', 'tienda_plantilla',
    'tienda_cierres', 'tienda_notas_diarias', 'tienda_devoluciones'
  ];

  // Only seed if tables are empty
  for (var t of tables) {
    try { var c = db.prepare('SELECT COUNT(*) as cnt FROM ' + t).get(); if (c.cnt > 0) return; } catch(e) { return; }
  }

  console.log('Auto-seeding tienda data...');

  db.prepare("INSERT INTO tienda_agenda (client_id, cliente_nombre, telefono, fecha, hora, tipo, motivo, estado, notas) VALUES (NULL,'Paco Gilabert','666666666','2026-04-29','12:00:00','cita','Presupuesto','pendiente','')").run();
  db.prepare("INSERT INTO tienda_agenda (client_id, cliente_nombre, telefono, fecha, hora, tipo, motivo, estado, notas) VALUES (NULL,'Cliente Ejemplo','600000000','2026-05-15','10:00:00','cita','Seguimiento','pendiente','')").run();

  db.prepare("INSERT INTO tienda_prepago (nombre, apellidos, dni_nif, telefono, email, pin, puk, operador, linea, iccid, estado, notas) VALUES ('Paco','Gilabert','12345678A','666666666','','','','Movilbro','666666666','','pendiente_activar','')").run();
  for (var i = 2; i <= 21; i++) {
    db.prepare("INSERT INTO tienda_prepago (nombre, dni_nif, telefono, operador, estado) VALUES ('Prepago " + i + "','" + (10000000 + i) + "A','6" + (10000000 + i) + "','Movilbro','pendiente_activar')").run();
  }

  db.prepare("INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria) VALUES ('2026-01-02','ingreso','Venta Movilbro 10GB',30.00,'efectivo','ventas')").run();
  db.prepare("INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria) VALUES ('2026-01-02','ingreso','Venta Fibra 600MB',49.90,'tarjeta','ventas')").run();
  for (var i = 3; i <= 25; i++) {
    var tipo = i % 3 === 0 ? 'gasto' : 'ingreso';
    var importe = tipo === 'gasto' ? (Math.random() * 100 + 10).toFixed(2) : (Math.random() * 50 + 15).toFixed(2);
    db.prepare("INSERT INTO tienda_caja (fecha, tipo, concepto, importe, metodo_pago, categoria) VALUES ('2026-0" + (Math.floor(i / 7) + 1) + "-" + (i % 28 + 1) + "','" + tipo + "','Concepto " + i + "'," + importe + ",'efectivo','ventas')").run();
  }

  db.prepare("INSERT INTO tienda_presupuestos (cliente_nombre, telefono, total, estado, notas) VALUES ('Paco Gilabert','666666666',49.90,'pendiente','Fibra 600MB')").run();
  db.prepare("INSERT INTO tienda_presupuestos (cliente_nombre, telefono, total, estado, notas) VALUES ('Maria Lopez','611111111',29.90,'pendiente','Fibra 300MB')").run();
  db.prepare("INSERT INTO tienda_presupuestos (cliente_nombre, telefono, total, estado, notas) VALUES ('Juan Perez','622222222',19.90,'aprobado','Movil 50GB')").run();
  db.prepare("INSERT INTO tienda_presupuestos (cliente_nombre, telefono, total, estado, notas) VALUES ('Ana Martinez','633333333',39.90,'rechazado','Fibra 600MB + Movil')").run();

  var artNames = ['Router WiFi 6 TP-Link','ONT Huawei HG8245','Cable RJ45 5m','Cable RJ45 10m','Patchcord Fibra SC-SC 3m','Tarjeta SIM','Funda iPhone 15','Cargador USB-C','Powerbank 10000mAh','Auriculares Bluetooth','Adaptador HDMI','Mando TV Universal','Hub USB 3.0','Disco SSD 1TB'];
  for (var a = 0; a < artNames.length; a++) {
    db.prepare("INSERT INTO tienda_inventario (nombre, tipo, cantidad, precio_compra, precio_venta, stock_minimo) VALUES ('" + artNames[a] + "','accesorio'," + (Math.floor(Math.random()*20)+5) + "," + (Math.random()*20+5).toFixed(2) + "," + (Math.random()*30+10).toFixed(2) + ",3)").run();
  }

  var hoy = new Date().toISOString().split('T')[0];
  for (var d = 0; d < 8; d++) {
    var fecha = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    var ing = (Math.random() * 300 + 100).toFixed(2);
    var gas = (Math.random() * 100 + 20).toFixed(2);
    db.prepare("INSERT INTO tienda_historial_dia (fecha, total_ingresos, total_gastos, saldo_final, num_ventas, num_presupuestos, cerrado) VALUES ('" + fecha + "'," + ing + "," + gas + "," + (parseFloat(ing)-parseFloat(gas)).toFixed(2) + "," + Math.floor(Math.random()*5+1) + "," + Math.floor(Math.random()*3) + ",1)").run();
  }

  db.prepare("INSERT INTO tienda_plantilla (nombre, apellidos, dni_nif, telefono, email, puesto, salario, horario, activo) VALUES ('Empleado','Demo','00000000Z','600000000','empleado@movilbro.com','Comercial',1200.00,'L-V 10:00-14:00 16:00-20:00',1)").run();

  for (var c = 0; c < 9; c++) {
    var f = new Date(Date.now() - c * 30 * 86400000).toISOString().split('T')[0];
    db.prepare("INSERT INTO tienda_cierres (fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia, total_ingresos, gastos, saldo, num_operaciones) VALUES ('" + f + "'," + (Math.random()*200+50).toFixed(2) + "," + (Math.random()*150+30).toFixed(2) + "," + (Math.random()*100).toFixed(2) + "," + (Math.random()*400+100).toFixed(2) + "," + (Math.random()*80+10).toFixed(2) + "," + (Math.random()*300+50).toFixed(2) + "," + Math.floor(Math.random()*10+1) + ")").run();
  }

  for (var n = 0; n < 5; n++) {
    db.prepare("INSERT INTO tienda_notas_diarias (fecha, nota, tipo) VALUES ('" + hoy + "','Nota diaria " + (n+1) + "','nota')").run();
  }

  db.prepare("INSERT INTO tienda_devoluciones (producto_nombre, cantidad, estado, motivo) VALUES ('Router WiFi 6 TP-Link',1,'pendiente','Defecto de fabrica')").run();

  console.log('Tienda data seeded successfully');
}

module.exports = { seedTienda };
