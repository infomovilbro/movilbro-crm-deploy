const Database = require('better-sqlite3');
const path = require('path');
const cookieFile = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
try {
  const db = new Database(cookieFile, { readonly: true, fileMustExist: true });
  const cookies = db.prepare("SELECT name, host_key, value, encrypted_value FROM cookies WHERE host_key LIKE '%ispgestion%' OR host_key LIKE '%movilbro%'").all();
  console.log('Found ' + cookies.length + ' cookies:');
  cookies.forEach(c => {
    console.log('  Name: ' + c.name);
    console.log('  Host: ' + c.host_key);
    console.log('  Value: ' + (c.value || '(encrypted, length: ' + (c.encrypted_value ? c.encrypted_value.length + ' bytes)' : 'none')));
    console.log('');
  });
  db.close();
} catch(e) { console.log('Error: ' + e.message); }
