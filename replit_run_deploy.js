const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var pages = ctx.pages();
  console.log('Paginas:', pages.length);
  for (var p of pages) {
    var url = p.url();
    console.log(' -', url.substring(0, 130));
    if (url.includes('replit.com')) {
      await p.bringToFront();
      await new Promise(r => setTimeout(r, 2000));
      
      // Click Shell tab
      await p.evaluate(() => {
        for (var el of document.querySelectorAll('button'))
          if (el.textContent.trim() === 'Shell') { el.click(); break; }
      });
      await new Promise(r => setTimeout(r, 2000));

      // Ctrl+C
      await p.keyboard.press('Control+c');
      await new Promise(r => setTimeout(r, 1000));

      // Focus textarea
      await p.evaluate(() => {
        var ta = document.querySelector('.xterm-helper-textarea');
        if (ta) ta.focus();
      });
      await new Promise(r => setTimeout(r, 500));

      // keyboard.type
      await p.keyboard.type('bash deploy.sh', {delay: 15});
      await new Promise(r => setTimeout(r, 500));
      await p.keyboard.press('Enter');
      console.log('bash deploy.sh enviado');
    }
  }
  await new Promise(r => setTimeout(r, 35000));
  await b.close();
})();
