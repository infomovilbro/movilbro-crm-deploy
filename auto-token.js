const { chromium } = require('playwright');
const path = require('path');

const userDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const page = context.pages()[0] || await context.newPage();
  
  // Go to token page
  await page.goto('https://admin.alwaysdata.com/token/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  console.log('=== Page URL:', page.url());
  console.log('=== Page Title:', await page.title());
  
  // Check if we're on a login page
  const html = await page.content();
  const isLogin = html.includes('Login') || html.includes('Email') || html.includes('Password');
  console.log('=== Is Login Page:', isLogin);
  
  if (!isLogin) {
    // Look for token creation elements
    const createBtn = await page.$('text=Create') || await page.$('text=create') || await page.$('[type="submit"]');
    if (createBtn) {
      console.log('Found create button, clicking...');
      await createBtn.click();
      await page.waitForTimeout(2000);
    }
    
    // Look for input fields
    const inputs = await page.$$('input[type="text"], input:not([type="hidden"])');
    console.log('=== Inputs found:', inputs.length);
    for (const input of inputs) {
      const name = await input.getAttribute('name');
      const id = await input.getAttribute('id');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`  Input: name="${name}" id="${id}" placeholder="${placeholder}"`);
    }
    
    // Extract page text
    const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('=== Page text:', text);
    
    // Check for token values
    const tokenElements = await page.$$('[class*="token"], [class*="key"], code, pre');
    for (const el of tokenElements) {
      const text = await el.textContent();
      if (text && text.length > 10) console.log('Possible token:', text);
    }
  }
  
  await context.close();
  process.exit(0);
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
