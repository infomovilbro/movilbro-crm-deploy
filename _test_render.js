const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('JS ERROR:', msg.text());
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    
    // Login
    await page.goto('https://movilbro-crm.onrender.com/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[name="email"]', 'aaa1');
    await page.fill('input[name="password"]', 'aaa123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    // Go to codeopen
    await page.goto('https://movilbro-crm.onrender.com/codeopen', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Check for errors
    const hasErrors = await page.evaluate(() => {
      const errors = [];
      if (!document.getElementById('categoryPills')) errors.push('No categoryPills');
      if (!document.getElementById('cerebroToggle')) errors.push('No cerebroToggle');
      if (!document.querySelector('[data-cat="todos"]')) errors.push('No todos tab');
      if (!document.querySelector('[data-cat="whatsapp"]')) errors.push('No whatsapp tab');
      return errors;
    });
    
    if (hasErrors.length > 0) {
      console.log('UI ISSUES:', hasErrors);
    } else {
      console.log('UI OK - all elements present');
    }
    
    await browser.close();
    console.log('Test complete');
  } catch(e) {
    console.error('TEST ERROR:', e.message);
  }
})();
