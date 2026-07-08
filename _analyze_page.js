const { chromium } = require('playwright');
(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222');
  const p = b.contexts()[0].pages()[0];
  await p.waitForTimeout(500);
  
  const analysis = await p.evaluate(() => {
    const r = {};
    
    // All buttons
    r.buttons = Array.from(document.querySelectorAll('button')).map(b => ({
      id: b.id, text: b.textContent.trim().substring(0,40), disabled: b.disabled
    }));
    
    // AI Chat panel
    const panel = document.getElementById('aiChatPanel');
    r.aiPanel = panel ? { 
      display: getComputedStyle(panel).display,
      visible: panel.offsetParent !== null,
      html: panel.innerHTML.substring(0, 200)
    } : 'NOT FOUND';
    
    // Search input value
    const si = document.getElementById('globalSearchInput');
    r.searchValue = si ? si.value : 'NOT FOUND';
    
    // WhatsApp area
    const modal = document.getElementById('whatsappModal') || document.querySelector('[class*=whatsapp]');
    r.whatsapp = modal ? modal.textContent.trim().substring(0, 300) : 'NOT FOUND';
    
    // Visible error messages
    const errorEls = document.querySelectorAll('.text-danger, .alert-danger, [class*=error]');
    r.errors = Array.from(errorEls).map(e => e.textContent.trim().substring(0, 100));
    
    // Menu items in sidebar
    const sidebar = document.getElementById('sidebar') || document.querySelector('[class*=sidebar]');
    if (sidebar) {
      r.sidebarItems = Array.from(sidebar.querySelectorAll('a, button, .nav-item')).map(el => ({
        text: el.textContent.trim().substring(0, 40),
        href: el.href || ''
      })).filter(x => x.text.length > 0);
    }
    
    // Check for QR code image
    const qrImg = document.querySelector('img[src*="qr"], img[src*="data:image"]');
    r.qrImage = qrImg ? { src: qrImg.src.substring(0, 50), width: qrImg.width } : 'NOT FOUND';
    
    return r;
  });
  
  console.log(JSON.stringify(analysis, null, 2));
  await b.close();
})().catch(e => console.error('Error:', e.message));
