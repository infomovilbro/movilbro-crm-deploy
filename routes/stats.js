const { db } = require('../database');
const LikesAPI = require('../likes-api');

function getApi() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  return new LikesAPI({ apiUrl: c.likes_api_url, email: c.likes_client_id, password: c.likes_client_secret, brandId: c.likes_brand_id });
}

const cache = { customers: null, portabilities: null, products: null, tickets: null, subscriptions: null };
const cacheTime = { customers: 0, portabilities: 0, products: 0, tickets: 0, subscriptions: 0 };
const TTL = 60000;

async function getCached(key, fetcher) {
  if (Date.now() - cacheTime[key] > TTL || !cache[key]) {
    try {
      cache[key] = await fetcher();
      cacheTime[key] = Date.now();
    } catch {
      cache[key] = cache[key] || [];
    }
  }
  return cache[key];
}

async function getAllStats() {
  const api = getApi();

  const [customers, portabilities, products, tickets] = await Promise.all([
    getCached('customers', () => api.getCustomers()),
    getCached('portabilities', () => api.request('GET', '/portabilities?brand_id=' + api.brandId).then(r => Array.isArray(r) ? r : r.portabilities || r.data || [])),
    getCached('products', () => api.request('GET', '/products/brand?brand_id=' + api.brandId).then(r => Array.isArray(r) ? r : r.products || r.data || [])),
    getCached('tickets', () => api.getTickets())
  ]);

  const apiSubsRaw = await getCached('subscriptions', async () => {
    var allSubs = [];
    var fiscalIds = (customers || []).map(c => c.fiscalId).filter(Boolean);
    var batchSize = 20;
    for (var i = 0; i < fiscalIds.length; i += batchSize) {
      var batch = fiscalIds.slice(i, i + batchSize);
      var results = await Promise.allSettled(batch.map(fid => api.getSubscriptions(fid)));
      results.forEach(function(r) {
        if (r.status === 'fulfilled') {
          var items = Array.isArray(r.value) ? r.value : (r.value && r.value.subscriptions ? r.value.subscriptions : r.value && r.value.data ? r.value.data : []);
          allSubs = allSubs.concat(items);
        }
      });
    }
    return allSubs;
  });

  const localSubscriptions = db.prepare(`
    SELECT s.*, c.id as client_id, c.nombre as client_nombre
    FROM subscriptions s
    LEFT JOIN clients c ON c.id = s.client_id
  `).all();

  const apiMapped = (apiSubsRaw || []).map(sub => {
    const prod = (sub.products && sub.products[0]) || {};
    return {
      id: sub.subscriptionId || sub.id,
      linea: prod.lineNumber || sub.lineNumber || '',
      estado: (prod.status || sub.status || 'ACTIVE').toString().toUpperCase(),
      familia: prod.family || sub.family || '',
      producto: prod.productName || sub.productName || sub.product || '',
      from_api: true
    };
  });

  const mergedMap = new Map();
  localSubscriptions.forEach(s => {
    const key = s.linea || `local_${s.id}`;
    if (!mergedMap.has(key)) mergedMap.set(key, s);
  });
  apiMapped.forEach(s => {
    const key = s.linea || `api_${s.id}`;
    mergedMap.set(key, s);
  });

  const subscriptions = Array.from(mergedMap.values());
  const lines = subscriptions.map(s => ({
    status: (s.estado || '').toUpperCase(),
    product: s.producto || '',
    family: s.familia || ''
  }));

  const totalCustomers = customers.length;
  const totalProducts = products.length;
  const totalPortabilities = portabilities.length;

  const productFamilies = {};
  const productTypes = { Main: 0, Optional: 0, Promotion: 0 };
  const familyRanges = {};

  products.forEach(p => {
    const fam = p.family || 'Otros';
    productFamilies[fam] = (productFamilies[fam] || 0) + 1;
    if (productTypes[p.type] !== undefined) productTypes[p.type]++;
    if (!familyRanges[fam]) familyRanges[fam] = { min: Infinity, max: -Infinity, sum: 0, n: 0 };
    if (p.price > 0) {
      if (p.price < familyRanges[fam].min) familyRanges[fam].min = p.price;
      if (p.price > familyRanges[fam].max) familyRanges[fam].max = p.price;
      familyRanges[fam].sum += p.price;
      familyRanges[fam].n++;
    }
  });

  const familyOrder = ['Mobile', 'Fiber', 'Fixed', 'TV', 'Satellite', 'Device', 'Custom', 'Other', 'International'];
  const families = Object.entries(productFamilies).map(([name, count]) => {
    const r = familyRanges[name] || { min: 0, max: 0, sum: 0, n: 0 };
    return { name, count, minPrice: r.min === Infinity ? 0 : r.min, maxPrice: r.max, avgPrice: r.n ? r.sum / r.n : 0 };
  }).sort((a, b) => {
    const ia = familyOrder.indexOf(a.name), ib = familyOrder.indexOf(b.name);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1; if (ib !== -1) return 1;
    return b.count - a.count;
  });

  const portStatuses = {}, portByMonth = {}, portDonors = {};
  portabilities.forEach(p => {
    portStatuses[p.status || 'UNKNOWN'] = (portStatuses[p.status || 'UNKNOWN'] || 0) + 1;
    if (p.donorOperator) portDonors[p.donorOperator] = (portDonors[p.donorOperator] || 0) + 1;
    const d = new Date(p.portabilityDate || p.created);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    portByMonth[key] = (portByMonth[key] || 0) + 1;
  });

  const custStatuses = {};
  customers.forEach(c => { const s = c.status || 'CREATED'; custStatuses[s] = (custStatuses[s] || 0) + 1; });

  // Country/region distribution
  const regions = {};
  customers.forEach(c => {
    const prov = c.billingAddress?.provinceName || c.billingAddress?.cityName || 'Desconocida';
    regions[prov] = (regions[prov] || 0) + 1;
  });
  const topRegions = Object.entries(regions).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  // Customer type distribution
  const custTypes = {};
  customers.forEach(c => { const t = c.customerType || 'Residential'; custTypes[t] = (custTypes[t] || 0) + 1; });

  // Document types
  const docTypes = {};
  customers.forEach(c => {
    const t = c.fiscalIdType || c.type || 'Otro';
    docTypes[t] = (docTypes[t] || 0) + 1;
  });

  // Monthly customer creation
  const custByMonth = {};
  customers.forEach(c => {
    if (c.created) {
      const d = new Date(c.created);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      custByMonth[key] = (custByMonth[key] || 0) + 1;
    }
  });
  const customerTimeline = Object.entries(custByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, c]) => ({ month: m, count: c }));

  const topDonors = Object.entries(portDonors).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => ({ name: n, count: c }));
  const portTimeline = Object.entries(portByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, c]) => ({ month: m, count: c }));

  const productsMain = products.filter(p => p.type === 'Main');
  const cheapestMain = productsMain.filter(p => p.price > 0).sort((a, b) => a.price - b.price).slice(0, 5);
  const priciestMain = productsMain.filter(p => p.price > 0).sort((a, b) => b.price - a.price).slice(0, 5);

  const ticketStatuses = {};
  tickets.forEach(t => { const s = t.status || 'OPEN'; ticketStatuses[s] = (ticketStatuses[s] || 0) + 1; });
  const totalTickets = tickets.length;

  const subStatuses = {};
  subscriptions.forEach(s => {
    const st = (s.status || s.estado || 'ACTIVE').toString().toUpperCase();
    subStatuses[st] = (subStatuses[st] || 0) + 1;
  });
  const totalSubscriptions = subscriptions.length;

  const lineStatuses = {};
  lines.forEach(l => { const s = l.status || 'ACTIVE'; lineStatuses[s] = (lineStatuses[s] || 0) + 1; });
  const totalLines = lines.length;

  const activeStatuses = new Set(['ACTIVA', 'ACTIVO', 'ACTIVE']);
  const clientesConLineasActivas = new Set(
    localSubscriptions
      .filter(s => activeStatuses.has(String(s.estado || '').toUpperCase()))
      .map(s => s.client_id)
      .filter(Boolean)
  ).size;

  const recurrenteTotal = products
    .filter(p => p && p.isRecurringPrice === true && Number(p.price || 0) > 0)
    .reduce((acc, p) => acc + Number(p.price || 0), 0);

  const mixTarifasMap = {};
  localSubscriptions.forEach(s => {
    const k = (s.producto || 'Sin producto').trim();
    mixTarifasMap[k] = (mixTarifasMap[k] || 0) + 1;
  });
  const mixTarifas = Object.entries(mixTarifasMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const lineFamilyCounters = { linesFiber: 0, linesMobile: 0, linesTV: 0, linesSatellite: 0 };
  lines.forEach(l => {
    const t = String(l.family || l.type || l.productFamily || l.serviceType || '').toLowerCase();
    if (t.includes('fiber') || t.includes('fibra')) lineFamilyCounters.linesFiber++;
    else if (t.includes('mobile') || t.includes('movil') || t.includes('móvil') || t.includes('line')) lineFamilyCounters.linesMobile++;
    else if (t.includes('tv') || t.includes('tele')) lineFamilyCounters.linesTV++;
    else if (t.includes('sat')) lineFamilyCounters.linesSatellite++;
  });

  const portabilidadesPendientes = portabilities.filter(p => {
    const st = String(p.status || '').toUpperCase();
    return st && !['COMPLETED', 'CANCELED', 'CANCELLED', 'DONE', 'FINISHED'].includes(st);
  }).length;

  // CRM database stats (from isp_facturas)
  var invTotal = 0, invPagadas = 0, invPendientes = 0, invTotalImporte = 0;
  var invByMonth = {}, invByStatus = {};
  try {
    var invRows = db.prepare('SELECT periodo, importe_total, estado, pagada, fecha_emision FROM isp_facturas').all();
    invTotal = invRows.length;
    invRows.forEach(function(r) {
      if (r.pagada || r.estado === 'pagada') invPagadas++;
      else invPendientes++;
      invTotalImporte += parseFloat(r.importe_total || 0);
      var m = (r.periodo || (r.fecha_emision ? r.fecha_emision.substring(0,7) : 'desconocido'));
      invByMonth[m] = (invByMonth[m] || 0) + parseFloat(r.importe_total || 0);
      var st = r.pagada ? 'Pagada' : (r.estado === 'pagada' ? 'Pagada' : 'Pendiente');
      invByStatus[st] = (invByStatus[st] || 0) + 1;
    });
  } catch(e) {}
  var revenueTimeline = Object.entries(invByMonth).sort(function(a,b){return a[0].localeCompare(b[0])}).map(function(e){return{month:e[0],total:e[1]}});

  // Simple billing stats (from invoices table)
  var invSimpleTotal = 0, invSimplePagadas = 0, invSimplePendientes = 0, invSimpleVencidas = 0, invSimpleTotalImporte = 0;
  var invSimpleByStatus = {}, invSimpleAmountByStatus = {}, invSimpleMonthly = {};
  try {
    var invSimpleRows = db.prepare('SELECT estado, importe, fecha_emision FROM invoices').all();
    invSimpleTotal = invSimpleRows.length;
    invSimpleRows.forEach(function(r) {
      if (r.estado === 'pagada') invSimplePagadas++;
      else if (r.estado === 'vencida') invSimpleVencidas++;
      else invSimplePendientes++;
      invSimpleTotalImporte += parseFloat(r.importe || 0);
      var st = r.estado === 'pagada' ? 'Pagada' : (r.estado === 'vencida' ? 'Vencida' : 'Pendiente');
      invSimpleByStatus[st] = (invSimpleByStatus[st] || 0) + 1;
      invSimpleAmountByStatus[st] = (invSimpleAmountByStatus[st] || 0) + parseFloat(r.importe || 0);
      if (r.fecha_emision) {
        var d = new Date(r.fecha_emision);
        if (!isNaN(d.getTime())) {
          var mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          invSimpleMonthly[mk] = (invSimpleMonthly[mk] || 0) + parseFloat(r.importe || 0);
        }
      }
    });
  } catch(e) {}
  var invSimpleRevenueTimeline = Object.entries(invSimpleMonthly).sort(function(a,b){return a[0].localeCompare(b[0])}).map(function(e){return{month:e[0],total:e[1]}});

  // Local client stats
  var localClientes = 0, clientesConContrato = 0;
  try {
    localClientes = db.prepare('SELECT COUNT(*) as c FROM clients').get().c;
    clientesConContrato = db.prepare('SELECT COUNT(DISTINCT fiscal_id) as c FROM isp_facturas').get().c;
  } catch(e) {}

  // Subscription breakdown by product family from API
  var subByProduct = {};
  apiMapped.forEach(function(s) {
    var p = s.producto || 'Sin producto';
    subByProduct[p] = (subByProduct[p] || 0) + 1;
  });
  var topSubProducts = Object.entries(subByProduct).sort(function(a,b){return b[1]-a[1]}).slice(0,15).map(function(e){return{name:e[0],count:e[1]}});

  return {
    totalCustomers, totalProducts, totalPortabilities, totalTickets, totalSubscriptions, totalLines,
    familyCount: families.length,
    families, productTypes, portStatuses, portTimeline, portDonors: topDonors, custStatuses,
    topRegions, custTypes, docTypes, customerTimeline,
    cheapestMain, priciestMain,
    ticketStatuses, subStatuses, lineStatuses,
    portabilityIn: portabilities.filter(p => p.type === 'IN').length,
    portabilityOut: portabilities.filter(p => p.type === 'OUT').length,
    portabilidadesPendientes,
    ...lineFamilyCounters,
    clientesConLineasActivas,
    recurrenteTotal,
    mixTarifas,
    // New CRM stats
    invTotal, invPagadas, invPendientes, invTotalImporte,
    invByStatus, revenueTimeline, topSubProducts,
    localClientes, clientesConContrato,
    // Simple billing stats (from invoices table)
    invSimpleTotal, invSimplePagadas, invSimplePendientes, invSimpleVencidas, invSimpleTotalImporte,
    invSimpleByStatus, invSimpleAmountByStatus, invSimpleRevenueTimeline,
  };
}

module.exports = { getAllStats, getStats: getAllStats };
