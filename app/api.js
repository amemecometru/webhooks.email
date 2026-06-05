const API_BASE = 'https://api.webhooks.email';

const api = {
  _key: null,

  init() {
    this._key = localStorage.getItem('wh_api_key');
  },

  setKey(key) {
    this._key = key;
    localStorage.setItem('wh_api_key', key);
  },

  clearKey() {
    this._key = null;
    localStorage.removeItem('wh_api_key');
  },

  hasKey() {
    return !!this._key;
  },

  async _fetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._key) headers['Authorization'] = `Bearer ${this._key}`;
    const r = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (!r.ok) {
      if (r.status === 401) { api.clearKey(); app.router('login'); }
      const e = await r.text();
      throw new Error(e || `HTTP ${r.status}`);
    }
    const ct = r.headers.get('content-type') || '';
    return ct.includes('json') ? r.json() : r.text();
  },

  // Endpoints
  createEndpoint(name) {
    return this._fetch('/api/endpoints', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  },

  listEndpoints() {
    return this._fetch('/api/endpoints');
  },

  getEndpoint(id) {
    return this._fetch(`/api/endpoints/${id}`);
  },

  deleteEndpoint(id) {
    return this._fetch(`/api/endpoints/${id}`, { method: 'DELETE' });
  },

  // Logs
  getLogs(id, { limit, offset, search } = {}) {
    const p = new URLSearchParams();
    if (limit) p.set('limit', limit);
    if (offset) p.set('offset', offset);
    if (search) p.set('search', search);
    return this._fetch(`/api/endpoints/${id}/logs?${p}`);
  },

  // Destinations
  addDestination(id, url) {
    return this._fetch(`/api/endpoints/${id}/destinations`, {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  },

  removeDestination(id, destId) {
    return this._fetch(`/api/endpoints/${id}/destinations/${destId}`, { method: 'DELETE' });
  },

  // Usage / Billing
  getUsage() {
    return this._fetch('/api/usage');
  },

  getPlan() {
    return this._fetch('/api/plan');
  }
};
