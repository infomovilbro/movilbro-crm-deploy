const { db } = require('./database');
const LikesAPI = require('./likes-api');

async function test() {
  const stripeKey = db.prepare("SELECT value FROM settings WHERE key='stripe_secret_key'").get()?.value;
  console.log('Stripe key found:', !!stripeKey);
  
  const stripe = require('stripe')(stripeKey);
  
  const api = LikesAPI.getApiInstance();
  const customers = await api.getCustomers();
  
  // Test just the first customer
  const c = customers[0];
  const fiscalId = c.fiscalId || '';
  const email = c.email || '';
  const nombre = c.name + ' ' + (c.firstSurname || '');
  
  console.log('\nTesting customer:', nombre, fiscalId, email);
  
  try {
    // Check stored
    const storedId = db.prepare("SELECT value FROM settings WHERE key='stripe_customer_" + fiscalId + "'").get();
    console.log('Stored ID:', storedId?.value || 'none');
    
    // Create customer
    const newCust = await stripe.customers.create({
      email: email || 'noemail_' + fiscalId + '@movilbro.com',
      name: nombre,
      metadata: { fiscalId: fiscalId }
    });
    console.log('Stripe customer created:', newCust.id);
    
    // Store it
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('stripe_customer_' + fiscalId, newCust.id);
    console.log('Stored in DB');
    
    // Create invoice
    const inv = await stripe.invoices.create({
      customer: newCust.id,
      collection_method: 'charge_automatically',
      auto_advance: false,
      description: 'Test invoice',
      metadata: { periodo: '2026-05', fiscalId: fiscalId }
    });
    console.log('Invoice created:', inv.id);
    
    // Add item
    await stripe.invoiceItems.create({
      customer: newCust.id,
      amount: 2990,
      currency: 'eur',
      description: 'Test product',
      invoice: inv.id
    });
    console.log('Item added');
    
    // Finalize
    const finalized = await stripe.invoices.finalizeInvoice(inv.id);
    console.log('Finalized:', finalized.id, 'Payment:', finalized.payment_intent);
    
    // Cleanup
    await stripe.invoices.voidInvoice(inv.id);
    await stripe.customers.del(newCust.id);
    console.log('Cleaned up');
    
  } catch(e) {
    console.log('\nERROR:', e.type, e.message?.substring(0, 300));
    if (e.statusCode) console.log('Status:', e.statusCode);
    if (e.code) console.log('Code:', e.code);
    if (e.param) console.log('Param:', e.param);
  }
}

test().catch(e => console.log('Fatal:', e.message));
