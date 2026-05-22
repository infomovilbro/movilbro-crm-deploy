const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const db = new Database('C:/Users/IVAN/Desktop/prueba2servidor/prueba2/movilbro-crm/movilbro.db');

const hash = bcrypt.hashSync('aaa', 10);
const r = db.prepare("UPDATE users SET password = ? WHERE LOWER(username) = 'aaa'").run(hash);
console.log('Usuarios actualizados:', r.changes);

const u = db.prepare("SELECT id, username, email FROM users WHERE LOWER(username) = 'aaa'").get();
console.log('Usuario temporal activo:', u);

db.close();
