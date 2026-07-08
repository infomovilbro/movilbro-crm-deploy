const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  
  // Go directly to service settings
  await p.goto('https://dashboard.render.com/web/srv-d87dr3mq1p3s73b3a680', { timeout: 30000, waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  
  console.log('URL:', p.url());
  
  // Click on "Environment" tab
  const envTab = await p.$('a:has-text("Environment"), button:has-text("Environment"), [href*="environment"]');
  if (envTab) {
    await envTab.click();
    await p.waitForTimeout(2000);
    console.log('Clicked Environment tab');
  } else {
    // Try to find by text
    const tabs = await p.$$eval('a, button', els => 
      els.filter(e => e.textContent.includes('Environment') || e.textContent.includes('Env'))
           .map(e => ({ text: e.textContent.trim(), tag: e.tagName }))
    );
    console.log('Tabs found:', tabs);
  }
  
  await p.waitForTimeout(2000);
  await p.screenshot({ path: 'render_env.png', fullPage: true });
  
  // Look for "Add Environment Variable" button
  const addBtn = await p.$('button:has-text("Add"), button:has-text("New"), a:has-text("Add")');
  if (addBtn) {
    console.log('Found add button');
  }
  
  // Get page content to find form
  const content = await p.content();
  const envSection = content.match(/environment/i);
  console.log('Environment in page:', !!envSection);
  
  await p.close();
})().catch(e => { console.log('ERROR:', e.message); process.exit(1); });