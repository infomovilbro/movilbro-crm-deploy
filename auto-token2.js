const { chromium } = require('playwright');
const path = require('path');

const userDataDir = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data');

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--profile-directory=Default'
    ]
  });
  
  const page = context.pages()[0] || await context.newPage();
  
  // First check if we're already logged in by visiting the main page
  await page.goto('https://admin.alwaysdata.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  let html = await page.content();
  const isLoginPage = html.includes('Login to') || html.includes('Email') || html.includes('Password');
  console.log('Login page?', isLoginPage);
  
  if (!isLoginPage) {
    // We're logged in. Navigate to profile/tokens
    console.log('Already logged in! Navigating to tokens...');
    await page.goto('https://admin.alwaysdata.com/profile/tokens/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    console.log('Token page URL:', page.url());
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 2000));
    console.log('Page content:', bodyText);
    
    // Try to find and click create button
    const buttons = await page.$$('button, a, [role="button"]');
    console.log('Buttons:', buttons.length);
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && text.toLowerCase().includes('create')) {
        console.log('Found create button:', text);
        await btn.click();
        await page.waitForTimeout(2000);
        break;
      }
    }
    
    // Check for token after creation
    const bodyText2 = await page.evaluate(() => document.body.innerText.substring(0, 3000));
    console.log('After action:', bodyText2);
    
    // Look for token value
    const tokenMatch = bodyText2.match(/[A-Za-z0-9_-]{20,}/);
    if (tokenMatch) console.log('Possible token:', tokenMatch[0]);
  } else {
    console.log('On login page - checking cookies...');
    const cookies = await context.cookies();
    console.log('Cookies:', cookies.map(c => c.name).join(', '));
    
    // Check if we can find any alwaysdata cookies
    const adCookies = cookies.filter(c => c.domain.includes('alwaysdata'));
    console.log('AlwaysData cookies:', adCookies.map(c => c.name + '=' + c.value.substring(0,20)));
  }
  
  await context.close();
  process.exit(0);
})().catch(e => {
  console.error('Error:', e.message);
  if (e.stack) console.error(e.stack.substring(0, 500));
  process.exit(1);
});
