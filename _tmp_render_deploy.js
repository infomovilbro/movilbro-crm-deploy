const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = await browser.contexts()[0].newPage();
  
  // Try to access Render dashboard
  console.log('Navigating to Render dashboard...');
  await page.goto('https://dashboard.render.com/', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(function(e) {
    console.log('Could not load dashboard:', e.message.substring(0, 50));
  });
  
  await page.waitForTimeout(3000);
  console.log('URL:', page.url().substring(0, 80));
  
  // Check if we're logged in
  var text = await page.evaluate(function() { return document.body.innerText.substring(0, 1000); });
  console.log('Page text:', text.replace(/\s+/g, ' ').substring(0, 300));
  
  // Look for the service and deploy button
  var hasDeployButton = await page.evaluate(function() {
    var btns = document.querySelectorAll('button, a');
    return Array.from(btns).filter(function(b) { 
      var t = (b.textContent || '').toLowerCase();
      return t.includes('deploy') || t.includes('manual');
    }).map(function(b) { return b.textContent.trim().substring(0, 40); });
  });
  console.log('Deploy buttons:', hasDeployButton);
  
  await page.close();
  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); });
