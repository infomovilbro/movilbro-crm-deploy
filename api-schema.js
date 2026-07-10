// API Schema Explorer - Mapea todos los campos de la API Likes
// USO: node api-schema.js [clientes_a_probar]
const axios = require('axios');

const BRAND_ID = '264';
const API_URL = 'https://api.likestelecom.com';
const TEST_COUNT = parseInt(process.argv[2]) || 20;

async function getToken() {
  var email = process.env.LIKES_CLIENT_ID || 'eloyfuentesbermudez@gmail.com';
  var password = process.env.LIKES_CLIENT_SECRET || 'Teresa88.';
  var r = await axios.post(API_URL + '/token', { email, password, brand_id: BRAND_ID }, { timeout: 15000 });
  return r.data.token;
}

function mergeKeys(target, src, prefix) {
  if (!src || typeof src !== 'object') return;
  if (Array.isArray(src)) {
    if (src.length > 0) mergeKeys(target, src[0], prefix);
    return;
  }
  Object.keys(src).forEach(function(k) {
    var fullKey = prefix ? prefix + '.' + k : k;
    var v = src[k];
    if (!target[fullKey]) target[fullKey] = { count: 0, types: {}, sample: null };
    target[fullKey].count++;
    var type = Array.isArray(v) ? 'array' : typeof v;
    if (!target[fullKey].types[type]) target[fullKey].types[type] = 0;
    target[fullKey].types[type]++;
    if (target[fullKey].sample === null && v !== null && v !== undefined && typeof v !== 'object') {
      target[fullKey].sample = String(v).substring(0, 50);
    }
    if (typeof v === 'object' && v !== null) mergeKeys(target, v, fullKey);
  });
}

async function main() {
  var token = await getToken();
  console.log('Fetching customers...');
  var custRes = await axios.get(API_URL + '/customers?brand_id=' + BRAND_ID, { headers: { 'Authorization': 'Bearer ' + token }, timeout: 30000 });
  var customers = Array.isArray(custRes.data) ? custRes.data : (custRes.data.customers || custRes.data.data || []);
  var fiscalIds = customers.filter(function(c) { return c.fiscalId; }).map(function(c) { return c.fiscalId; }).slice(0, TEST_COUNT);
  
  var schema = {};
  
  for (var i = 0; i < fiscalIds.length; i++) {
    var fid = fiscalIds[i];
    console.log('[' + (i+1) + '/' + fiscalIds.length + '] ' + fid);
    try {
      var r = await axios.get(API_URL + '/customer/overview?fiscalId=' + encodeURIComponent(fid) + '&includeCustomer=true&includeSubscriptions=true&includeOrders=true&includeInvoices=true&includePortabilities=true&includePayments=true', { headers: { 'Authorization': 'Bearer ' + token }, timeout: 20000 });
      mergeKeys(schema, r.data, 'overview');
      
      // Tambien obtener subscriptions directas
      var sr = await axios.get(API_URL + '/subscriptions?fiscalId=' + encodeURIComponent(fid) + '&brand_id=' + BRAND_ID, { headers: { 'Authorization': 'Bearer ' + token }, timeout: 15000 });
      var subs = Array.isArray(sr.data) ? sr.data : (sr.data.data || sr.data.subscriptions || []);
      subs.forEach(function(s) { mergeKeys(schema, s, 'subscription'); });
      
      // Lines
      var lr = await axios.get(API_URL + '/line?fiscalId=' + encodeURIComponent(fid) + '&brand_id=' + BRAND_ID, { headers: { 'Authorization': 'Bearer ' + token }, timeout: 15000 });
      var lines = Array.isArray(lr.data) ? lr.data : (lr.data.data || lr.data.lines || []);
      lines.forEach(function(l) { mergeKeys(schema, l, 'line'); });
      
    } catch(e) { console.log('  ERROR:', e.message.substring(0, 60)); }
  }
  
  // Mostrar campos ordenados por frecuencia
  var sorted = Object.keys(schema).sort(function(a, b) { return schema[b].count - schema[a].count; });
  console.log('\n=== API SCHEMA (' + fiscalIds.length + ' clients) ===');
  console.log('Total unique fields:', sorted.length);
  console.log('\nFields by frequency:');
  sorted.slice(0, 80).forEach(function(k) {
    var info = schema[k];
    var types = Object.keys(info.types).join(',');
    console.log('  ' + info.count + '/' + fiscalIds.length + ' ' + k + ' (' + types + ')' + (info.sample ? ' eg:' + info.sample : ''));
  });
  
  // Campos críticos para nuestras features
  var criticalFields = ['lineNumber', 'fixedNumber', 'productName', 'phone', 'msisdn', 'linea', 
    'pin', 'puk', 'pinCode', 'pukCode', 'icc', 'iccid', 'sim',
    'downloadURL', 'signedContractUrl', 'contractUrl', 'uploadURL',
    'statusHistory', 'history', 'timeline',
    'totalGB', 'usedGB', 'remainingGB', 'consumption', 'total_gb', 'used_gb',
    'ot', 'workOrder', 'parteUrl', 'parte_url',
    'family', 'familia', 'category',
    'customer', 'customerData', 'customerInfo',
    'documentation', 'documents', 'attachment',
    'fecha', 'date', 'created', 'createdAt',
    'dni', 'fiscalId', 'fiscal_id',
    'data', 'attributes', 'order'];
  
  console.log('\n=== CRITICAL FIELDS ===');
  criticalFields.forEach(function(f) {
    var found = Object.keys(schema).filter(function(k) { return k.toLowerCase().includes(f.toLowerCase()); });
    if (found.length > 0) {
      console.log('  ' + f + ' -> ' + found.map(function(k) { return k + '(' + schema[k].count + ')'; }).join(', '));
    } else {
      console.log('  ' + f + ' -> NOT FOUND');
    }
  });
}

main().catch(console.error);
