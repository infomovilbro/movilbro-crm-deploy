const { chromium } = require('playwright');
const http = require('http');
const https = require('https');

const CRM_HOST = 'movilbro-crm.onrender.com';
const CHECK_INTERVAL = 3000;
let lastMsgHash = '';
const SEEN = new Set();

function postToWebhook(text) {
  return new Promise((resolve) => {
    const ts = new Date().toISOString();
    const data = JSON.stringify({ text, message: text, from: '+34677350267', source: 'whatsapp_cdp', timestamp: ts });
    const opts = {
      hostname: CRM_HOST, port: 443, path: '/codeopen/webhook/whatsapp',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 200) }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(data);
    req.end();
  });
}

async function main() {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  console.log('[WA-Bridge] CDP WhatsApp Bridge iniciado');
  
  setInterval(async () => {
    try {
      const pages = browser.contexts()[0].pages();
      const waPage = pages.find(p => p.url().includes('web.whatsapp.com'));
      if (!waPage) return;
      
      const msg = await waPage.evaluate(() => {
        const area = document.querySelector('[role="log"]');
        if (!area) return null;
        const rows = area.querySelectorAll('[role="row"], div[tabindex="-1"]');
        if (!rows.length) return null;
        const last = rows[rows.length - 1];
        const txt = (last.textContent || '').trim();
        if (!txt || txt.length < 3 || txt.length > 500) return null;
        return txt.substring(0, 200);
      });
      
      if (msg && msg !== lastMsgHash) {
        lastMsgHash = msg;
        const key = msg.substring(0, 50);
        if (!SEEN.has(key)) {
          SEEN.add(key);
          console.log('[WA-Bridge] Nuevo mensaje:', msg.substring(0, 80));
          postToWebhook(msg).then(r => {
            if (r.status === 200) console.log('[WA-Bridge] -> Enviado a CRM webhook OK');
            else console.log('[WA-Bridge] -> Webhook:', r.status, r.body?.substring(0, 100));
          });
        }
      }
    } catch(e) {}
  }, CHECK_INTERVAL);
  
  console.log('[WA-Bridge] Monitoreando WhatsApp cada ' + CHECK_INTERVAL + 'ms');
  process.on('SIGINT', () => { browser.close(); process.exit(); });
}

main().catch(e => { console.error(e); process.exit(1); });
