const LikesAPI = require('./likes-api');
const { db } = require('./database');

(async () => {
  const api = LikesAPI.getApiInstance();
  const clients = db.prepare("SELECT likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL AND likes_customer_id != ''").all();
  console.log('Clients with fiscalId:', clients.length);
  let total = 0;
  const insert = db.prepare('INSERT OR IGNORE INTO subscriptions (likes_subscription_id, client_id, linea, producto, estado, fecha_alta) VALUES (?, ?, ?, ?, ?, ?)');
  for (const c of clients) {
    try {
      const data = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(c.likes_customer_id) + '&brand_id=264');
      const items = api.extractData(data);
      if (Array.isArray(items)) {
        for (const s of items) {
          const cust = db.prepare('SELECT id FROM clients WHERE likes_customer_id=?').get(c.likes_customer_id);
          if (cust) {
            try {
              insert.run(String(s.id || ''), cust.id, s.line || s.phone || '', s.productName || s.product || '', 'active', s.startDate || s.activationDate || null);
              total++;
            } catch(e) {}
          }
        }
      }
    } catch(e) {}
  }
  console.log('Total subscriptions synced:', total);
  const cnt = db.prepare('SELECT COUNT(*) as c FROM subscriptions').get();
  console.log('Local subscriptions:', cnt.c);
})();
