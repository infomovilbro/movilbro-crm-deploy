const LikesAPI = require('./likes-api');
const { db } = require('./database');
const api = LikesAPI.getApiInstance();

(async () => {
  try {
    const custs = await api.getCustomers();
    console.log('Customers from API:', custs.length);
    
    const update = db.prepare('UPDATE clients SET likes_customer_id=? WHERE dni_nif=? OR email=? OR telefono=?');
    let updated = 0;
    for (const c of custs) {
      const result = update.run(c.fiscalId || '', c.fiscalId || '', c.email || '', c.contactPhone || '');
      if (result.changes > 0) updated++;
    }
    console.log('Updated clients with fiscalId:', updated);

    const clients = db.prepare("SELECT id, likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL AND likes_customer_id != ''").all();
    console.log('Clients with fiscalId now:', clients.length);

    // Sync subscriptions
    let total = 0;
    const insert = db.prepare('INSERT OR IGNORE INTO subscriptions (likes_subscription_id, client_id, linea, producto, estado, fecha_alta) VALUES (?,?,?,?,?,?)');
    for (const c of clients) {
      try {
        const data = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(c.likes_customer_id) + '&brand_id=264');
        const items = api.extractData(data);
        if (Array.isArray(items)) {
          for (const s of items) {
            try {
              insert.run(String(s.id || ''), c.id, s.line || s.phone || '', s.productName || s.product || '', 'active', s.startDate || s.activationDate || null);
              total++;
            } catch(e) {}
          }
        }
      } catch(e) {}
    }
    console.log('Subscriptions synced:', total);
    const cnt = db.prepare('SELECT COUNT(*) as c FROM subscriptions').get();
    console.log('Local subscriptions:', cnt.c);
  } catch(e) { console.log('Error:', e.message); }
})();
