const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  // Abrir .replit en el editor
  // En Replit, los archivos en el sidebar se pueden abrir clickeando
  // Buscamos el archivo en el arbol y hacemos click
  await p.evaluate(() => {
    // Intentar abrir .replit via el filesystem
    var items = document.querySelectorAll('[data-testid="file"], [data-testid^="file-"], .file, span, div');
    for (var el of items) {
      if (el.textContent.trim() === '.replit') {
        el.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 2000));

  // Buscar un textarea/codemirror/monaco editor
  var editor = await p.$('.cm-editor, .monaco-editor, textarea, .view-lines');
  if (!editor) {
    console.log('No se encontro editor');
    // Intentar con evaluate
    var found = await p.evaluate(() => {
      var editors = document.querySelectorAll('.cm-content, .monaco-editor .view-line');
      return editors.length > 0 ? 'si' : 'no';
    });
    console.log('Editor encontrado?:', found);

    // Maybe tree view is not expanded. Try to find files in the sidebar
    await p.evaluate(() => {
      var files = document.querySelectorAll('[class*="file"], [class*="File"], li, .item');
      for (var f of files) {
        if (f.textContent.includes('.replit')) { f.click(); return; }
      }
    });
    await new Promise(r => setTimeout(r, 2000));
  }

  var url = p.url();
  console.log('URL actual:', url);
  await p.screenshot({ path: 'C:\\Users\\xtptx\\Desktop\\2006\\replit_editor.png' });
  await b.close();
})();
