const { chromium } = require('playwright');
(async () => {
  var b = await chromium.connectOverCDP('http://127.0.0.1:9222');
  var ctx = b.contexts()[0];
  var url = 'https://6f335cd7-43a3-4f09-b6f0-1b047d1101ee-00-3ca1swasnjcq2.janeway.replit.dev';
  var p = await ctx.newPage();
  try {
    await p.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
    
    // Rellenar login
    await p.fill('input[type="text"], input[name="username"]', 'aaa1');
    await p.fill('input[type="password"]', 'aaa123');
    await new Promise(r => setTimeout(r, 500));
    
    // Click submit
    var btn = await p.$('button[type="submit"], input[type="submit"]');
    if (btn) await btn.click();
    await new Promise(r => setTimeout(r, 3000));
    
    var url2 = p.url();
    var txt = await p.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('URL tras login:', url2);
    console.log('Contenido:', txt);
    
    // Screenshot
    await p.screenshot({path:'C:\\Users\\xtptx\\Desktop\\2006\\replit_login_result.png'});
  } catch(e) { console.log('Error:', e.message.slice(0,100)); }
  await p.close();
  await b.close();
})();
