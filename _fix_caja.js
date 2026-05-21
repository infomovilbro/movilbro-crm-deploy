const db = require('better-sqlite3')('./movilbro.db');
const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Check Juan Cabello Casado
const juan = db.prepare("SELECT * FROM tienda_prepago WHERE nombre LIKE '%JUAN CABELLO%'").all();
console.log('Juan Cabello:', JSON.stringify(juan, null, 2));

// Check ALL entries in caja
const allCaja = db.prepare("SELECT id, concepto, fecha, importe, metodo_pago, tipo FROM tienda_caja ORDER BY id").all();
console.log('\nALL CAJA ENTRIES:');
allCaja.forEach(c => console.log('  #' + c.id + ' ' + c.fecha + ' ' + c.tipo + ' ' + c.concepto + ' ' + (c.importe||0) + ' ' + c.metodo_pago));
