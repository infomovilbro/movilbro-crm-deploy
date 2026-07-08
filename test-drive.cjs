const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const OAUTH_CONFIG_PATH = path.join(__dirname, '.opencode', 'oauth-config.json');
const KEY_PATH = path.join(__dirname, '.opencode', 'drive-key.json');

// Test OAuth
(async () => {
console.log('=== TESTING OAUTH CONFIG ===');
const oauthCfg = JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf8'));
console.log('Has refresh_token:', !!oauthCfg.refresh_token);
console.log('Has client_id:', !!oauthCfg.client_id);
console.log('Has client_secret:', !!oauthCfg.client_secret);
console.log('refresh_token starts with:', oauthCfg.refresh_token.substring(0, 30));

try {
  const oauth2Client = new google.auth.OAuth2(oauthCfg.client_id, oauthCfg.client_secret, 'urn:ietf:wg:oauth:2.0:oob');
  oauth2Client.setCredentials({ refresh_token: oauthCfg.refresh_token });
  
  const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';
  console.log('\nROOT_FOLDER_ID:', ROOT_FOLDER_ID);
  
  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  
  const res = await drive.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 10,
    orderBy: 'name'
  });
  
  console.log('Files in root (OAuth):', res.data.files ? res.data.files.length : 0);
  if (res.data.files && res.data.files.length > 0) {
    res.data.files.forEach(f => console.log(`  ${f.name} (${f.id}) - ${f.mimeType}`));
  } else {
    console.log('  (empty - folder may not exist or no access)');
  }
  
} catch(e) {
  console.error('OAuth test error:', e.message);
}

// Test service account
console.log('\n=== TESTING SERVICE ACCOUNT ===');
const keyFile = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
console.log('Has client_email:', !!keyFile.client_email);
console.log('client_email:', keyFile.client_email);

try {
  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ['https://www.googleapis.com/auth/drive']
  });
  const drive2 = google.drive({ version: 'v3', auth });
  
  const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';
  const res2 = await drive2.files.list({
    q: `'${ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
    pageSize: 10,
    orderBy: 'name'
  });
  
  console.log('Files in root (Service Account):', res2.data.files ? res2.data.files.length : 0);
  if (res2.data.files && res2.data.files.length > 0) {
    res2.data.files.forEach(f => console.log(`  ${f.name} (${f.id}) - ${f.mimeType}`));
  } else {
    console.log('  (empty - folder may not exist or service account not shared)');
  }
} catch(e) {
  console.error('Service account error:', e.message);
}
})();
