const app = {
  _el: null,
  _views: {},

  init() {
    api.init();
    this._el = document.getElementById('app');
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  route() {
    const hash = location.hash.slice(1) || 'login';
    if (!api.hasKey() && hash !== 'login') return this.router('login');
    this.router(hash);
  },

  router(view, data) {
    const views = {
      login: this.viewLogin,
      dashboard: this.viewDashboard,
      endpoint: this.viewEndpoint,
      usage: this.viewUsage,
      settings: this.viewSettings
    };
    if (views[view]) views[view].call(this, data);
    else this.viewDashboard();
  },

  render(html) { this._el.innerHTML = html; },

  /* ---- LOGIN ---- */
  viewLogin() {
    this.render(`
      <div class="auth-page">
        <div class="auth-card">
          <div class="auth-logo">WEBHOOKS<span>.EMAIL</span></div>
          <h1 class="auth-title">Dashboard</h1>
          <p class="auth-desc">Enter your API key to access your endpoints.</p>
          <form id="login-form" class="auth-form">
            <div class="field">
              <label for="api-key">API KEY</label>
              <input type="password" id="api-key" placeholder="whk_..." autocomplete="off" spellcheck="false"/>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;justify-content:center">SIGN IN</button>
          </form>
          <p class="auth-footer">Don't have an API key? <a href="/">Sign up at webhooks.email</a></p>
        </div>
      </div>
    `);
    document.getElementById('login-form').addEventListener('submit', e => {
      e.preventDefault();
      const key = document.getElementById('api-key').value.trim();
      if (!key) return;
      api.setKey(key);
      location.hash = '#dashboard';
    });
  },

  /* ---- DASHBOARD ---- */
  async viewDashboard() {
    this.renderLayout('DASHBOARD', `<div class="load-cnt"><div class="loader"></div></div>`);
    try {
      const endpoints = await api.listEndpoints() || [];
      const usage = await api.getUsage().catch(() => null);
      this.renderLayout('DASHBOARD', this._dashboardHtml(endpoints, usage));
      this._bindDashboard(endpoints);
    } catch (e) {
      this.renderLayout('DASHBOARD', `<div class="error-box">Failed to load endpoints: ${e.message}</div>`);
    }
  },

  _dashboardHtml(endpoints, usage) {
    const total = endpoints.length;
    const recent = (usage && usage.total) || (endpoints.reduce((s, e) => s + (e.webhook_count || 0), 0)) || 0;
    return `
      <div class="stats-row">
        <div class="stat-card"><div class="stat-label">ENDPOINTS</div><div class="stat-val">${total}</div></div>
        <div class="stat-card"><div class="stat-label">WEBHOOKS TODAY</div><div class="stat-val">${recent.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">PLAN</div><div class="stat-val">${(usage && usage.plan) || 'FREE'}</div></div>
      </div>
      <div class="section-actions">
        <h3>ENDPOINTS</h3>
        <button class="btn-primary" id="btn-new-endpoint">+ NEW ENDPOINT</button>
      </div>
      <div class="table-cnt">
        <table class="dash-table">
          <thead><tr><th>NAME</th><th>URL</th><th>WEBHOOKS</th><th>DESTINATIONS</th><th>CREATED</th><th></th></tr></thead>
          <tbody id="ep-tbody">
            ${endpoints.length === 0 ? '<tr><td colspan="6" class="empty-row">No endpoints yet. Create your first one.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
      <!-- New Endpoint Modal -->
      <div class="modal-overlay" id="modal-new" style="display:none">
        <div class="modal">
          <div class="modal-h"><span>NEW ENDPOINT</span><button class="modal-close" id="modal-close">&times;</button></div>
          <form id="form-new-ep">
            <div class="field">
              <label>ENDPOINT NAME</label>
              <input type="text" id="ep-name" placeholder="My API, Production, Staging..." required/>
            </div>
            <button type="submit" class="btn-primary" style="width:100%;justify-content:center">CREATE</button>
          </form>
        </div>
      </div>
    `;
  },

  _bindDashboard(endpoints) {
    const tbody = document.getElementById('ep-tbody');
    if (tbody && endpoints.length) {
      tbody.innerHTML = endpoints.map(ep => `
        <tr>
          <td><a href="#endpoint/${ep.id}" class="ep-link">${this._esc(ep.name || ep.id)}</a></td>
          <td><code class="ep-url">${this._esc(ep.url || '—')}</code><button class="copy-btn" data-url="${this._esc(ep.url || '')}">📋</button></td>
          <td>${(ep.webhook_count || 0).toLocaleString()}</td>
          <td>${(ep.destinations || []).length}</td>
          <td class="dim">${ep.created ? new Date(ep.created).toLocaleDateString() : '—'}</td>
          <td><button class="del-btn" data-id="${ep.id}">✕</button></td>
        </tr>
      `).join('');
    }
    document.getElementById('btn-new-endpoint')?.addEventListener('click', () => { document.getElementById('modal-new').style.display = 'flex' });
    document.getElementById('modal-close')?.addEventListener('click', () => { document.getElementById('modal-new').style.display = 'none' });
    document.getElementById('form-new-ep')?.addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('ep-name').value.trim();
      if (!name) return;
      try {
        await api.createEndpoint(name);
        document.getElementById('modal-new').style.display = 'none';
        location.hash = '#dashboard';
      } catch (err) { alert(err.message); }
    });
    tbody?.querySelectorAll('.copy-btn').forEach(b => {
      b.addEventListener('click', () => {
        navigator.clipboard.writeText(b.dataset.url);
        b.textContent = '✓';
        setTimeout(() => b.textContent = '📋', 1500);
      });
    });
    tbody?.querySelectorAll('.del-btn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete this endpoint? All webhooks and logs will be lost.')) return;
        try { await api.deleteEndpoint(b.dataset.id); location.hash = '#dashboard'; }
        catch (err) { alert(err.message); }
      });
    });
  },

  /* ---- ENDPOINT DETAIL ---- */
  async viewEndpoint(id) {
    this.renderLayout('ENDPOINT', `<div class="load-cnt"><div class="loader"></div></div>`);
    try {
      const ep = await api.getEndpoint(id);
      const logs = await api.getLogs(id, { limit: 50 });
      this.renderLayout('ENDPOINT', this._endpointHtml(ep, logs));
      this._bindEndpoint(ep, logs);
    } catch (e) {
      this.renderLayout('ENDPOINT', `<div class="error-box">Failed to load endpoint: ${e.message}</div>`);
    }
  },

  _endpointHtml(ep, logs) {
    const logList = (logs || []).map(l => `
      <div class="log-row" data-id="${l.id}">
        <span class="log-method ${(l.method || 'POST').toLowerCase()}">${l.method || 'POST'}</span>
        <span class="log-path">${l.path || '/'}</span>
        <span class="log-status ${(l.status || 200) >= 400 ? 'fail' : 'ok'}">${l.status || 200}</span>
        <span class="log-time dim">${new Date(l.created_at || Date.now()).toLocaleString()}</span>
        <span class="log-expand">▶</span>
      </div>
      <div class="log-detail" id="log-detail-${l.id}" style="display:none">
        <pre class="log-payload">${this._esc(typeof l.body === 'string' ? l.body : JSON.stringify(l.body, null, 2))}</pre>
        ${l.headers ? `<pre class="log-headers">${this._esc(JSON.stringify(l.headers, null, 2))}</pre>` : ''}
      </div>
    `).join('') || '<div class="empty-row">No webhooks received yet. Send a request to start capturing.</div>';

    return `
      <div class="ep-header">
        <h2>${this._esc(ep.name || ep.id)}</h2>
        <a href="#dashboard" class="btn-secondary" style="padding:8px 20px">← BACK</a>
      </div>
      <div class="ep-meta">
        <div class="meta-box">
          <h4>ENDPOINT URL</h4>
          <code class="ep-url-large" id="ep-url-copy">${this._esc(ep.url || '—')}</code>
          <button class="copy-btn" id="btn-copy-url">📋 COPY</button>
        </div>
        <div class="meta-box">
          <h4>ID</h4>
          <code>${ep.id}</code>
        </div>
        <div class="meta-box">
          <h4>DESTINATIONS</h4>
          <div id="destinations-list">${(ep.destinations || []).map(d => `<div class="dest-item"><code>${this._esc(d.url)}</code><button class="del-btn-sm" data-ep="${ep.id}" data-dest="${d.id}">✕</button></div>`).join('') || '<span class="dim">None configured</span>'}</div>
          <form id="form-add-dest" style="margin-top:8px;display:flex;gap:8px">
            <input type="url" id="dest-url" placeholder="https://your-server.com/webhook" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:6px 10px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem"/>
            <button type="submit" style="background:var(--gold);color:var(--bg);border:none;padding:6px 12px;cursor:pointer;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em">ADD</button>
          </form>
        </div>
      </div>
      <div class="section-actions" style="margin-top:40px">
        <h3>WEBHOOK LOGS</h3>
        <div style="display:flex;gap:8px">
          <input type="text" id="log-search" placeholder="Search payload..." style="background:var(--bg);border:1px solid var(--border);padding:6px 12px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem;width:200px"/>
          <button class="btn-secondary" id="btn-refresh" style="padding:6px 16px">⟳</button>
        </div>
      </div>
      <div class="log-list">${logList}</div>
    `;
  },

  _bindEndpoint(ep, logs) {
    document.getElementById('btn-copy-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(ep.url || '');
      const b = document.getElementById('btn-copy-url');
      b.textContent = '✓ COPIED';
      setTimeout(() => b.textContent = '📋 COPY', 1500);
    });
    document.querySelectorAll('.log-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        const detail = document.getElementById(`log-detail-${id}`);
        const expand = row.querySelector('.log-expand');
        if (detail) {
          const open = detail.style.display !== 'none';
          detail.style.display = open ? 'none' : 'block';
          if (expand) expand.textContent = open ? '▶' : '▼';
        }
      });
    });
    document.getElementById('form-add-dest')?.addEventListener('submit', async e => {
      e.preventDefault();
      const url = document.getElementById('dest-url').value.trim();
      if (!url) return;
      try {
        await api.addDestination(ep.id, url);
        location.hash = `#endpoint/${ep.id}`;
      } catch (err) { alert(err.message); }
    });
    document.querySelectorAll('.del-btn-sm').forEach(b => {
      b.addEventListener('click', async () => {
        try { await api.removeDestination(b.dataset.ep, b.dataset.dest); location.hash = `#endpoint/${ep.id}`; }
        catch (err) { alert(err.message); }
      });
    });
    document.getElementById('btn-refresh')?.addEventListener('click', () => { location.hash = `#endpoint/${ep.id}` });
    document.getElementById('log-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) location.hash = `#endpoint/${ep.id}?search=${encodeURIComponent(q)}`;
      }
    });
  },

  /* ---- USAGE ---- */
  async viewUsage() {
    this.renderLayout('USAGE', `<div class="load-cnt"><div class="loader"></div></div>`);
    try {
      const usage = await api.getUsage().catch(() => ({ total: 0, plan: 'FREE' }));
      this.renderLayout('USAGE', `
        <h2>USAGE & BILLING</h2>
        <div class="stats-row">
          <div class="stat-card"><div class="stat-label">PLAN</div><div class="stat-val">${usage.plan || 'FREE'}</div></div>
          <div class="stat-card"><div class="stat-label">WEBHOOKS THIS MONTH</div><div class="stat-val">${(usage.total || 0).toLocaleString()}</div></div>
          <div class="stat-card"><div class="stat-label">LIMIT</div><div class="stat-val">${usage.limit ? usage.limit.toLocaleString() : '—'}</div></div>
        </div>
        ${usage.plan === 'FREE' ? '<p style="color:var(--text3);font-size:0.8rem;margin-top:20px"><a href="/pricing.html" style="color:var(--gold)">Upgrade to Pro</a> for 100,000 webhooks/month and advanced features.</p>' : ''}
      `);
    } catch (e) {
      this.renderLayout('USAGE', `<div class="error-box">${e.message}</div>`);
    }
  },

  /* ---- SETTINGS ---- */
  viewSettings() {
    const key = api._key;
    this.renderLayout('SETTINGS', `
      <h2>SETTINGS</h2>
      <div class="meta-box" style="max-width:600px">
        <h4>API KEY</h4>
        <code style="word-break:break-all;font-size:0.7rem">${key ? key.slice(0, 12) + '••••' + key.slice(-4) : '—'}</code>
        <p style="font-size:0.75rem;color:var(--text3);margin-top:8px">Your API key is stored locally. Keep it secret.</p>
      </div>
      <button class="btn-secondary" id="btn-signout" style="margin-top:20px">SIGN OUT</button>
    `);
    document.getElementById('btn-signout')?.addEventListener('click', () => {
      api.clearKey();
      location.hash = '#login';
    });
  },

  /* ---- LAYOUT ---- */
  renderLayout(title, content) {
    const isAuthed = api.hasKey();
    this.render(`
      <nav>
        <div class="nav-inner">
          <a href="/" class="logo">WEBHOOKS<span>.EMAIL</span></a>
          ${isAuthed ? `<div class="nav-links">
            <a href="#dashboard">ENDPOINTS</a>
            <a href="#usage">USAGE</a>
            <a href="#settings">SETTINGS</a>
          </div>` : '<div class="nav-links"><a href="/">HOME</a></div>'}
        </div>
      </nav>
      <main class="dash-main">
        <div class="dash-container">
          ${content}
        </div>
      </main>
    `);
  },

  /* ---- UTILS ---- */
  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
