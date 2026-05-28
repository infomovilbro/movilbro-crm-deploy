const { chromium } = require('playwright');
(async()=>{
  try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const ctx = browser.contexts()[0];
    const pages = ctx.pages();
    const page = pages[pages.length-1];
    console.log('Connected. URL:', page.url());
    
    await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas', {waitUntil:'networkidle', timeout:20000});
    
    if(page.url().includes('login')){
      console.log('NOT LOGGED IN. Navigate to login page:');
      await page.goto('https://movilbro-crm.onrender.com/auth/login', {waitUntil:'networkidle'});
      console.log('Login page ready. Log in and then press Enter.');
      process.stdin.once('data', async () => {
        await doShot(page);
        await browser.close();
      });
    } else {
      await doShot(page);
      await browser.close();
    }
  } catch(e) {
    console.log('Error:', e.message);
    process.exit(1);
  }
})();

async function doShot(page) {
  console.log('Taking screenshot...');
  var html = await page.content();
  var m = [...html.matchAll(/isp\/facturacion\/facturas\/(\d+)/g)];
  console.log('Invoices found:', m.length);
  if(m.length > 0) {
    var id = m[m.length-1][1];
    console.log('Navigating to invoice:', id);
    await page.goto('https://movilbro-crm.onrender.com/isp/facturacion/facturas/' + id, {waitUntil:'networkidle'});
    await page.waitForTimeout(2000);
  }
  await page.screenshot({path: 'C:\\Users\\xtptx\\Desktop\\isp\\prueba2\\movilbro-crm\\factura_demo.png', fullPage: true});
  console.log('SCREENSHOT TAKEN! Saved to factura_demo.png');
}
