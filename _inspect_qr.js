const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const page = browser.contexts()[0].pages()[0];
  
  await page.goto('https://movilbro-crm.onrender.com/codeopen', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  
  // Full DOM inspection of QR-related elements
  const info = await page.evaluate(() => {
    const result = {};
    
    // WhatsApp button
    const btn = document.getElementById('whatsappBtn');
    result.whatsappBtn = btn ? {
      exists: true,
      rect: btn.getBoundingClientRect(),
      display: window.getComputedStyle(btn).display,
      visible: btn.offsetWidth > 0 && btn.offsetHeight > 0,
      onclick: typeof btn.onclick
    } : { exists: false };
    
    // QR Panel
    const panel = document.getElementById('waQRPanel');
    result.waQRPanel = panel ? {
      exists: true,
      right: panel.style.right,
      display: panel.style.display,
      computedDisplay: window.getComputedStyle(panel).display,
      innerHTML: panel.innerHTML.substring(0, 300)
    } : { exists: false };
    
    // QR Image
    const img = document.getElementById('waQRImage');
    result.waQRImage = img ? {
      exists: true,
      src: img.src,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      offsetWidth: img.offsetWidth,
      offsetHeight: img.offsetHeight,
      complete: img.complete,
      display: window.getComputedStyle(img).display
    } : { exists: false };
    
    // QR Loading
    const loading = document.getElementById('waQRLoading');
    result.waQRLoading = loading ? {
      exists: true,
      display: window.getComputedStyle(loading).display,
      html: loading.innerHTML.substring(0, 200)
    } : { exists: false };
    
    // QR Connected
    const connected = document.getElementById('waQRConnected');
    result.waQRConnected = connected ? {
      exists: true,
      display: window.getComputedStyle(connected).display
    } : { exists: false };
    
    // QR Error
    const error = document.getElementById('waQRError');
    result.waQRError = error ? {
      exists: true,
      display: window.getComputedStyle(error).display,
      text: error.textContent
    } : { exists: false };
    
    // Status text
    const status = document.getElementById('waStatusText');
    result.waStatusText = status ? {
      text: status.textContent,
      color: status.style.color
    } : { exists: false };
    
    return result;
  });
  
  console.log(JSON.stringify(info, null, 2));
  
  // Also check the actual QR API response
  try {
    const resp = await page.evaluate(async () => {
      const r = await fetch('/codeopen/baileys-qr');
      return await r.json();
    });
    console.log('QR API:', JSON.stringify(resp));
  } catch(e) {
    console.log('QR API error:', e.message);
  }
  
  await browser.close();
})();
