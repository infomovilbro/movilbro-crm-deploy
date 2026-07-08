const { db } = require('./database');

function getNextNumeroFactura(serie) {
  var year = new Date().getFullYear();

  // Check if there's a row in isp_series
  var row = db.prepare("SELECT ultimo_numero, ultimo_ejercicio FROM isp_series WHERE serie=?").get(serie);

  var ultimoNumero = 0;
  var ultimoEjercicio = 0;

  if (row) {
    ultimoNumero = row.ultimo_numero || 0;
    ultimoEjercicio = row.ultimo_ejercicio || 0;
  }

  // Reset numbering if year changed
  if (ultimoEjercicio !== year) {
    ultimoNumero = 0;
  }

  var nextNum = ultimoNumero + 1;

  // Update or insert the series counter
  if (row) {
    db.prepare("UPDATE isp_series SET ultimo_numero=?, ultimo_ejercicio=? WHERE serie=?").run(nextNum, year, serie);
  } else {
    db.prepare("INSERT INTO isp_series (serie, nombre, ultimo_numero, ultimo_ejercicio) VALUES (?, ?, ?, ?)").run(serie, 'Serie ' + serie, nextNum, year);
  }

  return {
    serie: serie,
    numero: nextNum,
    year: year,
    full: serie + '-' + String(nextNum).padStart(5, '0')
  };
}

function formatNumeroFactura(serie, numero) {
  return (serie || 'F') + '-' + String(numero || 0).padStart(5, '0');
}

module.exports = { getNextNumeroFactura, formatNumeroFactura };
