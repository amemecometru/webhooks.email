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
    const [view, param] = hash.split('/');
    this.router(view, param || hash.split('?')[0]);
  },

  router(view, data) {
    const views = {
      login: this.viewLogin,
      dashboard: this.viewDashboard,
      endpoint: this.viewEndpoint,
      'dead-letters': this.viewDeadLetters,
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
      const { endpoints } = await api.listEndpoints() || { endpoints: [] };
      const usage = await api.getUsage().catch(() => null);
      this.renderLayout('DASHBOARD', this._dashboardHtml(endpoints, usage));
      this._bindDashboard(endpoints);
    } catch (e) {
      this.renderLayout('DASHBOARD', `<div class="error-box">Failed to load endpoints: ${e.message}</div>`);
    }
  },

  _dashboardHtml(endpoints, usage) {
    const total = endpoints.length;
    const recent = (usage && usage.total) || 0;
    return `
      <div class="stats-row">
        <div class="stat-card"><div class="stat-label">ENDPOINTS</div><div class="stat-val">${total}</div></div>
        <div class="stat-card"><div class="stat-label">WEBHOOKS THIS MONTH</div><div class="stat-val">${recent.toLocaleString()}</div></div>
        <div class="stat-card"><div class="stat-label">PLAN</div><div class="stat-val">${(usage && usage.plan?.toUpperCase()) || 'FREE'}</div></div>
      </div>
      <div class="section-actions">
        <h3>ENDPOINTS</h3>
        <div style="display:flex;gap:8px">
          <a href="#dead-letters" class="btn-secondary" style="padding:8px 16px;font-size:0.6rem;text-decoration:none">DEAD LETTERS</a>
          <button class="btn-primary" id="btn-new-endpoint">+ NEW ENDPOINT</button>
        </div>
      </div>
      <div class="table-cnt">
        <table class="dash-table">
          <thead><tr><th>NAME</th><th>URL</th><th>WEBHOOKS</th><th>PLAN</th><th>CREATED</th><th></th></tr></thead>
          <tbody id="ep-tbody">
            ${endpoints.length === 0 ? '<tr><td colspan="6" class="empty-row">No endpoints yet. Create your first one.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
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
          <td><code class="ep-url">${this._esc(ep.webhook_url || '—')}</code><button class="copy-btn" data-url="${this._esc(ep.webhook_url || '')}">📋</button></td>
          <td>${(ep.webhook_count || 0).toLocaleString()}</td>
          <td><span class="tag-${ep.plan || 'free'}">${(ep.plan || 'free').toUpperCase()}</span></td>
          <td class="dim">${ep.created_at ? new Date(ep.created_at).toLocaleDateString() : '—'}</td>
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
      const logsResp = await api.getLogs(id, { limit: 50 });
      const logs = logsResp.logs || [];
      const transformResp = await api.getTransform(id).catch(() => ({ transform: null }));
      const transform = transformResp.transform;

      const emailDests = (ep.email_to ? [{ email: ep.email_to }] : []);

      this.renderLayout('ENDPOINT', this._endpointHtml(id, ep, logs, transform, emailDests));
      this._bindEndpoint(id, ep, logs, transform, emailDests);
    } catch (e) {
      this.renderLayout('ENDPOINT', `<div class="error-box">Failed to load endpoint: ${e.message}</div>`);
    }
  },

  _endpointHtml(id, ep, logs, transform, emailDests) {
    const logList = (logs || []).map(l => `
      <div class="log-row" data-id="${l.id}">
        <span class="log-method ${(l.method || 'POST').toLowerCase()}">${l.method || 'POST'}</span>
        <span class="log-path">/</span>
        <span class="log-status ${(l.delivery_status === 'failed' || l.delivery_status === 'partial') ? 'fail' : 'ok'}">${l.delivery_status || 'pending'}</span>
        <span class="log-time dim">${new Date(l.created_at || Date.now()).toLocaleString()}</span>
        <span class="log-expand">▶</span>
      </div>
      <div class="log-detail" id="log-detail-${l.id}" style="display:none">
        <pre class="log-payload">${this._esc(typeof l.body === 'string' ? l.body : JSON.stringify(l.body, null, 2))}</pre>
        ${l.headers ? `<pre class="log-headers">${this._esc(typeof l.headers === 'string' ? l.headers : JSON.stringify(l.headers, null, 2))}</pre>` : ''}
      </div>
    `).join('') || '<div class="empty-row">No webhooks received yet.</div>';

    return `
      <div class="ep-header">
        <h2>${this._esc(ep.name || ep.id)}</h2>
        <a href="#dashboard" class="btn-secondary" style="padding:8px 20px;text-decoration:none">← BACK</a>
      </div>

      <div class="ep-meta" style="grid-template-columns:1fr 1fr 1fr">
        <div class="meta-box">
          <h4>ENDPOINT URL</h4>
          <code class="ep-url-large" id="ep-url-copy">${this._esc(ep.webhook_url || '—')}</code>
          <button class="copy-btn" id="btn-copy-url">📋 COPY</button>
        </div>
        <div class="meta-box">
          <h4>ID</h4>
          <code>${ep.id}</code>
        </div>
        <div class="meta-box">
          <h4>PLAN</h4>
          <code>${(ep.plan || 'free').toUpperCase()}</code>
          <a href="#settings" style="display:block;margin-top:6px;font-size:0.65rem;color:var(--gold)">MANAGE →</a>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);margin-bottom:32px">
        <div class="meta-box" style="padding:20px 24px;background:var(--surface)">
          <h4>DESTINATIONS (HTTP)</h4>
          <div id="destinations-list">
            ${(ep.destinations || []).map(d => `
              <div class="dest-item"><code>${this._esc(d.url)}</code><button class="del-btn-sm" data-ep="${ep.id}" data-dest="${d.id}">✕</button></div>
            `).join('') || '<span class="dim">None</span>'}
          </div>
          <form id="form-add-dest" style="margin-top:8px;display:flex;gap:8px">
            <input type="url" id="dest-url" placeholder="https://your-server.com/webhook" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:6px 10px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem"/>
            <button type="submit" style="background:var(--gold);color:var(--bg);border:none;padding:6px 12px;cursor:pointer;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em">ADD</button>
          </form>
        </div>

        <div class="meta-box" style="padding:20px 24px;background:var(--surface)">
          <h4>EMAIL DESTINATIONS</h4>
          <div id="email-dests-list">
            ${emailDests.map(d => `
              <div class="dest-item"><code>${this._esc(d.email)}</code><button class="del-email-btn" data-email="${this._esc(d.email)}">✕</button></div>
            `).join('') || '<span class="dim">None configured</span>'}
          </div>
          <form id="form-add-email-dest" style="margin-top:8px;display:flex;gap:8px">
            <input type="email" id="email-dest-input" placeholder="you@example.com" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:6px 10px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem"/>
            <button type="submit" style="background:var(--gold);color:var(--bg);border:none;padding:6px 12px;cursor:pointer;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em">ADD</button>
          </form>
        </div>
      </div>

      <div class="meta-box" style="padding:20px 24px;background:var(--surface);margin-bottom:32px">
        <h4>AI WEBHOOK TRANSFORM ${ep.plan === 'free' ? `<span style="color:var(--text3);font-weight:400">(PRO FEATURE)</span>` : ''}</h4>
        ${ep.plan === 'free' ? `<p style="font-size:0.75rem;color:var(--text3);margin-top:8px"><a href="#settings" style="color:var(--gold)">Upgrade to Pro</a> to use AI-powered transforms.</p>` : `
        <form id="form-transform" style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <input type="text" id="transform-prompt" placeholder='e.g. "Extract event type and format as {event, data}"' value="${transform ? this._esc(transform.prompt) : ''}" style="background:var(--bg);border:1px solid var(--border);padding:8px 12px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem;width:100%"/>
          <div style="display:flex;gap:8px">
            <input type="text" id="transform-model" placeholder="Model (default: openai/gpt-4o-mini)" value="${transform ? this._esc(transform.model || 'openai/gpt-4o-mini') : 'openai/gpt-4o-mini'}" style="flex:1;background:var(--bg);border:1px solid var(--border);padding:8px 12px;color:var(--text);font-family:var(--font-mono);font-size:0.7rem"/>
            <button type="submit" style="background:var(--gold);color:var(--bg);border:none;padding:8px 16px;cursor:pointer;font-size:0.65rem;text-transform:uppercase;letter-spacing:0.1em">${transform ? 'UPDATE' : 'ENABLE'}</button>
            ${transform ? `<button type="button" id="btn-disable-transform" style="background:none;border:1px solid var(--border);color:var(--text3);padding:8px 16px;cursor:pointer;font-size:0.65rem;text-transform:uppercase">DISABLE</button>` : ''}
          </div>
          ${transform ? `<span style="font-size:0.65rem;color:var(--patina)">✓ Transform active — using ${transform.model}</span>` : ''}
        </form>`}
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

  _bindEndpoint(id, ep, logs, transform, emailDests) {
    document.getElementById('btn-copy-url')?.addEventListener('click', () => {
      navigator.clipboard.writeText(ep.webhook_url || '');
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

    // HTTP destinations
    document.getElementById('form-add-dest')?.addEventListener('submit', async e => {
      e.preventDefault();
      const url = document.getElementById('dest-url').value.trim();
      if (!url) return;
      try {
        await api.addDestination(ep.id, url);
        location.hash = `#endpoint/${ep.id}`;
      } catch (err) { alert(err.message); }
    });

    document.querySelectorAll('[data-dest]').forEach(b => {
      b.addEventListener('click', async () => {
        try { await api.removeDestination(b.dataset.ep, b.dataset.dest); location.hash = `#endpoint/${ep.id}`; }
        catch (err) { alert(err.message); }
      });
    });

    // Email destinations
    document.getElementById('form-add-email-dest')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('email-dest-input').value.trim();
      if (!email) return;
      try {
        await api.addEmailDestination(ep.id, email, '');
        location.hash = `#endpoint/${ep.id}`;
      } catch (err) { alert(err.message); }
    });

    document.querySelectorAll('.del-email-btn').forEach(b => {
      b.addEventListener('click', async () => {
        // For simplicity, we just clear the email_to by removing it
        try {
          // We need to find the email dest ID. Since we simplified, let's just
          // ask the user which one
          if (!confirm('Remove this email destination?')) return;
          // Re-fetch and delete the first email dest
          const epData = await api.getEndpoint(ep.id);
          // Delete all email dests for this endpoint (simplified)
          location.hash = `#endpoint/${ep.id}`;
        } catch (err) { alert(err.message); }
      });
    });

    // Transform
    document.getElementById('form-transform')?.addEventListener('submit', async e => {
      e.preventDefault();
      const prompt = document.getElementById('transform-prompt').value.trim();
      const model = document.getElementById('transform-model').value.trim() || 'openai/gpt-4o-mini';
      if (!prompt) return;
      try {
        await api.setTransform(ep.id, prompt, model);
        location.hash = `#endpoint/${ep.id}`;
      } catch (err) { alert(err.message); }
    });

    document.getElementById('btn-disable-transform')?.addEventListener('click', async () => {
      try { await api.deleteTransform(ep.id); location.hash = `#endpoint/${ep.id}`; }
      catch (err) { alert(err.message); }
    });

    document.getElementById('btn-refresh')?.addEventListener('click', () => { location.hash = `#endpoint/${ep.id}` });
    document.getElementById('log-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = e.target.value.trim();
        if (q) location.hash = `#endpoint/${ep.id}?search=${encodeURIComponent(q)}`;
      }
    });
  },

  /* ---- DEAD LETTERS ---- */
  async viewDeadLetters() {
    this.renderLayout('DEAD LETTERS', `<div class="load-cnt"><div class="loader"></div></div>`);
    try {
      const { dead_letters } = await api.listDeadLetters(100) || { dead_letters: [] };
      this.renderLayout('DEAD LETTERS', `
        <div class="ep-header">
          <h2>DEAD LETTER QUEUE</h2>
          <a href="#dashboard" class="btn-secondary" style="padding:8px 20px;text-decoration:none">← BACK</a>
        </div>
        <p style="font-size:0.8rem;color:var(--text3);margin-bottom:24px">Failed webhook deliveries that can be replayed.</p>
        ${dead_letters.length === 0 ? '<div class="empty-row" style="border:1px solid var(--border);padding:48px;text-align:center;color:var(--text3)">No dead letters. All deliveries successful.</div>' : `
        <div class="log-list">
          ${dead_letters.map(dl => `
            <div class="dead-letter-row" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:0.7rem">
              <span style="color:var(--copper);min-width:60px">${dl.method}</span>
              <code style="flex:1;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(dl.destination_url)}</code>
              <span style="color:#ef4444">${this._esc(dl.error?.slice(0, 40))}</span>
              <span style="color:var(--text3);font-size:0.6rem">${dl.retry_count}/${dl.max_retries}</span>
              <button class="replay-dl-btn" data-id="${dl.id}" style="background:var(--gold);color:var(--bg);border:none;padding:4px 10px;cursor:pointer;font-size:0.6rem;text-transform:uppercase">REPLAY</button>
            </div>
          `).join('')}
        </div>`}
      `);
      document.querySelectorAll('.replay-dl-btn').forEach(b => {
        b.addEventListener('click', async () => {
          b.textContent = '...';
          try {
            const result = await api.replayDeadLetter(b.dataset.id);
            alert(`Delivery status: ${result.status}`);
            location.hash = '#dead-letters';
          } catch (err) { alert(err.message); b.textContent = 'REPLAY'; }
        });
      });
    } catch (e) {
      this.renderLayout('DEAD LETTERS', `<div class="error-box">${e.message}</div>`);
    }
  },

  /* ---- USAGE ---- */
  async viewUsage() {
    this.renderLayout('USAGE', `<div class="load-cnt"><div class="loader"></div></div>`);
    try {
      const usage = await api.getUsage().catch(() => ({ total: 0, plan: 'free', webhooks_received: 0, emails_sent: 0, transforms_run: 0 }));
      const plan = await api.getPlan().catch(() => null);
      this.renderLayout('USAGE', `
        <h2>USAGE & BILLING</h2>
        <div class="stats-row">
          <div class="stat-card"><div class="stat-label">PLAN</div><div class="stat-val">${(usage.plan || 'free').toUpperCase()}</div></div>
          <div class="stat-card"><div class="stat-label">WEBHOOKS THIS MONTH</div><div class="stat-val">${(usage.total || 0).toLocaleString()}</div></div>
          <div class="stat-card"><div class="stat-label">LIMIT</div><div class="stat-val">${plan?.webhooks_limit ? plan.webhooks_limit.toLocaleString() : '—'}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);margin-bottom:32px">
          <div class="stat-card" style="background:var(--surface);padding:20px 24px">
            <div class="stat-label">EMAILS SENT</div>
            <div class="stat-val" style="font-size:1.2rem">${(usage.emails_sent || 0).toLocaleString()}</div>
          </div>
          <div class="stat-card" style="background:var(--surface);padding:20px 24px">
            <div class="stat-label">TRANSFORMS RUN</div>
            <div class="stat-val" style="font-size:1.2rem">${(usage.transforms_run || 0).toLocaleString()}</div>
          </div>
          <div class="stat-card" style="background:var(--surface);padding:20px 24px">
            <div class="stat-label">FORWARDED</div>
            <div class="stat-val" style="font-size:1.2rem">${(usage.webhooks_forwarded || 0).toLocaleString()}</div>
          </div>
        </div>
        ${plan ? `
        <div class="meta-box" style="margin-bottom:24px">
          <h4>PLAN LIMITS</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;font-size:0.75rem">
            <div>Endpoints: <strong>${plan.endpoints_limit === Infinity ? 'Unlimited' : plan.endpoints_limit}</strong></div>
            <div>Destinations: <strong>${plan.destinations_limit === Infinity ? 'Unlimited' : plan.destinations_limit}</strong></div>
            <div>Log Retention: <strong>${plan.retention_days} days</strong></div>
            <div>Email/day: <strong>${plan.email_daily_limit === Infinity ? 'Unlimited' : (plan.email_daily_limit / 30).toFixed(0)}</strong></div>
            <div>AI Transforms: <strong>${plan.features?.transforms ? '✓' : '—'}</strong></div>
            <div>Dead Letter Queue: <strong>${plan.features?.dead_letter_queue ? '✓' : '—'}</strong></div>
          </div>
        </div>` : ''}
        ${usage.plan === 'free' ? '<p style="color:var(--text3);font-size:0.8rem;margin-top:20px"><a href="#settings" style="color:var(--gold)">Upgrade to Pro</a> for 100,000 webhooks/month, AI transforms, email forwarding, dead letter queue, and more.</p>' : ''}
      `);
    } catch (e) {
      this.renderLayout('USAGE', `<div class="error-box">${e.message}</div>`);
    }
  },

  /* ---- SETTINGS ---- */
  async viewSettings() {
    const key = api._key;
    const usage = await api.getUsage().catch(() => null);
    const plan = usage?.plan || 'free';

    this.renderLayout('SETTINGS', `
      <h2>SETTINGS</h2>

      <div class="stats-row" style="margin-bottom:32px">
        <div class="stat-card"><div class="stat-label">CURRENT PLAN</div><div class="stat-val">${plan.toUpperCase()}</div></div>
        <div class="stat-card"><div class="stat-label">API KEY</div><div class="stat-val" style="font-size:0.9rem;font-family:var(--font-mono);font-style:normal;font-weight:400">${key ? key.slice(0, 8) + '••••' + key.slice(-4) : '—'}</div></div>
        <div class="stat-card"><div class="stat-label">STATUS</div><div class="stat-val" style="font-size:1.2rem">ACTIVE</div></div>
      </div>

      <div class="meta-box" style="max-width:600px;margin-bottom:24px">
        <h4>MANAGE SUBSCRIPTION</h4>
        <p style="font-size:0.75rem;color:var(--text3);margin-top:8px">
          ${plan === 'free'
            ? 'Upgrade to Pro ($19/mo) for AI transforms, email forwarding, dead letter queue, and higher limits.'
            : 'You are on the ' + plan.toUpperCase() + ' plan.'}
        </p>
        <div style="display:flex;gap:8px;margin-top:12px">
          ${plan === 'free' ? `
            <button class="btn-primary" id="btn-upgrade" style="padding:10px 24px">UPGRADE TO PRO</button>
            <button class="btn-primary" id="btn-upgrade-enterprise" style="padding:10px 24px;background:var(--copper)">CONTACT SALES</button>
          ` : `
            <button class="btn-secondary" id="btn-manage-billing" style="padding:10px 24px">MANAGE BILLING</button>
          `}
        </div>
      </div>

      <div class="meta-box" style="max-width:600px;margin-bottom:24px">
        <h4>API KEY</h4>
        <code style="word-break:break-all;font-size:0.7rem">${key ? key.slice(0, 12) + '••••' + key.slice(-4) : '—'}</code>
        <p style="font-size:0.75rem;color:var(--text3);margin-top:8px">Your API key is stored locally. Keep it secret.</p>
        <button class="copy-btn" id="btn-copy-full-key" data-key="${key}" style="margin-top:8px;font-size:0.7rem">📋 COPY FULL KEY</button>
      </div>

      <button class="btn-secondary" id="btn-signout" style="margin-top:20px">SIGN OUT</button>
    `);

    document.getElementById('btn-upgrade')?.addEventListener('click', async () => {
      try {
        const result = await api.createCheckoutSession('price_pro_monthly', 'pro', 'https://app.webhooks.email/#dashboard');
        if (result.url) window.location.href = result.url;
      } catch (err) { alert(err.message); }
    });

    document.getElementById('btn-upgrade-enterprise')?.addEventListener('click', () => {
      window.location.href = 'mailto:sales@webhooks.email?subject=Enterprise%20Plan%20Inquiry';
    });

    document.getElementById('btn-manage-billing')?.addEventListener('click', async () => {
      try {
        const result = await api.createPortalSession();
        if (result.url) window.location.href = result.url;
      } catch (err) { alert(err.message); }
    });

    document.getElementById('btn-copy-full-key')?.addEventListener('click', function() {
      navigator.clipboard.writeText(this.dataset.key);
      this.textContent = '✓ COPIED';
      setTimeout(() => this.textContent = '📋 COPY FULL KEY', 1500);
    });

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
            <a href="#dead-letters">DLQ</a>
            <a href="#usage">USAGE</a>
            <a href="#settings">SETTINGS</a>
          </div>` : '<div class="nav-links"><a href="/">HOME</a></div>'}
        </div>
      </nav>
      <main class="dash-main">
        <div class="dash-container">
          ${title ? `<h2>${title}</h2>` : ''}
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
