const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const os = require('os');

const KEY_PATH = path.join(__dirname, '..', '.opencode', 'drive-key.json');
const OAUTH_CONFIG_PATH = path.join(__dirname, '..', '.opencode', 'oauth-config.json');
const ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || '1JrStvTy-l0msOmfwT1S0Jupg6Ru6Zemx';
const NUBE_FOLDER_NAME = 'nube';

let _drive = null;

function getKey() {
  try {
    if (process.env.DRIVE_KEY_JSON) {
      const raw = process.env.DRIVE_KEY_JSON;
      const decoded = Buffer.from(raw, 'base64').toString();
      console.log('[Drive] DRIVE_KEY_JSON found, decoded length:', decoded.length);
      return JSON.parse(decoded);
    }
    if (fs.existsSync(KEY_PATH)) {
      console.log('[Drive] Using key file:', KEY_PATH);
      return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
    }
    // Fallback: leer de DB settings
    try {
      var { db } = require('./../database');
      if (db) {
        var row = db.prepare("SELECT value FROM settings WHERE key='drive_key_json'").get();
        if (row && row.value) {
          var raw = row.value;
          try { return JSON.parse(raw); } catch(e) {}
          try { return JSON.parse(Buffer.from(raw, 'base64').toString()); } catch(e) {}
        }
      }
    } catch(e) {}
  } catch (e) { console.error('[Drive] Key error:', e.message); }
  return null;
}

function getOAuthConfig() {
  try {
    if (process.env.DRIVE_OAUTH_JSON) {
      const raw = process.env.DRIVE_OAUTH_JSON;
      console.log('[Drive] DRIVE_OAUTH_JSON env var found, length:', raw.length, 'starts with:', raw.substring(0, 20));
      const decoded = Buffer.from(raw, 'base64').toString();
      console.log('[Drive] DRIVE_OAUTH_JSON decoded, length:', decoded.length, 'starts with:', decoded.substring(0, 40));
      const parsed = JSON.parse(decoded);
      console.log('[Drive] OAuth config keys:', Object.keys(parsed).join(', '));
      console.log('[Drive] Has refresh_token:', !!parsed.refresh_token, 'has client_id:', !!parsed.client_id, 'has client_secret:', !!parsed.client_secret);
      return parsed;
    }
    // Try DRIVE_KEY_JSON as fallback for OAuth if DRIVE_OAUTH_JSON not set
    if (process.env.DRIVE_KEY_JSON) {
      console.log('[Drive] DRIVE_OAUTH_JSON not found, checking DRIVE_KEY_JSON for OAuth config...');
      const raw = process.env.DRIVE_KEY_JSON;
      const decoded = Buffer.from(raw, 'base64').toString();
      const parsed = JSON.parse(decoded);
      if (parsed.refresh_token || parsed.client_id) {
        console.log('[Drive] DRIVE_KEY_JSON contains OAuth fields, using it as fallback');
        return parsed;
      }
    }
    if (fs.existsSync(OAUTH_CONFIG_PATH)) {
      console.log('[Drive] Using OAuth config file:', OAUTH_CONFIG_PATH);
      return JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf8'));
    }
    if (fs.existsSync(KEY_PATH)) {
      console.log('[Drive] No OAuth config found, checking key file for OAuth fields...');
      const parsed = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
      if (parsed.refresh_token || parsed.client_id) {
        console.log('[Drive] Key file contains OAuth fields, using it');
        return parsed;
      }
    }
    // Also check DB settings for drive_oauth_json
    try {
      var { db } = require('./../database');
      if (db) {
        var dRow = db.prepare("SELECT value FROM settings WHERE key='drive_oauth_json'").get();
        if (dRow && dRow.value) {
          var raw = dRow.value;
          try { var parsed = JSON.parse(raw); if (parsed.refresh_token) { console.log('[Drive] Using drive_oauth_json from DB'); return parsed; } } catch(e) {}
          try { var decoded = Buffer.from(raw, 'base64').toString(); var parsed2 = JSON.parse(decoded); if (parsed2.refresh_token) { console.log('[Drive] Using drive_oauth_json (base64) from DB'); return parsed2; } } catch(e) {}
        }
      }
    } catch(e) {}
    console.log('[Drive] No OAuth credentials found anywhere');
  } catch (e) { console.error('[Drive] OAuth config error:', e.message); }
  return null;
}

function isOAuthAvailable() {
  const cfg = getOAuthConfig();
  return !!(cfg && cfg.refresh_token);
}

let _oauthExpiryWarning = false;

function getAuth() {
  const keyFile = getKey();
  const oauthCfg = getOAuthConfig();
  if (keyFile) console.log('[Drive] Service account key found, has client_email:', !!keyFile.client_email);
  if (oauthCfg) console.log('[Drive] OAuth config found, has refresh_token:', !!oauthCfg.refresh_token);
  if (!oauthCfg && !keyFile) console.log('[Drive] No auth credentials found - check DRIVE_KEY_JSON or DRIVE_OAUTH_JSON env vars');

  // Try OAuth first (can write to Drive, unlike Service Account)
  if (oauthCfg && oauthCfg.refresh_token && oauthCfg.client_id && oauthCfg.client_secret) {
    try {
      const oauth2Client = new google.auth.OAuth2(oauthCfg.client_id, oauthCfg.client_secret, 'urn:ietf:wg:oauth:2.0:oob');
      oauth2Client.setCredentials({ refresh_token: oauthCfg.refresh_token });
      console.log('[Drive] Using OAuth auth (can write to Drive)');
      return oauth2Client;
    } catch (e) {
      console.error('[Drive] OAuth auth error:', e.message);
    }
  }

  // Fallback to Service Account (read-only for regular Drive folders)
  if (keyFile && keyFile.client_email) {
    try {
      console.log('[Drive] Using service account auth with email:', keyFile.client_email);
      const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      return auth;
    } catch (e) {
      console.error('[Drive] Service account auth error:', e.message);
    }
  }

  console.log('[Drive] No usable auth credentials');
  return null;
}

function getDrive() {
  if (_drive) return _drive;
  const auth = getAuth();
  if (!auth) return null;
  _drive = google.drive({ version: 'v3', auth });
  return _drive;
}

async function ensureFolder(parentId, folderName) {
  const drive = getDrive();
  if (!drive) return null;
  try {
    const res = await drive.files.list({
      q: `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1
    });
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }
    const created = await drive.files.create({
      requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id'
    });
    return created.data.id;
  } catch (e) {
    console.error('ensureFolder error:', e.message);
    return null;
  }
}

async function ensureYearMonthPath(year, month) {
  const nubeId = await ensureFolder(ROOT_FOLDER_ID, NUBE_FOLDER_NAME);
  if (!nubeId) return null;
  const yearId = await ensureFolder(nubeId, String(year));
  if (!yearId) return null;
  const monthId = await ensureFolder(yearId, month);
  return monthId;
}

async function uploadToDrive(buffer, fileName, year, month) {
  const drive = getDrive();
  if (!drive) return null;
  const parentId = await ensureYearMonthPath(year, month);
  if (!parentId) return null;
  try {
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [parentId] },
      media: { mimeType: 'application/pdf', body: require('stream').Readable.from(buffer) },
      fields: 'id, webViewLink'
    });
    return { id: res.data.id, webViewLink: res.data.webViewLink };
  } catch (e) {
    console.error('uploadToDrive error:', e.message);
    return null;
  }
}

async function getFileBuffer(fileId) {
  const drive = getDrive();
  if (!drive) return null;
  try {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(res.data);
  } catch (e) {
    console.error('getFileBuffer error:', e.message);
    return null;
  }
}

async function deleteFromDrive(fileId) {
  const drive = getDrive();
  if (!drive) return false;
  try {
    await drive.files.delete({ fileId });
    return true;
  } catch (e) {
    console.error('deleteFromDrive error:', e.message);
    return false;
  }
}

async function listFiles(folderId) {
  const drive = getDrive();
  if (!drive) return [];
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, createdTime, webViewLink)',
      orderBy: 'createdTime desc'
    });
    return res.data.files || [];
  } catch (e) {
    console.error('listFiles error:', e.message);
    return [];
  }
}

async function listRootFolders() {
  const d = getDrive();
  if (!d) return [];
  try {
    const res = await d.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name != '${NUBE_FOLDER_NAME}'`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'name',
      pageSize: 50
    });
    return (res.data.files || []).map(function(f) {
      return { id: f.id, name: f.name, created: f.createdTime };
    });
  } catch (e) {
    console.error('listRootFolders error:', e.message);
    return [];
  }
}

async function listFolderContents(folderId) {
  const d = getDrive();
  if (!d) return [];
  try {
    const res = await d.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
      orderBy: 'name',
      pageSize: 100
    });
    return (res.data.files || []).map(function(f) {
      return { id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, created: f.createdTime, link: f.webViewLink, isFolder: f.mimeType === 'application/vnd.google-apps.folder' };
    });
  } catch (e) {
    console.error('listFolderContents error:', e.message);
    return [];
  }
}

async function getNubeFolderId() {
  const id = await ensureFolder(ROOT_FOLDER_ID, NUBE_FOLDER_NAME);
  return id;
}

function isAvailable() {
  if (process.env.DRIVE_OAUTH_JSON) return true;
  if (process.env.DRIVE_KEY_JSON) return true;
  if (fs.existsSync(OAUTH_CONFIG_PATH)) return true;
  if (fs.existsSync(KEY_PATH)) return true;
  const missing = [];
  if (!process.env.DRIVE_OAUTH_JSON && !fs.existsSync(OAUTH_CONFIG_PATH)) missing.push('DRIVE_OAUTH_JSON env var or ' + OAUTH_CONFIG_PATH);
  if (!process.env.DRIVE_KEY_JSON && !fs.existsSync(KEY_PATH)) missing.push('DRIVE_KEY_JSON env var or ' + KEY_PATH);
  if (missing.length > 0) {
    console.log('[Drive] No disponible - falta:', missing.join(', '));
  }
  try { return getAuth() !== null; } catch(e) { console.error('[Drive] isAvailable error:', e.message); return false; }
}

async function findMonthlyZip(year, month) {
  const monthId = await ensureYearMonthPath(year, month);
  if (!monthId) return null;
  const mName = month.toLowerCase();
  // Look for any ZIP matching the month name
  const drive = getDrive();
  if (!drive) return null;
  const res = await drive.files.list({
    q: `'${monthId}' in parents and name contains '${mName}' and mimeType='application/zip' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 5
  });
  const files = res.data.files || [];
  // Find best match (contains month name)
  for (const f of files) {
    if (f.name.toLowerCase().includes(mName)) return { id: f.id, name: f.name, parentId: monthId };
  }
  return null;
}

async function addToMonthlyZip(pdfBuffer, pdfName, year, month) {
  const drive = getDrive();
  if (!drive) return null;
  const monthId = await ensureYearMonthPath(year, month);
  if (!monthId) return null;
  const mName = month.toLowerCase();

  try {
    // Find existing ZIP or create new one
    let zipId, zipName;
    const existing = await findMonthlyZip(year, month);
    let zip;

    if (existing) {
      zipId = existing.id;
      zipName = existing.name;
      // Download existing ZIP
      const res = await drive.files.get({ fileId: zipId, alt: 'media' }, { responseType: 'arraybuffer' });
      zip = new (require('adm-zip'))(Buffer.from(res.data));
    } else {
      zipName = `facturas ${mName} ${year}.zip`;
      zip = new (require('adm-zip'))();
    }

    // Add PDF to ZIP (replace if exists)
    if (zip.getEntry(pdfName)) zip.deleteFile(pdfName);
    zip.addFile(pdfName, pdfBuffer);
    const zipBuf = zip.toBuffer();

    if (zipId) {
      // Update existing ZIP
      await drive.files.update({ fileId: zipId, media: { mimeType: 'application/zip', body: require('stream').Readable.from(zipBuf) } });
    } else {
      // Create new ZIP
      const created = await drive.files.create({
        requestBody: { name: zipName, parents: [monthId] },
        media: { mimeType: 'application/zip', body: require('stream').Readable.from(zipBuf) },
        fields: 'id'
      });
      zipId = created.data.id;
    }
    return zipId;
  } catch (e) {
    console.error('addToMonthlyZip error:', e.message);
    return null;
  }
}

async function getPDFFromMonthlyZip(pdfName, year, month) {
  try {
    const existing = await findMonthlyZip(year, month);
    if (!existing) return null;
    const drive = getDrive();
    if (!drive) return null;
    const res = await drive.files.get({ fileId: existing.id, alt: 'media' }, { responseType: 'arraybuffer' });
    const zip = new (require('adm-zip'))(Buffer.from(res.data));
    const entry = zip.getEntry(pdfName);
    if (entry) return zip.readFile(entry);
  } catch (e) { console.error('getPDFFromMonthlyZip error:', e.message); }
  return null;
}

async function listPDFsFromDriveYear(year) {
  const d = getDrive();
  if (!d) return [];
  const nubeId = await ensureFolder(ROOT_FOLDER_ID, NUBE_FOLDER_NAME);
  if (!nubeId) return [];
  const yearId = await ensureFolder(nubeId, String(year));
  if (!yearId) return [];
  try {
    const res = await d.files.list({
      q: `'${yearId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 50
    });
    const months = res.data.files || [];
    const results = [];
    for (const m of months) {
      const fileRes = await d.files.list({
        q: `'${m.id}' in parents and trashed=false`,
        fields: 'files(id, name, size)',
        pageSize: 500
      });
      const files = fileRes.data.files || [];
      files.forEach(f => {
        if (f.name.toLowerCase().endsWith('.pdf')) {
          results.push({
            fileName: f.name,
            year: String(year),
            month: m.name,
            size: parseInt(f.size || 0),
            driveId: f.id
          });
        }
      });
    }
    return results;
  } catch (e) {
    console.error('listPDFsFromDriveYear error:', e.message);
    return [];
  }
}

module.exports = { uploadToDrive, getFileBuffer, deleteFromDrive, listFiles, ensureYearMonthPath, getNubeFolderId, isAvailable, isOAuthAvailable, addToMonthlyZip, getPDFFromMonthlyZip, listRootFolders, listFolderContents, ensureFolder, listPDFsFromDriveYear, getDrive };
