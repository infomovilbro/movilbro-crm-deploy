// WhatsApp via Playwright Chromium on server
// Captures QR code screenshot and displays in CRM
const { chromium } = require('playwright');
const { db } = require('./database');

var browser = null;
var page = null;
var qrScreenshot = null;
var qrCodeString = null;
var isConnected = false;
var connectionState = 'idle';
var lastError = '';

async function initWA() {
  try {
    connectionState = 'starting';
    console.log('[WA-PW] Launching Chromium...');
    
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewportSize({ width: 800, height: 600 });
    
    // Monitor console for QR code
    page.on('console', msg => {
      if (msg.text().includes('QR') || msg.text().includes('qrcode')) {
        console.log('[WA-PW] Console:', msg.text().substring(0, 100));
      }
    });
    
    console.log('[WA-PW] Navigating to web.whatsapp.com...');
    await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for QR code to appear (up to 30s)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const hasCanvas = await page.evaluate(() => !!document.querySelector('canvas')).catch(() => false);
      const qrEl = await page.evaluate(() => !!document.querySelector('[data-testid="qrcode"]') || !!document.querySelector('[data-ref]')).catch(() => false);
      const text = await page.evaluate(() => document.body.innerText).catch(() => '');
      
      console.log(`[WA-PW] [${(i+1)*2}s] canvas:${hasCanvas} qrEl:${qrEl}`);
      
      if (hasCanvas) {
        // Screenshot just the QR code area
        const canvas = await page.$('canvas');
        if (canvas) {
          qrScreenshot = await canvas.screenshot({ type: 'png' });
          connectionState = 'qr';
          console.log('[WA-PW] QR code captured!');
          break;
        }
      }
      
      // Check if we need to click something to show QR
      if (text.includes('Descarga') && !hasCanvas) {
        // Try clicking the login link
        await page.evaluate(() => {
          const links = document.querySelectorAll('a, button, [role="button"]');
          for (const el of links) {
            const t = (el.textContent || '').toLowerCase();
            if (t.includes('iniciar sesi') || t.includes('teléfono') || t.includes('use web') || t.includes('whatsapp web')) {
              el.click();
              return;
            }
          }
        }).catch(() => {});
      }
    }
    
    // Check if we got QR or if connected
    const connected = await page.evaluate(() => document.title.includes('(') || document.body.innerText.includes('Chats')).catch(() => false);
    if (connected) {
      isConnected = true;
      connectionState = 'connected';
      console.log('[WA-PW] Already connected!');
    }
    
    if (!qrScreenshot && !connected) {
      connectionState = 'error';
      lastError = 'QR not found after 30s';
      console.log('[WA-PW] Failed to get QR code');
    }
    
  } catch(e) {
    connectionState = 'error';
    lastError = e.message;
    console.error('[WA-PW] Error:', e.message);
  }
}

function getQR() {
  return qrScreenshot ? 'data:image/png;base64,' + qrScreenshot.toString('base64') : null;
}

function getStatus() {
  return { connected: isConnected, state: connectionState, hasQR: !!qrScreenshot, error: lastError };
}

module.exports = { initWA, getQR, getStatus };
