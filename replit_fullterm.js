const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  var p = pages.find(pg => pg.url().includes('replit.com'));
  if (!p) { console.log('No Replit'); await b.close(); return; }
  await p.bringToFront();
  await new Promise(r => setTimeout(r, 3000));

  // Try to read xterm content - newer Replit uses canvas
  var lines = await p.evaluate(() => {
    // Try multiple selectors
    var sel = ['.xterm-rows .xterm-row', '.xterm-rows div', '.terminal .xterm-row textarea'];
    for (var s of sel) {
      var els = document.querySelectorAll(s);
      if (els.length > 0) return Array.from(els).map(e => e.textContent);
    }
    // Maybe canvas-based, read from textarea directly
    var ta = document.querySelector('.xterm-helper-textarea');
    if (ta) return ['textarea has: ' + ta.value];
    return ['No terminal content found'];
  });
  console.log('=== TERMINAL ===');
  for (var l of lines) console.log(l);

  // Check the URL for any errors
  console.log('URL:', p.url().substring(0, 150));

  await b.close();
})();
