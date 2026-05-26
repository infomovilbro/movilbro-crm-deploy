const LikesAPI = require('./likes-api');
const { db } = require('./database');
const api = LikesAPI.getApiInstance();

(async () => {
  const clients = db.prepare("SELECT id, likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL AND likes_customer_id != ''").all();
  console.log('Clients:', clients.length);
  let total = 0;
  const insert = db.prepare('INSERT OR IGNORE INTO subscriptions (likes_subscription_id, client_id, linea, producto, estado, fecha_alta) VALUES (?, ?, ?, ?, ?, ?)');
  for (const c of clients) {
    try {
      const data = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(c.likes_customer_id) + '&brand_id=264');
      const items = Array.isArray(data) ? data : (data.data || data.subscriptions || data.products || []);
      for (const sub of items) {
        const subId = sub.subscriptionId || sub.orderId || '';
        const linea = sub.fixedNumber || sub.lineNumber || sub.phone || '';
        const productName = sub.productName || '';
        const created = sub.created || sub.startDate || sub.changeDate || '';
        const status = sub.status || 'active';
        if (sub.products && Array.isArray(sub.products)) {
          for (const p of sub.products) {
            const pLinea = p.fixedNumber || p.lineNumber || linea;
            const pName = p.productName || productName;
            const pId = p.orderId || subId + '_' + (p.productId || p.icc || Math.random());
            if (!pLinea && !p.icc) continue;
            try { insert.run(String(pId), c.id, pLinea, pName, status, (p.changeDate || p.startDate || created).split('T')[0]); total++; } catch(e) {}
          }
        } else {
          if (!linea && !sub.icc) continue;
          try { insert.run(String(subId), c.id, linea, productName, status, created.split('T')[0]); total++; } catch(e) {}
        }
      }
    } catch(e) { /* skip failed clients */ }
  }
  console.log('Synced:', total);
  const cnt = db.prepare('SELECT COUNT(*) as c FROM subscriptions').get();
  console.log('Local subscriptions:', cnt.c);
})();
