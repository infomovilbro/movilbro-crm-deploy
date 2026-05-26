const Database = require('better-sqlite3');
const path = require('path');
const srcDb = path.join('C:\\Users\\xtptx\\Desktop\\fusionapiservidor\\prueba2\\movilbro-crm\\movilbro.db');
const dstDb = path.join('C:\\Users\\xtptx\\Desktop\\isp\\prueba2\\movilbro-crm\\movilbro.db');

// Read from source DB
const src = new Database(srcDb, { readonly: true });
const settings = src.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
console.log('Original DB settings:');
settings.forEach(s => console.log('  ' + s.key + ' = ' + s.value));
src.close();

// Write to destination DB
const dst = new Database(dstDb);
const upsert = dst.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
settings.forEach(s => upsert.run(s.key, s.value));
console.log('\nCopied to new DB');

// Also copy any other relevant settings
const otherKeys = ['likes_api_url', 'likes_client_id', 'likes_client_secret', 'likes_brand_id'];
const tx = dst.transaction(() => {
  otherKeys.forEach(key => {
    const val = dst.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (val) console.log('  ' + key + ': ' + val.value);
  });
});
tx();
dst.close();
