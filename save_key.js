const { db } = require('./database');
const fs = require('fs');
const key = fs.readFileSync('.opencode/drive-key.json', 'utf8');
const b64 = Buffer.from(key).toString('base64');
db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('drive_key_json',?)").run(b64);
console.log('Service account key saved to DB settings');
