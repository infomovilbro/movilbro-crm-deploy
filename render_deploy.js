const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  // Go to Render dashboard
  await p.goto('https://dashboard.render.com', { timeout: 30000, waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  
  console.log('URL:', p.url());
  
  // Check if need login
  if (p.url().includes('login') || p.url().includes('signin')) {
    console.log('Need to login...');
    // Try to find email/password fields
    const inputs = await p.$$('input');
    console.log('Found inputs:', inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      const type = await inputs[i].getAttribute('type');
      const name = await inputs[i].getAttribute('name');
      const placeholder = await inputs[i].getAttribute('placeholder');
      console.log(`Input ${i}: type=${type}, name=${name}, placeholder=${placeholder}`);
    }
  } else {
    console.log('Already logged in, looking for service...');
    // Find the service link
    const serviceLinks = await p.$$eval('a', els => 
      els.filter(e => e.textContent.includes('movilbro') || e.href.includes('movilbro'))
           .map(e => ({ text: e.textContent.trim(), href: e.href }))
    );
    console.log('Service links:', serviceLinks);
  }
  
  await p.waitForTimeout(5000);
  await p.screenshot({ path: 'render_dashboard.png', fullPage: true });
  console.log('Screenshot saved');
  
  await p.close();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });