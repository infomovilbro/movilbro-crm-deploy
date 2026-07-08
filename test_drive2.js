// Test if Drive isAvailable locally with the service account key
const driveHelper = require('./helpers/drive');
const { db } = require('./database');

(async () => {
  console.log('isAvailable:', driveHelper.isAvailable());
  
  // Try to list root folders
  const folders = await driveHelper.listRootFolders();
  console.log('Root folders found:', folders.length);
  folders.forEach(f => console.log(' -', f.name, '| id:', f.id));
  
  // List nube folder contents
  const nubeId = await driveHelper.getNubeFolderId();
  console.log('\nNube folder ID:', nubeId);
  if (nubeId) {
    const contents = await driveHelper.listFolderContents(nubeId);
    console.log('Nube contents:', contents.length);
    contents.forEach(c => console.log(' -', c.name, c.isFolder ? '(folder)' : '', '| size:', c.size));
  }
})();
