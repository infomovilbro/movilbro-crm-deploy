const LikesAPI = require('./likes-api');
const { db } = require('./database');

async function sync() {
  console.log('=== Sincronizando datos desde API Likes Telecom ===\n');
  const api = LikesAPI.getApiInstance();

  // 1. Sync customers
  console.log('1. Sincronizando clientes...');
  try {
    const customers = await api.getCustomers();
    console.log('   Obtenidos ' + customers.length + ' clientes de la API');
    const insert = db.prepare('INSERT OR IGNORE INTO clients (likes_customer_id, nombre, apellidos, dni_nif, email, telefono, direccion) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const tx = db.transaction(() => {
      let count = 0;
      for (const c of customers) {
        const name = (c.name || c.firstName || '').trim();
        const lastName = (c.lastName || c.surname || '').trim();
        const fullName = name + (lastName ? ' ' + lastName : '');
        if (!fullName) continue;
        try {
          insert.run(
            String(c.id || c.customerId || ''),
            fullName,
            '',
            c.fiscalId || c.dni_nif || '',
            c.email || '',
            c.phone || c.contactPhone || '',
            c.address || c.street || ''
          );
          count++;
        } catch(e) { /* duplicate skip */ }
      }
      console.log('   Insertados ' + count + ' clientes nuevos');
    });
    tx();
  } catch(e) { console.error('   Error clientes:', e.message); }

  // 2. Sync products
  console.log('\n2. Sincronizando productos...');
  try {
    const products = await api.getProducts();
    console.log('   Obtenidos ' + products.length + ' productos de la API');
    const insert = db.prepare('INSERT OR IGNORE INTO products (likes_product_id, nombre, tipo, descripcion, precio) VALUES (?, ?, ?, ?, ?)');
    const tx = db.transaction(() => {
      let count = 0;
      for (const p of products) {
        const name = p.productName || p.name || '';
        if (!name) continue;
        try {
          insert.run(
            String(p.productId || p.id || ''),
            name,
            p.family || p.type || 'other',
            (p.marketingText && p.marketingText[0] ? p.marketingText[0].value : '') || p.description || '',
            parseFloat(p.price || 0)
          );
          count++;
        } catch(e) {}
      }
      console.log('   Insertados ' + count + ' productos nuevos');
    });
    tx();
  } catch(e) { console.error('   Error productos:', e.message); }

  // 3. Sync subscriptions
  console.log('\n3. Sincronizando suscripciones...');
  try {
    const subs = await api.getSubscriptions();
    console.log('   Obtenidas ' + (Array.isArray(subs) ? subs.length : '?') + ' suscripciones');
    if (Array.isArray(subs) && subs.length > 0) {
      const insert = db.prepare('INSERT OR IGNORE INTO subscriptions (likes_subscription_id, client_id, linea, producto, estado, fecha_alta) VALUES (?, ?, ?, ?, ?, ?)');
      const customers = db.prepare('SELECT id, likes_customer_id FROM clients WHERE likes_customer_id IS NOT NULL').all();
      const custMap = {};
      customers.forEach(c => { custMap[c.likes_customer_id] = c.id; });
      const tx = db.transaction(() => {
        let count = 0;
        for (const s of subs) {
          const linea = s.line || s.phone || s.lineNumber || '';
          if (!linea) continue;
          const custId = custMap[s.fiscalId] || custMap[s.customerId] || null;
          try {
            insert.run(
              String(s.id || s.subscriptionId || ''),
              custId,
              linea,
              s.productName || s.product || s.plan || '',
              s.status || s.state || 'active',
              s.startDate || s.activationDate || s.createdAt || null
            );
            count++;
          } catch(e) {}
        }
        console.log('   Insertadas ' + count + ' suscripciones nuevas');
      });
      tx();
    }
  } catch(e) { console.error('   Error suscripciones:', e.message); }

  console.log('\n=== Sincronización completada ===');
  const clients = db.prepare('SELECT COUNT(*) as c FROM clients').get();
  const products = db.prepare('SELECT COUNT(*) as c FROM products').get();
  const subs = db.prepare('SELECT COUNT(*) as c FROM subscriptions').get();
  console.log('Clientes: ' + clients.c + ' | Productos: ' + products.c + ' | Suscripciones: ' + subs.c);
}

sync().catch(e => console.error('Fatal:', e.message));
