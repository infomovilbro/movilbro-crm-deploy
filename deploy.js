const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0].pages().find(p => p.url().includes('movilbro-crm-deploy'));
  if (!page) { console.log('No page'); process.exit(); }
  
  // git pull
  await page.keyboard.type('git pull', { delay: 15 });
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 6000));
  
  // pkill
  await page.keyboard.type('pkill -9 -f node', { delay: 15 });
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 3000));
  
  // npm start
  await page.keyboard.type('npm start', { delay: 15 });
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('Enter');
  
  console.log('Done');
  process.exit();
})().catch(e => { console.log('ERR:', e.message); process.exit(); });
