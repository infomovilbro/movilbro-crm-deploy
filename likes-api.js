const axios = require('axios');
const { db } = require('./database');

let tokenCache = null;
let tokenExpiry = null;

function getApiInstance() {
  const s = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'likes_%'").all();
  const c = {};
  s.forEach(r => c[r.key] = r.value);
  return new LikesAPI({ apiUrl: c.likes_api_url, email: c.likes_client_id, password: c.likes_client_secret, brandId: c.likes_brand_id });
}

class LikesAPI {
  constructor(config) {
    this.apiUrl = config.apiUrl || 'https://api.likestelecom.com';
    this.email = config.email;
    this.password = config.password;
    this.brandId = config.brandId;
  }

  async getToken() {
    if (tokenCache && tokenExpiry && Date.now() < tokenExpiry) return tokenCache;
    try {
      const body = { email: this.email, password: this.password };
      if (this.brandId) body.brand = this.brandId;
      const response = await axios.post(`${this.apiUrl}/token`, body);
      tokenCache = response.data.token || response.data.access_token;
      tokenExpiry = Date.now() + (response.data.expires_in || 3600) * 1000 - 60000;
      return tokenCache;
    } catch (error) {
      console.error('Error obteniendo token:', error.message);
      throw new Error('No se pudo autenticar con Likes Telecom');
    }
  }

  async request(method, endpoint, data = null) {
    const token = await this.getToken();
    const config = {
      method,
      url: `${this.apiUrl}${endpoint}`,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
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
    const data = await this.request('GET', `/ticket${query ? '?' + query : ''}`);
    return this.extractData(data);
  }

  async getLines() {
    const data = await this.request('GET', `/line?brand_id=${this.brandId}`);
    return this.extractData(data);
  }

  async getSubscriptions() {
    const data = await this.request('GET', `/subscriptions?brand_id=${this.brandId}`);
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

  async getOrderStatus(orderId) {
    return this.request('GET', `/draft-order-v2/${orderId}`);
  }

  async getClientSubscriptions(clientId) {
    return this.request('GET', `/subscriptions?customer_id=${clientId}`);
  }

  async getLineInfo(lineNumber) {
    return this.request('GET', `/line?line=${lineNumber}`);
  }

  async getLineGB(lineNumber) {
    return this.request('GET', `/line/gb?line=${encodeURIComponent(lineNumber)}`);
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
    return this.request('GET', `/line/cdrs?line=${encodeURIComponent(lineNumber)}`);
  }

  async blockLine(lineNumber, blocked = true) {
    return this.request('PUT', '/line', { line: lineNumber, blocked });
  }

  async createTicket(ticketData) {
    return this.request('POST', '/ticket', ticketData);
  }

  async getTicketTypologies() {
    return this.request('GET', '/ticket/typologys');
  }

  async checkCoverage(address) {
    return this.request('GET', `/coverage/address?q=${encodeURIComponent(address)}`);
  }

  async getCoverageBuildings(addressId) {
    return this.request('GET', `/coverage/buildings?address_id=${addressId}`);
  }
}

module.exports = LikesAPI;
module.exports.getApiInstance = getApiInstance;
