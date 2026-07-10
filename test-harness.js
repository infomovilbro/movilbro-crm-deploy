// Test Harness Universal - Verifica fixes contra TODOS los clientes de la API
// USO: node test-harness.js [tipo]
//   tipos: orders, consumption, pinpuk, scoring, contratos, all

const axios = require('axios');

// Config
const BRAND_ID = '264';
const API_URL = 'https://api.likestelecom.com';
const TEST_LIMIT = 20; // Clientes a probar (0 = todos)

async function getToken() {
  var email = process.env.LIKES_CLIENT_ID || 'eloyfuentesbermudez@gmail.com';
  var password = process.env.LIKES_CLIENT_SECRET || 'Teresa88.';
  try {
    var r = await axios.post(API_URL + '/token', { email, password, brand_id: BRAND_ID }, { timeout: 15000 });
    return r.data.token;
  } catch(e) {
    console.error('Token error:', e.message);
    return null;
  }
}

async function testOrders(token, clients) {
  console.log('\n=== TEST: ORDERS ===');
  var passed = 0, failed = 0, samples = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    try {
      var r = await axios.get(API_URL + '/customer/overview?fiscalId=' + encodeURIComponent(c.fiscalId) + '&includeOrders=true&includeCustomer=true', { headers: { 'Authorization': 'Bearer ' + token }, timeout: 15000 });
      var orders = r.data.orders || (r.data.data && r.data.data.orders) || [];
      if (!Array.isArray(orders) || orders.length === 0) { passed++; continue; }
      var hasProducts = orders.some(function(o) {
        var src = o.data || o.attributes || o.order || o;
        return !!(src.productName || src.product || (src.products && src.products.length) || (src.lines && src.lines.length));
      });
      if (hasProducts) passed++;
      else { failed++; if (samples.length < 3) samples.push(c.fiscalId + ' orders:' + orders.length); }
    } catch(e) { failed++; if (samples.length < 3) samples.push(c.fiscalId + ' ERROR:' + e.message.substring(0, 40)); }
  }
  console.log('  Passed:', passed, '/', clients.length, ' Failed:', failed);
  if (samples.length > 0) console.log('  Samples:', samples.join(', '));
  return { passed, failed, total: clients.length };
}

async function testConsumption(token, clients) {
  console.log('\n=== TEST: CONSUMPTION GB ===');
  var passed = 0, failed = 0, noLines = 0, samples = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    try {
      var r = await axios.get(API_URL + '/customer/overview?fiscalId=' + encodeURIComponent(c.fiscalId) + '&includeSubscriptions=true', { headers: { 'Authorization': 'Bearer ' + token }, timeout: 15000 });
      var subs = r.data.subscriptions || (r.data.data && r.data.data.subscriptions) || [];
      if (!Array.isArray(subs)) subs = [];
      var lineNums = [];
      subs.forEach(function(s) {
        var prods = s.products && s.products.length ? s.products : (s.productName ? [{ lineNumber: s.lineNumber || s.fixedNumber }] : []);
        prods.forEach(function(p) {
          var ln = p.lineNumber || p.fixedNumber || p.phone || '';
          if (ln && /^\d{6,}$/.test(ln) && lineNums.indexOf(ln) < 0) lineNums.push(ln);
        });
      });
      if (lineNums.length === 0) { noLines++; continue; }
      var allOk = true;
      for (var j = 0; j < lineNums.length && j < 3; j++) {
        try {
          var gb = await axios.get(API_URL + '/line/gb?lineNumber=' + encodeURIComponent(lineNums[j]), { headers: { 'Authorization': 'Bearer ' + token }, timeout: 10000 });
          if (!gb.data || (!gb.data.totalGB && !gb.data.usedGB && !gb.data.total)) allOk = false;
        } catch(e) { allOk = false; }
      }
      if (allOk) passed++;
      else { failed++; if (samples.length < 3) samples.push(c.fiscalId + ' lines:' + lineNums.join(',')); }
    } catch(e) { failed++; if (samples.length < 3) samples.push(c.fiscalId + ' ERROR:' + e.message.substring(0, 40)); }
  }
  console.log('  Passed:', passed, ' No lines:', noLines, ' Failed:', failed, ' Total:', clients.length);
  if (samples.length > 0) console.log('  Samples:', samples.join(', '));
  return { passed, failed, noLines, total: clients.length };
}

async function testScoring(token, clients) {
  console.log('\n=== TEST: SCORING DNI ===');
  var passed = 0, failed = 0, samples = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    var dni = c.fiscalId || '';
    var valido = /^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z]|[A-Z]\d{7}[A-Z]|\d{8})$/i.test(dni);
    if (valido || !dni) passed++;
    else { failed++; if (samples.length < 3) samples.push(c.fiscalId); }
  }
  console.log('  Passed:', passed, ' Failed:', failed);
  if (samples.length > 0) console.log('  Samples:', samples.join(', '));
  return { passed, failed, total: clients.length };
}

async function testContratos(token, clients) {
  console.log('\n=== TEST: CONTRATOS S3 ===');
  var totalOrders = 0, found = 0, notFound = 0, samples = [];
  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    try {
      var r = await axios.get(API_URL + '/customer/overview?fiscalId=' + encodeURIComponent(c.fiscalId) + '&includeOrders=true', { headers: { 'Authorization': 'Bearer ' + token }, timeout: 15000 });
      var orders = r.data.orders || (r.data.data && r.data.data.orders) || [];
      if (!Array.isArray(orders)) orders = [];
      var completed = orders.filter(function(o) {
        var st = (o.status || (o.data && o.data.status) || '').toUpperCase();
        return st === 'COMPLETED' || st === 'COMPLETADO';
      });
      totalOrders += completed.length;
      for (var j = 0; j < completed.length; j++) {
        var oid = completed[j].id || (completed[j].data && completed[j].data.id) || '';
        if (oid) {
          var s3url = 'https://prod-likes-customer-documents.s3.eu-central-1.amazonaws.com/264/' + oid + '/signedContract.pdf';
          try {
            var head = await axios.head(s3url, { timeout: 5000 });
            if (head.status === 200) found++;
            else notFound++;
          } catch(e) { notFound++; if (samples.length < 3) samples.push(oid.substring(0, 15)); }
        }
      }
    } catch(e) { failed++; if (samples.length < 3) samples.push(c.fiscalId + ' ERROR'); }
  }
  console.log('  Completed orders:', totalOrders, ' S3 found:', found, ' Not found:', notFound);
  if (samples.length > 0) console.log('  Samples:', samples.join(', '));
  return { found, notFound, total: totalOrders };
}

async function main() {
  var token = await getToken();
  if (!token) { console.error('No token'); return; }
  
  console.log('Fetching customers...');
  var custRes = await axios.get(API_URL + '/customers?brand_id=' + BRAND_ID, { headers: { 'Authorization': 'Bearer ' + token }, timeout: 30000 });
  var allCustomers = Array.isArray(custRes.data) ? custRes.data : (custRes.data.customers || custRes.data.data || []);
  var clients = allCustomers.filter(function(c) { return c.fiscalId; }).slice(0, TEST_LIMIT || allCustomers.length);
  console.log('Testing', clients.length, 'clients\n');
  
  var tipo = process.argv[2] || 'all';
  
  if (tipo === 'all' || tipo === 'orders') await testOrders(token, clients);
  if (tipo === 'all' || tipo === 'consumption') await testConsumption(token, clients);
  if (tipo === 'all' || tipo === 'scoring') await testScoring(token, clients);
  if (tipo === 'all' || tipo === 'contratos') await testContratos(token, clients);
  
  console.log('\n=== DONE ===');
}

main().catch(console.error);
