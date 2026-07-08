const axios = require('axios');
const { db } = require('./database');

function getApiInstance() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  // Priorizar env vars sobre settings table (las env vars son las que funcionaban antes)
  return new LikesAPI({
    apiUrl: process.env.LIKES_API_URL || c.likes_api_url || 'https://api.likestelecom.com',
    email: process.env.LIKES_CLIENT_ID || c.likes_client_id || '',
    password: process.env.LIKES_CLIENT_SECRET || c.likes_client_secret || '',
    brandId: process.env.LIKES_BRAND_ID || c.likes_brand_id || ''
  });
}

class LikesAPI {
  constructor(config) {
    this.apiUrl = config.apiUrl || process.env.LIKES_API_URL || 'https://api.likestelecom.com';
    this.email = config.email || process.env.LIKES_CLIENT_ID || 'eloyfuentesbermudez@gmail.com';
    this.password = config.password || process.env.LIKES_CLIENT_SECRET || 'Teresa88.';
    this.brandId = config.brandId || process.env.LIKES_BRAND_ID || '264';
    this._tokenCache = null;
    this._tokenExpiry = null;
    if (!this.email || !this.password) {
      console.error('[LikesAPI] CREDENCIALES FALTANTES: likes_client_id=' + (this.email ? 'OK' : 'VACIO') + ', likes_client_secret=' + (this.password ? 'OK' : 'VACIO') + '. Configúralas en Render como LIKES_CLIENT_ID y LIKES_CLIENT_SECRET');
    }
  }

  async getToken() {
    if (this._tokenCache && this._tokenExpiry && Date.now() < this._tokenExpiry) return this._tokenCache;
    
    // 1. Intentar directo desde servidor
    try {
      const body = JSON.stringify({ email: this.email, password: this.password, brand: this.brandId });
      const response = await new Promise((resolve, reject) => {
        const https = require('https');
        const u = new URL(this.apiUrl + '/token');
        const o = {
          hostname: u.hostname, path: u.pathname, method: 'POST',
          headers: {
            'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://wd.likestelecom.com', 'Referer': 'https://wd.likestelecom.com/'
          },
          timeout: 15000, rejectUnauthorized: false
        };
        const r = https.request(o, (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => {
            try { resolve({ data: JSON.parse(d), status: res.statusCode }); }
            catch(e) { reject(new Error('JSON: ' + d.substring(0, 60))); }
          });
        });
        r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
        r.write(body); r.end();
      });
      if (response.data && (response.data.token || response.data.access_token)) {
        var tok = response.data.token || response.data.access_token;
        this._tokenCache = tok;
        this._tokenExpiry = Date.now() + (response.data.expires_in || 3600) * 1000 - 60000;
        console.log('[LikesAPI] Token OK, expires in', response.data.expires_in || 3600);
        return tok;
      }
    } catch(e) {
      console.log('[LikesAPI] Auth directo falló:', e.message);
    }
    
    // 2. Fallback: token desde navegador (guardado en DB)
    try {
      var row = db.prepare("SELECT value FROM settings WHERE key='likes_token_cache'").get();
      if (row && row.value) {
        var cached = JSON.parse(row.value);
        if (cached.token && cached.expiry > Date.now()) {
          this._tokenCache = cached.token;
          this._tokenExpiry = cached.expiry;
          console.log('[LikesAPI] Usando token del navegador');
          return cached.token;
        }
      }
    } catch(e) {}
    
    throw new Error('No hay token disponible. Recarga el CRM en tu navegador');
  }

  static saveToken(token, expiresIn) {
    var expiry = Date.now() + (expiresIn || 3600) * 1000 - 60000;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('likes_token_cache', ?)").run(JSON.stringify({ token: token, expiry: expiry }));
    console.log('[LikesAPI] Token guardado desde navegador, valido hasta', new Date(expiry).toISOString());
  }



  async request(method, endpoint, data = null) {
    var token = await this.getToken();
    if (!token) {
      this._tokenCache = null;
      token = await this.getToken();
    }
    const config = {
      method,
      url: `${this.apiUrl}${endpoint}`,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000
    };
    if (data) config.data = data;
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Error en API ${method} ${endpoint}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async extractData(raw) {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      for (const key of ['data', 'customers', 'products', 'portabilities', 'tickets', 'lines', 'subscriptions', 'installations', 'orders', 'shipments', 'surveys', 'leads', 'payments', 'remittances', 'processes', 'channels', 'resources', 'results', 'items', 'records']) {
        if (Array.isArray(raw[key])) return raw[key];
      }
    }
    return [];
  }

  async fetchAll(endpoint) {
    let all = [], page = 1, hasMore = true;
    while (hasMore && page <= 100) {
      const sep = endpoint.includes('?') ? '&' : '?';
      const raw = await this.request('GET', `${endpoint}${sep}page=${page}&limit=500`);
      const items = await this.extractData(raw);
      all = all.concat(items);
      const total = raw.total || raw.totalCount || raw.total_items || (raw.meta && raw.meta.total) || 0;
      const perPage = raw.per_page || raw.perPage || raw.limit || (raw.meta && raw.meta.per_page) || 500;
      const lastPage = raw.last_page || raw.pages || raw.totalPages || (raw.meta && raw.meta.last_page) || Math.ceil(total / perPage);
      hasMore = page < lastPage && items.length > 0;
      page++;
    }
    return all;
  }

  async getCustomers() {
    return this.fetchAll(`/customers?brand_id=${this.brandId}`);
  }

  async getProducts() {
    return this.fetchAll(`/products/brand?brand_id=${this.brandId}`);
  }

  async getPortabilities() {
    return this.fetchAll(`/portabilities?brand_id=${this.brandId}`);
  }

  async getTickets(params = {}) {
    const query = Object.entries({ brand_id: this.brandId, ...params }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    // Try /tickets first (plural), fallback to /ticket (singular)
    try {
      const data = await this.request('GET', `/tickets${query ? '?' + query : ''}`);
      return this.extractData(data);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        const data = await this.request('GET', `/ticket${query ? '?' + query : ''}`);
        return this.extractData(data);
      }
      throw e;
    }
  }

  async getLines() {
    const data = await this.request('GET', `/line?brand_id=${this.brandId}`);
    return this.extractData(data);
  }

  async getSubscriptions(fiscalId) {
    const query = fiscalId ? `?fiscalId=${encodeURIComponent(fiscalId)}&brand_id=${this.brandId}` : `?brand_id=${this.brandId}`;
    const data = await this.request('GET', `/subscriptions${query}`);
    return this.extractData(data);
  }

  async getInstallations() {
    try {
      const data = await this.request('GET', `/installations?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getOrders() {
    try {
      const data = await this.request('GET', `/orders?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getShipments() {
    try {
      const data = await this.request('GET', `/shipments?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getSurveys() {
    try {
      const data = await this.request('GET', `/surveys?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getLeads() {
    try {
      const data = await this.request('GET', `/leads?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getProcesses() {
    try {
      const data = await this.request('GET', `/processes?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getPayments() {
    try {
      const data = await this.request('GET', `/payments?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getRemittances() {
    try {
      const data = await this.request('GET', `/remittances?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async getChannelConfig() {
    try {
      return await this.request('GET', '/channel/config');
    } catch { return {}; }
  }

  async getRouterPenalties() {
    try {
      const data = await this.request('GET', `/router-penalties?brand_id=${this.brandId}`);
      return this.extractData(data);
    } catch { return []; }
  }

  async createCustomer(customerData) {
    return this.request('POST', '/customer', customerData);
  }

  async createOrder(orderData) {
    return this.request('POST', '/signupv2', orderData);
  }

  async createDraftOrder(orderData) {
    return this.request('POST', '/draft-order-v2', orderData);
  }

  async addDraftOrderCustomer(orderId, customerData) {
    return this.request('POST', '/draft-order-v2/customer', { orderId, ...customerData });
  }

  async updateDraftOrderLines(orderId, linesData) {
    return this.request('PUT', '/draft-order-v2/lines', { orderId, ...linesData });
  }

  async setDraftOrderShipping(orderId, shippingData) {
    return this.request('PUT', '/draft-order-v2/shipping-address', { orderId, ...shippingData });
  }

  async checkoutDraftOrder(orderId) {
    return this.request('PUT', '/draft-order-v2/checkout', { orderId });
  }

  async getDraftOrder(orderId) {
    return this.request('GET', `/draft-order-v2?orderId=${orderId}&withDocumentation=true`);
  }

  async getOrderStatus(orderId) {
    return this.request('GET', `/draft-order-v2/${orderId}`);
  }

  async getClientSubscriptions(clientId) {
    return this.request('GET', `/subscriptions?customer_id=${clientId}`);
  }

  async getLineInfo(lineNumber) {
    return this.request('GET', `/line?lineNumber=${encodeURIComponent(lineNumber)}&withSims=true&withProducts=true&withMultiSims=true&withSimsInfo=true&withOwners=true&withCustomer=true`);
  }

  async getLineGB(lineNumber) {
    return this.request('GET', `/line/gb?lineNumber=${encodeURIComponent(lineNumber)}`);
  }

  async getLineCreditLimit(lineNumber) {
    return this.request('GET', `/line/credit-limit?lineNumber=${encodeURIComponent(lineNumber)}`);
  }

  async getLineScore(lineNumber) {
    return this.request('GET', `/line/score?lineNumber=${encodeURIComponent(lineNumber)}`);
  }

  async getCustomerDocuments(fiscalId) {
    return this.request('GET', `/customer?fiscalId=${encodeURIComponent(fiscalId)}&withDocumentation=true`);
  }

  async getInstallations() {
    return this.request('GET', `/installations?completedInstallationsAge=730&canceledInstallationsAge=15`);
  }

  async changeProduct(data) {
    return this.request('POST', '/changeProduct', data);
  }

  async addOptionalProduct(data) {
    return this.request('POST', '/addOptionalProduct', data);
  }

  async lineChangeSim(data) {
    return this.request('POST', '/line/changeSim', data);
  }

  async getLineCDRs(lineNumber) {
    return this.request('GET', `/line/cdrs?lineNumber=${encodeURIComponent(lineNumber)}`);
  }

  async blockLine(lineNumber, blocked = true) {
    return this.request('PUT', '/line', { lineNumber: lineNumber, blocked });
  }

  async createTicket(ticketData) {
    return this.request('POST', '/ticket', ticketData);
  }

  async getTicketTypologies() {
    return this.request('GET', '/ticket/typologys');
  }

  async getDonorOperators() {
    try {
      const data = await this.request('GET', '/admin2/donor-operators');
      return this.extractData(data);
    } catch { return []; }
  }

  async checkCoverage(address) {
    return this.request('GET', `/coverage/address?q=${encodeURIComponent(address)}`);
  }

  async getCoverageBuildings(addressId) {
    return this.request('GET', `/coverage/buildings?address_id=${addressId}`);
  }

  async getCustomerOverview(fiscalId, opts = {}) {
    var include = Object.assign({
      includeCustomer: true,
      includeSubscriptions: true,
      includeOrders: true,
      includePortabilities: true,
      includeInstallations: true,
      includeInvoices: true,
      includePayments: true
    }, opts);
    var qs = Object.entries(include).map(function(kv) { return kv[0] + '=' + kv[1]; }).join('&');
    return this.request('GET', '/customer/overview?fiscalId=' + encodeURIComponent(fiscalId) + '&' + qs);
  }

  async getInstallationWorkOrder(installationId) {
    try {
      return await this.request('GET', '/installation/' + installationId + '/work-order');
    } catch(e) { return null; }
  }

  async getLinePINPUK(lineNumber) {
    try {
      return await this.request('GET', '/line/pinpuk?lineNumber=' + encodeURIComponent(lineNumber));
    } catch(e) { return null; }
  }

  async getLineSVAs(lineNumber) {
    try {
      return await this.request('GET', '/line/svas?lineNumber=' + encodeURIComponent(lineNumber));
    } catch(e) { return []; }
  }

  async updateLineSVAs(lineNumber, svasData) {
    return this.request('PUT', '/line/svas', { lineNumber: lineNumber, ...svasData });
  }

  async getLineCreditLimit(lineNumber) {
    try {
      return await this.request('GET', '/line/credit-limit?lineNumber=' + encodeURIComponent(lineNumber));
    } catch(e) { return null; }
  }

  async setLineCreditLimit(lineNumber, limit) {
    return this.request('PUT', '/line/credit-limit', { lineNumber: lineNumber, limit });
  }

  async updateLineSPN(lineNumber, spn) {
    return this.request('PUT', '/line/spn', { lineNumber: lineNumber, spn });
  }

  static async fetchCDRsForFiscalId(api, fiscalId, periodo) {
    if (!fiscalId) return [];
    try {
      var subsRaw = await api.request('GET', '/subscriptions?fiscalId=' + encodeURIComponent(fiscalId) + '&brand_id=' + (api.brandId || '264'));
      var subsItems = Array.isArray(subsRaw) ? subsRaw : (subsRaw.data || subsRaw.subscriptions || []);
      var lines = [];
      subsItems.forEach(function(s) {
        var prods = s.products || (s.productName ? [s] : []);
        prods.forEach(function(p) { if (p.fixedNumber || p.lineNumber) lines.push(p.fixedNumber || p.lineNumber); });
      });
      var lineasUnicas = [];
      lines.forEach(function(l) { if (lineasUnicas.indexOf(l) === -1) lineasUnicas.push(l); });
      var apiCdrsResults = await Promise.allSettled(lineasUnicas.map(function(l) { return api.getLineCDRs(l); }));
      var result = [];
      apiCdrsResults.forEach(function(resp) {
        if (resp.status !== 'fulfilled' || !resp.value) return;
        var raw = resp.value;
        var items = Array.isArray(raw) ? raw : (raw.data || raw.cdrs || raw.records || raw.items || []);
        if (Array.isArray(items)) {
          items.forEach(function(item) {
            var cdrDate = item.fecha || item.date || '';
            var cdrPeriodo = cdrDate ? cdrDate.substring(0, 7) : periodo;
            if (cdrPeriodo !== periodo) return;
            result.push(item);
          });
        }
      });
      return result;
    } catch(e) { console.error('fetchCDRsForFiscalId error:', e.message); return []; }
  }
}

module.exports = LikesAPI;
module.exports.getApiInstance = getApiInstance;
module.exports.saveToken = LikesAPI.saveToken;
