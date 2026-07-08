const { db } = require('./database');
var row = db.prepare("SELECT value FROM settings WHERE key='likes_token_cache'").get();
if (row) {
  var parsed = JSON.parse(row.value);
  console.log('Token exists:', !!parsed.token);
  console.log('Token prefix:', (parsed.token || '').substring(0, 40) + '...');
  console.log('Expiry:', new Date(parsed.expiry).toISOString());
  console.log('Expired:', Date.now() > parsed.expiry);
} else {
  console.log('No token in DB');
}
var d = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
d.forEach(function(r) { console.log(r.key + ' = ' + r.value); });
