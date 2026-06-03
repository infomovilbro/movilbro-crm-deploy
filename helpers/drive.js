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
      return JSON.parse(Buffer.from(process.env.DRIVE_KEY_JSON, 'base64').toString());
    }
    if (fs.existsSync(KEY_PATH)) {
      return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
    }
  } catch (e) { console.error('Drive key error:', e.message); }
  return null;
}

function getOAuthConfig() {
  try {
    if (process.env.DRIVE_OAUTH_JSON) {
      return JSON.parse(Buffer.from(process.env.DRIVE_OAUTH_JSON, 'base64').toString());
    }
    if (fs.existsSync(OAUTH_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(OAUTH_CONFIG_PATH, 'utf8'));
    }
  } catch (e) { console.error('OAuth config error:', e.message); }
  return null;
}

function isOAuthAvailable() {
  const cfg = getOAuthConfig();
  return !!(cfg && cfg.refresh_token);
}

function getAuth() {
  const cfg = getOAuthConfig();
  if (cfg && cfg.refresh_token && cfg.client_id && cfg.client_secret) {
    try {
      const oauth2Client = new google.auth.OAuth2(cfg.client_id, cfg.client_secret, 'urn:ietf:wg:oauth:2.0:oob');
      oauth2Client.setCredentials({ refresh_token: cfg.refresh_token });
      return oauth2Client;
    } catch (e) {
      console.error('OAuth auth error:', e.message);
    }
  }
  try {
    const key = getKey();
    if (!key) return null;
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    return auth;
  } catch (e) {
    console.error('Drive auth error:', e.message);
    return null;
  }
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

async function getNubeFolderId() {
  const id = await ensureFolder(ROOT_FOLDER_ID, NUBE_FOLDER_NAME);
  return id;
}

function isAvailable() {
  try { return getAuth() !== null; } catch(e) { return false; }
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

module.exports = { uploadToDrive, getFileBuffer, deleteFromDrive, listFiles, ensureYearMonthPath, getNubeFolderId, isAvailable, isOAuthAvailable, addToMonthlyZip, getPDFFromMonthlyZip };
