'use strict';

/* ════════════════════════════════════════════════════════
   DASHBOARD  — provider home view
   Fetches kote_orders + kote_clients from Supabase.
   Renders into #vDash (tab: orders / clients).

   Public API:
     DASHBOARD.load()               — initial fetch + render
     DASHBOARD.switchTab(tab)       — 'orders' | 'clients'
     DASHBOARD.setStatus(id, val)   — patch order status in Supabase
     DASHBOARD.toggleOrder(id)      — expand/collapse order card
     DASHBOARD.openInvoice(id)      — open order in INVOICE preview
     DASHBOARD.refresh()            — re-fetch silently
   ════════════════════════════════════════════════════════ */
const DASHBOARD = (() => {

  let _orders      = [];
  let _clients     = [];
  let _quotes      = [];
  let _tab         = 'orders';
  let _loading     = false;
  let _kpiPeriod   = 'today'; // 'today' | 'week' | 'month' | 'range'
  let _kpiFrom     = '';      // ISO date string for range start
  let _kpiTo       = '';      // ISO date string for range end
  let _searchQuery = '';

  /* ── Supabase GET helper ── */
  async function _get(path) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── Supabase PATCH helper ── */
  async function _patch(table, id, body) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  /* ── Status meta ── */
  const STATUS = {
    nouveau:       { label: 'Nouveau',        color: '#f59e0b', bg: '#fffbeb', bd: '#fde68a' },
    en_cours:      { label: 'En cours',       color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe' },
    en_impression: { label: 'Impression',     color: '#d946ef', bg: '#fdf4ff', bd: '#f0abfc' },
    finition:      { label: 'Finition',       color: '#f97316', bg: '#fff7ed', bd: '#fed7aa' },
    conception:    { label: 'Conception',     color: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe' },
    pret:          { label: 'Prêt à livrer',  color: '#16a34a', bg: '#f0fdf4', bd: '#bbf7d0' },
    livre:         { label: 'Livré',          color: '#0891b2', bg: '#ecfeff', bd: '#a5f3fc' },
    annule:        { label: 'Annulé',         color: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  };
  const _st = k => STATUS[k] || STATUS.nouveau;

  /* ── Load both tables ── */
  async function load() {
    if (_loading) return;
    _loading = true;
    _renderSkeleton();

    /* JSON mode — use embedded arrays, no Supabase fetch */
    if (typeof DB_MOD !== 'undefined' && DB_MOD.getSource() !== 'supabase') {
      _orders  = [];   // orders come from client.html → Supabase only
      _clients = window._jsonClients || [];
      _quotes  = window._jsonQuotes  || [];
      _loading = false;
      _render();
      return;
    }

    try {
      const [orders, clients, quotes] = await Promise.all([
        _get('kote_orders?select=*&order=created_at.desc&limit=100'),
        _get('kote_clients?select=*&order=nom.asc&limit=200'),
        _get('kote_quotes?select=*&order=created_at.desc&limit=100'),
      ]);
      _orders  = orders  || [];
      _clients = clients || [];
      _quotes  = quotes  || [];
    } catch(e) {
      console.warn('[DASHBOARD] load failed:', e);
      _renderError(e.message);
      _loading = false;
      return;
    }

    _loading = false;
    _render();
  }

  /* ── Silent refresh ── */
  async function refresh() {
    if (typeof DB_MOD !== 'undefined' && DB_MOD.getSource() !== 'supabase') {
      _clients = window._jsonClients || [];
      _quotes  = window._jsonQuotes  || [];
      _render();
      return;
    }
    try {
      const [orders, clients, quotes] = await Promise.all([
        _get('kote_orders?select=*&order=created_at.desc&limit=100'),
        _get('kote_clients?select=*&order=nom.asc&limit=200'),
        _get('kote_quotes?select=*&order=created_at.desc&limit=100'),
      ]);
      _orders  = orders  || [];
      _clients = clients || [];
      _quotes  = quotes  || [];
      _render();
    } catch(e) { console.warn('[DASHBOARD] refresh failed:', e); }
  }

  /* ── Switch tab ── */
  function switchTab(tab) {
    _tab = tab;
    // Update tab buttons
    document.querySelectorAll('.dash-tab-btn').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    _renderContent();
  }

  /* ── Toggle order expand ── */
  function toggleOrder(id) {
    const card = $('dord-' + id);
    if (card) card.classList.toggle('open');
  }

  /* ── Set status ── */
  async function setStatus(id, val) {
    // Optimistic UI: update pills immediately
    const card = $('dord-' + id);
    if (card) {
      card.querySelectorAll('.dash-st-pill').forEach(btn => {
        const isActive = btn.dataset.status === val;
        btn.classList.toggle('act', isActive);
        const v = STATUS[btn.dataset.status];
        if (v) {
          btn.style.background   = isActive ? v.bg  : '';
          btn.style.color        = isActive ? v.color : '';
          btn.style.borderColor  = isActive ? v.bd  : '';
        }
      });
      // Update header badge too
      const badge = card.querySelector('.dash-st-badge');
      if (badge) {
        const s = _st(val);
        badge.textContent = s.label;
        badge.style.background  = s.bg;
        badge.style.color       = s.color;
        badge.style.borderColor = s.bd;
      }
      // Update card left border
      card.style.borderLeftColor = _st(val).color;
    }
    try {
      await _patch('kote_orders', id, { status: val });
      const ord = _orders.find(o => o.id === id);
      if (ord) ord.status = val;
      _renderStats();
    } catch(e) {
      console.warn('[DASHBOARD] setStatus failed:', e);
      alert('Mise à jour échouée: ' + e.message);
      // Rollback on failure — re-render the card
      _renderContent();
    }
  }

  /* ── Open order in INVOICE preview ── */
  function openInvoice(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const p = ord.payload || {};
    // Attach client from order if not already in payload
    if (ord.client_nom && !p.client) {
      p.client = {
        nom:     ord.client_nom,
        tel:     ord.client_tel     || '',
        email:   ord.client_email   || '',
        adresse: ord.client_adresse || '',
        ville:   ord.client_ville   || '',
      };
    }
    if (typeof INVOICE !== 'undefined') {
      INVOICE.open(p, { dbId: ord.id, docType: ord.status || 'devis' });
    }
  }

  /* ── WA notify for an order ── */
  function notifyWA(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    if (!waPhone) { alert('Numéro WhatsApp non configuré dans les réglages.'); return; }
    const p = ord.payload || {};
    const items = p.items || [];
    const ttc = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const lines = [
      `Kote Imprimerie — Confirmation de commande`,
      ``,
      `Ref : ${ord.ref}`,
      `Client : ${ord.client_nom || '—'}`,
      ord.client_tel ? `Tel : ${ord.client_tel}` : null,
      ``,
      `Produits`,
      `--------`,
      ...items.map(i => `- ${fmtN(i.quantity)} x ${i.prodName}${i.specs ? ' ('+i.specs+')' : ''}  ${fmt(i.baseTotal)} DH`),
      ``,
      `Total HT  : ${fmt(ord.total_ht)} DH`,
      `Total TTC : ${fmt(ttc)} DH`,
      ``,
      `Statut : ${STATUS[ord.status||'nouveau']?.label || 'Nouveau'}`,
    ].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(lines)}`, '_blank');
  }

  /* ── Mail notify for an order ── */
  function notifyEmail(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord || !ord.client_email) return;
    const p     = ord.payload || {};
    const items = p.items || [];
    const ttc   = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const d     = ord.created_at
      ? new Date(ord.created_at).toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'})
      : new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});

    const subject = `Commande ${ord.ref} — Kote Imprimerie`;
    const body = [
      `Bonjour ${ord.client_nom || ''},`,
      ``,
      `Nous avons bien reçu votre commande du ${d}.`,
      ``,
      `RECAPITULATIF`,
      `=============`,
      `Reference : ${ord.ref}`,
      ``,
      ...items.map(i => `  - ${fmtN(i.quantity)} x ${i.prodName}${i.specs ? ' ('+i.specs+')' : ''}`
        + `\n    Montant : ${fmt(i.baseTotal)} DH HT`),
      ``,
      `Total HT  : ${fmt(ord.total_ht)} DH`,
      `TVA 20%   : ${fmt(ttc-(ord.total_ht||0))} DH`,
      `Total TTC : ${fmt(ttc)} DH`,
      ``,
      `Statut : ${STATUS[ord.status||'nouveau']?.label || 'Nouveau'}`,
      ``,
      `Notre équipe vous contactera dès que votre commande sera prête.`,
      `Pour toute question, répondez à cet email ou appelez-nous.`,
      ``,
      `Cordialement,`,
      `L'équipe Kote Imprimerie`,
      `144, Bd de la Gironde — Casablanca`,
      `Tel : +212 6 44 50 20 90`,
      `contact@kdigital.ma  |  www.kdigital.ma`,
    ].join('\n');

    window.open(`mailto:${ord.client_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  /* ── Render helpers ── */
  function _renderSkeleton() {
    const body = $('dashBody');
    if (!body) return;
    body.innerHTML = `
      <div class="dash-loading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          style="width:22px;height:22px;opacity:.35;animation:spin 1s linear infinite">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        <span>Chargement du tableau de bord…</span>
      </div>`;
  }

  function _renderError(msg) {
    const body = $('dashBody');
    if (!body) return;
    body.innerHTML = `
      <div class="dash-loading" style="color:var(--rd)">
        ${IC.alert}
        <span>Erreur de chargement — ${msg}</span>
        <button class="btn btn-outline" style="height:30px;font-size:.65rem;margin-top:.5rem"
          onclick="DASHBOARD.load()">Réessayer</button>
      </div>`;
  }

  function _render() {
    const wrap = $('dashWrap');
    if (!wrap) return;

    wrap.innerHTML = `
      <!-- KPI Panel -->
      <div class="dash-kpi" id="dashKpi"></div>

      <!-- Tabs + Search row -->
      <div class="dash-header-row">
        <div class="dash-tabs">
          <button class="dash-tab-btn${_tab==='orders'?' on':''}" data-tab="orders"
            onclick="DASHBOARD.switchTab('orders')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            Commandes <span class="dash-tab-count" id="dashOrdCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='clients'?' on':''}" data-tab="clients"
            onclick="DASHBOARD.switchTab('clients')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Clients <span class="dash-tab-count" id="dashCliCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='quotes'?' on':''}" data-tab="quotes"
            onclick="DASHBOARD.switchTab('quotes')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Devis <span class="dash-tab-count" id="dashQtCount"></span>
          </button>
        </div>
        <div class="dash-tab-actions">
          <div class="dash-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dash-search-ico"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input class="dash-search-inp" id="dashSearchInp" type="text"
              placeholder="Réf., client, tél…" autocomplete="off" spellcheck="false">
            <button class="dash-search-clear" id="dashSearchClear" style="display:none"
              onclick="DASHBOARD._clearSearch()">✕</button>
          </div>
          <button class="dash-refresh-btn" onclick="DASHBOARD.refresh()" title="Actualiser">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="dash-content" id="dashContent"></div>`;

    // Persistent search listener — never loses focus
    const inp = $('dashSearchInp');
    const clr = $('dashSearchClear');
    if (inp) {
      inp.value = _searchQuery;
      inp.addEventListener('input', e => {
        _searchQuery = e.target.value.toLowerCase().trim();
        if (clr) clr.style.display = _searchQuery ? 'flex' : 'none';
        _renderContent();
      });
    }

    _renderStats();
    _renderContent();
  }

  function _clearSearch() {
    _searchQuery = '';
    const inp = $('dashSearchInp');
    const clr = $('dashSearchClear');
    if (inp) { inp.value = ''; inp.focus(); }
    if (clr) clr.style.display = 'none';
    _renderContent();
  }

  /* ── KPI period helpers ── */
  function setKpiPeriod(p) {
    _kpiPeriod = p;
    _renderStats();
  }
  function setKpiRange(from, to) {
    _kpiFrom = from; _kpiTo = to;
    if (from && to) { _kpiPeriod = 'range'; _renderStats(); }
  }

  /* Returns [startDate, endDate] for the current period */
  function _periodRange() {
    const now  = new Date();
    const sod  = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const eod  = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    if (_kpiPeriod === 'today') {
      return [sod(now), eod(now)];
    }
    if (_kpiPeriod === 'week') {
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay()+6)%7));
      return [sod(mon), eod(now)];
    }
    if (_kpiPeriod === 'month') {
      return [new Date(now.getFullYear(), now.getMonth(), 1), eod(now)];
    }
    if (_kpiPeriod === 'range' && _kpiFrom && _kpiTo) {
      return [sod(new Date(_kpiFrom)), eod(new Date(_kpiTo))];
    }
    return [sod(now), eod(now)];
  }

  function _renderStats() {
    const el = $('dashKpi');
    if (!el) return;

    const [periodStart, periodEnd] = _periodRange();
    const inPeriod = o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d >= periodStart && d <= periodEnd;
    };

    const periodOrders = _orders.filter(inPeriod);
    const total        = _orders.length;
    const pTotal       = periodOrders.length;
    const byStatus     = k => _orders.filter(o => (o.status||'nouveau') === k).length;

    const caPeriod  = periodOrders.reduce((s,o) => s + (o.total_ht||0), 0);
    const caTotal   = _orders.reduce((s,o) => s + (o.total_ht||0), 0);
    const avgVal    = pTotal ? caPeriod / pTotal : 0;
    const pending   = _orders.filter(o => !['livre','annule'].includes(o.status||'nouveau')).length;
    const delCount  = periodOrders.filter(o => (o.payload?.totals?.del||0) > 0).length;
    const delRate   = pTotal ? Math.round(100 * delCount / pTotal) : 0;

    // Previous-period comparison for trend
    const periodMs  = periodEnd - periodStart;
    const prevStart = new Date(periodStart - periodMs);
    const prevEnd   = new Date(periodStart - 1);
    const caPrev    = _orders.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d >= prevStart && d <= prevEnd;
    }).reduce((s,o) => s + (o.total_ht||0), 0);
    const trend     = caPrev > 0 ? Math.round(((caPeriod - caPrev) / caPrev) * 100) : null;
    const trendHtml = trend !== null
      ? `<span class="kpi-trend ${trend >= 0 ? 'up' : 'dn'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="9" height="9"><path d="${trend >= 0 ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg>${Math.abs(trend)}%</span>`
      : '';

    const periodLabels = { today:'Aujourd\'hui', week:'Cette semaine', month:'Ce mois', range:'Période' };
    const periodLabel  = periodLabels[_kpiPeriod] || '';

    // Pipeline: 7 evenly-distributed tiles
    const PIPE = [
      { k:'nouveau',       label:'Nouveau',     color:'#f59e0b', bg:'#fffbeb' },
      { k:'en_cours',      label:'En cours',    color:'#2563eb', bg:'#eff6ff' },
      { k:'en_impression', label:'Impression',  color:'#d946ef', bg:'#fdf4ff' },
      { k:'finition',      label:'Finition',    color:'#f97316', bg:'#fff7ed' },
      { k:'pret',          label:'Prêt',        color:'#16a34a', bg:'#f0fdf4' },
      { k:'livre',         label:'Livré',       color:'#0891b2', bg:'#ecfeff' },
      { k:'annule',        label:'Annulé',      color:'#dc2626', bg:'#fef2f2' },
    ];

    // Proportional bar segments
    const pipeTotal    = PIPE.reduce((s,p) => s + byStatus(p.k), 0) || 1;
    const barSegs      = PIPE.map(p => {
      const n   = byStatus(p.k);
      const pct = Math.max(0, Math.round((n / pipeTotal) * 1000) / 10);
      if (!n) return '';
      return `<div class="kpi-bar-seg" style="width:${pct}%;background:${p.color}" title="${p.label}: ${n}" onclick="DASHBOARD.filterByStatus('${p.k}')"></div>`;
    }).join('');

    // Update tab counts
    const oc = $('dashOrdCount'), cc = $('dashCliCount'), qc = $('dashQtCount');
    if (oc) oc.textContent = total || '';
    if (cc) cc.textContent = _clients.length || '';
    if (qc) qc.textContent = _quotes.length || '';

    el.innerHTML = `
      <!-- Period selector -->
      <div class="kpi-period-row">
        <div class="kpi-period-pills">
          ${['today','week','month'].map(k => `
            <button class="kpi-pp${_kpiPeriod===k?' on':''}" onclick="DASHBOARD.setKpiPeriod('${k}')">
              ${ {today:'Aujourd\'hui', week:'7 jours', month:'Ce mois'}[k] }
            </button>`).join('')}
          <button class="kpi-pp${_kpiPeriod==='range'?' on':''}" onclick="DASHBOARD.setKpiPeriod('range')">
            Période
          </button>
        </div>
        ${_kpiPeriod === 'range' ? `
          <div class="kpi-range-row">
            <input type="date" class="kpi-date-inp" value="${_kpiFrom}"
              onchange="DASHBOARD.setKpiRange(this.value, document.getElementById('kpiRangeTo').value)">
            <span class="kpi-range-sep">→</span>
            <input type="date" class="kpi-date-inp" id="kpiRangeTo" value="${_kpiTo}"
              onchange="DASHBOARD.setKpiRange(document.querySelector('.kpi-date-inp').value, this.value)">
          </div>` : ''}
        <span class="kpi-period-lbl">${periodLabel} · ${pTotal} commande${pTotal!==1?'s':''}</span>
      </div>

      <!-- 4 metric cards -->
      <div class="kpi-cards">
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#eff6ff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.8" width="15" height="15"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${fmt(caPeriod)} <span class="kpi-unit">DH</span>${trendHtml}</div>
            <div class="kpi-card-lbl">Chiffre d'affaires</div>
            <div class="kpi-card-sub">Total cumulé : ${fmt(caTotal)} DH</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#f5f3ff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.8" width="15" height="15"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${pTotal}</div>
            <div class="kpi-card-lbl">Commandes</div>
            <div class="kpi-card-sub"><span style="color:#f59e0b;font-weight:700">${pending}</span> en production</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#ecfdf5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" width="15" height="15"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${fmt(avgVal)} <span class="kpi-unit">DH</span></div>
            <div class="kpi-card-lbl">Panier moyen</div>
            <div class="kpi-card-sub">par commande HT</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#ecfeff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="1.8" width="15" height="15"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${delRate}<span class="kpi-unit">%</span></div>
            <div class="kpi-card-lbl">Avec livraison</div>
            <div class="kpi-card-sub">${delCount} commande${delCount!==1?'s':''}</div>
          </div>
        </div>
      </div>

      <!-- Pipeline: 7 evenly-distributed tiles -->
      <div class="kpi-pipeline">
        <div class="kpi-pipe-tiles">
          ${PIPE.map(p => {
            const n = byStatus(p.k);
            return `<button class="kpi-tile" onclick="DASHBOARD.filterByStatus('${p.k}')">
              <span class="kpi-tile-dot" style="background:${p.color}"></span>
              <span class="kpi-tile-num" style="color:${p.color}">${n}</span>
              <span class="kpi-tile-lbl">${p.label}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="kpi-bar" style="margin-top:.45rem">${barSegs || '<div style="flex:1;background:var(--bd);border-radius:6px"></div>'}</div>
      </div>`;
  }

  /* ── Filter by status (click on pipeline stage) ── */
  function filterByStatus(status) {
    switchTab('orders');
    const el = $('dashContent');
    if (!el) return;
    const filtered = _orders.filter(o => (o.status||'nouveau') === status);
    if (!filtered.length) { el.innerHTML = `<div class="dash-empty"><div>Aucune commande avec ce statut</div></div>`; return; }
    const s = STATUS[status];
    el.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:.4rem;font-size:.65rem;color:var(--t3)">
      <span class="dash-st-badge" style="background:${s.bg};color:${s.color};border-color:${s.bd}">${s.label}</span>
      ${filtered.length} commande${filtered.length>1?'s':''} · <button class="btn-xs" onclick="DASHBOARD.refresh()" style="color:var(--bl)">Voir tout</button>
    </div>` + _buildOrderCards(filtered);
  }

  function _renderContent() {
    const el = $('dashContent');
    if (!el) return;
    if (_tab === 'orders')  el.innerHTML = _ordersHTML();
    else if (_tab === 'clients') el.innerHTML = _clientsHTML();
    else if (_tab === 'quotes')  el.innerHTML = _quotesHTML();
  }

  /* ── Client-side search (called externally only for programmatic clear) ── */
  function search(q) {
    _searchQuery = (q||'').toLowerCase().trim();
    const clr = $('dashSearchClear');
    if (clr) clr.style.display = _searchQuery ? 'flex' : 'none';
    _renderContent();
  }

  /* ── Orders tab ── */
  function _ordersHTML() {
    if (!_orders.length) return `
      <div class="dash-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
          style="width:32px;height:32px;opacity:.25">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <rect x="9" y="3" width="6" height="4" rx="1"/>
        </svg>
        <div>Aucune commande reçue</div>
        <div style="font-size:.65rem;color:var(--t3)">Les commandes client apparaîtront ici</div>
      </div>`;

    const filtered = _searchQuery
      ? _orders.filter(o =>
          (o.ref||'').toLowerCase().includes(_searchQuery) ||
          (o.client_nom||'').toLowerCase().includes(_searchQuery) ||
          (o.client_tel||'').includes(_searchQuery) ||
          (o.client_email||'').toLowerCase().includes(_searchQuery))
      : _orders;

    if (_searchQuery && !filtered.length) return `
      <div class="dash-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="width:28px;height:28px;opacity:.25"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <div>Aucun résultat pour « ${_searchQuery} »</div>
      </div>`;

    const resultInfo = _searchQuery
      ? `<div class="dash-result-info">${filtered.length} résultat${filtered.length!==1?'s':''} sur ${_orders.length}</div>`
      : '';

    return resultInfo + _buildOrderCards(filtered);
  }

  function _buildOrderCards(orders) {
    return orders.map(o => {
      const p     = o.payload || {};
      const items = p.items || [];
      const s     = _st(o.status || 'nouveau');
      const d     = o.created_at
        ? new Date(o.created_at).toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'})
        : '—';
      const t     = o.created_at
        ? new Date(o.created_at).toLocaleTimeString('fr-MA', {hour:'2-digit',minute:'2-digit'})
        : '';
      const ttc   = o.total_ttc || Math.round((o.total_ht||0) * 1.20 * 100) / 100;
      const delAmt = p.totals?.del || 0;

      const itemsPreview = items.slice(0,2).map(i =>
        `<span class="dash-item-chip">${fmtN(i.quantity)}× ${i.prodName}</span>`
      ).join('') + (items.length > 2
        ? `<span class="dash-item-chip dash-item-more">+${items.length-2}</span>`
        : '');

      const deliveryChip = delAmt > 0
        ? `<span class="dash-item-chip" style="color:#0891b2;border-color:#a5f3fc;background:#ecfeff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</span>`
        : `<span class="dash-item-chip" style="color:var(--t3)">Retrait</span>`;

      // Conception chips — one per item that has a design request
      const conceptionChips = (p.items || []).flatMap(i => {
        if (!i.snap) return [];
        if (i.snap.designOption === 'service' && i.snap.designTier) {
          const tLabel = { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier;
          return [`<span class="dash-item-chip" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;font-weight:700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            Conception ${tLabel}</span>`];
        }
        if (i.snap.designOption === 'file' && i.snap.designFileName) {
          return [`<span class="dash-item-chip" style="color:#0891b2;border-color:#a5f3fc;background:#ecfeff">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Fichier fourni</span>`];
        }
        return [];
      }).join('');

      const itemsDetail = items.map(i => `
        <div class="dash-detail-row">
          <div><div class="dash-detail-name">${i.prodName}</div>
            ${i.specs ? `<div class="dash-detail-spec">${i.specs}</div>` : ''}
            ${i.notes ? `<div class="dash-detail-note">"${i.notes}"</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.67rem;font-weight:700;color:var(--t1)">${fmt(i.baseTotal)} DH</div>
            <div style="font-size:.6rem;color:var(--t3)">${fmtN(i.quantity)} × ${fmt(i.perUnit)}</div>
          </div>
        </div>`).join('');

      const clientNote = p.client?.note
        ? `<div class="dash-client-note">${IC.info} ${p.client.note}</div>` : '';

      // Detect if this order has a design service item
      const hasDesignService = (p.items || []).some(i =>
        i.snap?.designOption === 'service' && i.snap?.designTier
      );

      // Status pills — only show 'conception' status on orders that have design items
      const statusPills = Object.entries(STATUS)
        .filter(([k]) => k !== 'conception' || hasDesignService)
        .map(([k,v]) => {
          const active = (o.status||'nouveau') === k;
          return `<button class="dash-st-pill${active?' act':''}" data-status="${k}"
            style="${active ? `background:${v.bg};color:${v.color};border-color:${v.bd}` : ''}"
            onclick="DASHBOARD.setStatus('${o.id}','${k}')">${v.label}</button>`;
        }).join('');

      return `
        <div class="dash-ord-card" id="dord-${o.id}" style="border-left:3px solid ${s.color}">
          <div class="dash-ord-hdr" onclick="DASHBOARD.toggleOrder('${o.id}')">
            <div class="dash-ord-hdr-l">
              <div class="dash-ord-ref">
                ${o.ref}
                <span class="dash-st-badge" style="background:${s.bg};color:${s.color};border-color:${s.bd}">${s.label}</span>
              </div>
              <div class="dash-ord-client">
                ${o.client_nom || '<span style="color:var(--t3)">—</span>'}
                ${o.client_tel ? `<span style="color:var(--t3);font-weight:400"> · ${o.client_tel}</span>` : ''}
              </div>
              <div class="dash-ord-chips">${itemsPreview}${deliveryChip}${conceptionChips}</div>
            </div>
            <div class="dash-ord-hdr-r">
              <div class="dash-ord-total">${fmt(o.total_ht)} DH</div>
              <div class="dash-ord-ttc">TTC ${fmt(ttc)} DH</div>
              <div class="dash-ord-date">${d} · ${t}</div>
            </div>
            <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>

          <div class="dash-ord-body">
            <!-- Client info -->
            <div class="dash-section-lbl">Client</div>
            <div class="dash-client-grid">
              ${o.client_nom     ? `<div class="dash-client-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:var(--t3)"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${o.client_nom}</div>` : ''}
              ${o.client_tel     ? `<div class="dash-client-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:var(--t3)"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.1.86a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>${o.client_tel}</div>` : ''}
              ${o.client_email   ? `<div class="dash-client-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:var(--t3)"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${o.client_email}</div>` : ''}
              ${delAmt > 0 && o.client_adresse ? `<div class="dash-client-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px;color:var(--t3)"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${o.client_adresse}${o.client_ville?', '+o.client_ville:''}</div>` : ''}
            </div>
            ${clientNote}

            <!-- Products -->
            <div class="dash-section-lbl" style="margin-top:8px">Produits</div>
            <div class="dash-detail-items">${itemsDetail}</div>

            <!-- Totals -->
            <div class="dash-totals-wrap">
              ${delAmt > 0 ? `<div class="dash-totals-row"><span style="color:var(--t3)">Livraison</span><span>+${fmt(delAmt)} DH</span></div>` : ''}
              <div class="dash-totals-row"><span style="color:var(--t2)">Total HT</span><strong>${fmt(o.total_ht)} DH</strong></div>
              <div class="dash-totals-row"><span style="color:var(--t3)">TVA 20%</span><span style="color:var(--t3)">${fmt(ttc-(o.total_ht||0))} DH</span></div>
              <div class="dash-totals-row dash-totals-ttc"><span>Total TTC</span><strong style="color:var(--bl)">${fmt(ttc)} DH</strong></div>
            </div>

            <!-- Status + Actions -->
            <div class="dash-body-footer">
              <div>
                <div class="dash-section-lbl">Statut</div>
                <div class="dash-st-pills">${statusPills}</div>
              </div>
              <div class="dash-action-btns">
                <button class="dash-act-btn dash-act-pdf" onclick="DASHBOARD.openInvoice('${o.id}')">
                  ${IC.printer} Générer facture
                </button>
                <button class="dash-act-btn" style="color:#0891b2;border-color:#a5f3fc;background:#ecfeff" onclick="DASHBOARD.printLabel('${o.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                  Étiquette
                </button>
                <button class="dash-act-btn dash-act-mail${o.client_email?'':' disabled'}" onclick="DASHBOARD.notifyEmail('${o.id}')" title="${o.client_email?'Email: '+o.client_email:'Aucun email'}">
                  ${IC.mail} Mail
                </button>
                <button class="dash-act-btn dash-act-wa" onclick="DASHBOARD.notifyWA('${o.id}')">
                  ${IC.whatsapp} WA
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Clients tab ── */
  function _clientsHTML() {
    if (!_clients.length) return `
      <div class="dash-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
          style="width:32px;height:32px;opacity:.25">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <div>Aucun client enregistré</div>
      </div>`;

    return `<div class="dash-clients-list">` +
      _clients.map(c => `
        <div class="dash-cli-card">
          <div class="dash-cli-avatar">${(c.nom||'?')[0].toUpperCase()}</div>
          <div class="dash-cli-info">
            <div class="dash-cli-name">${c.nom || '—'}</div>
            <div class="dash-cli-meta">
              ${c.tel   ? `<span>${c.tel}</span>`   : ''}
              ${c.email ? `<span>${c.email}</span>` : ''}
              ${c.ice   ? `<span>ICE ${c.ice}</span>` : ''}
            </div>
            ${c.adresse ? `<div class="dash-cli-adr">${c.adresse}</div>` : ''}
          </div>
          ${c.tel ? `
            <a class="dash-cli-wa"
              href="https://wa.me/${c.tel.replace(/\D/g,'')}"
              target="_blank" rel="noopener" title="WhatsApp">
              ${IC.whatsapp}
            </a>` : ''}
        </div>`
      ).join('') +
    `</div>`;
  }

  /* ── Quotes (Devis) tab — mirrors kote_quotes ── */
  function _quotesHTML() {
    /* JSON mode fallback */
    const list = _quotes.length ? _quotes
      : (window._jsonQuotes || []);

    if (!list.length) return `
      <div class="dash-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
          style="width:32px;height:32px;opacity:.25">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <div>Aucun devis enregistré</div>
        <div style="font-size:.65rem;color:var(--t3)">Les devis générés via l'app apparaîtront ici</div>
      </div>`;

    return list.map(q => {
      const p     = q.payload || {};
      const items = Array.isArray(p.items) ? p.items
                  : Array.isArray(q.items) ? q.items : [];
      const d = q.created_at
        ? new Date(q.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})
        : '—';
      const t = q.created_at
        ? new Date(q.created_at).toLocaleTimeString('fr-MA',{hour:'2-digit',minute:'2-digit'})
        : '';
      const ttc  = q.total_ttc || Math.round((q.total_ht||0)*1.20*100)/100;
      const st   = { devis:'Devis', facture:'Facture', avoir:'Avoir' };
      const stColor = q.status==='facture' ? 'var(--bl)' : 'var(--t3)';

      const itemsChips = items.slice(0,3).map(i =>
        `<span class="dash-item-chip">${fmtN(i.quantity)}× ${i.prodName}</span>`
      ).join('') + (items.length>3
        ? `<span class="dash-item-chip dash-item-more">+${items.length-3}</span>` : '');

      const itemsDetail = items.map(i => `
        <div class="dash-detail-row">
          <div>
            <div class="dash-detail-name">${i.prodName}</div>
            ${i.specs ? `<div class="dash-detail-spec">${i.specs}</div>` : ''}
            ${i.notes ? `<div class="dash-detail-note">"${i.notes}"</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.67rem;font-weight:700;color:var(--t1)">${fmt(i.baseTotal)} DH</div>
            <div style="font-size:.6rem;color:var(--t3)">${fmtN(i.quantity)} × ${fmt(i.perUnit)}</div>
          </div>
        </div>`).join('');

      const clientLine = q.client_nom
        ? `<div class="dash-ord-client">${q.client_nom}${q.client_ice?' · ICE '+q.client_ice:''}</div>`
        : '';

      return `
        <div class="dash-ord-card" id="dqt-${q.id}">
          <div class="dash-ord-hdr" onclick="document.getElementById('dqt-${q.id}').classList.toggle('open')">
            <div class="dash-ord-hdr-l">
              <div class="dash-ord-ref">
                ${q.ref}
                <span class="dash-st-badge" style="color:${stColor};background:var(--s2);border-color:var(--bd)">
                  ${st[q.status]||q.status||'devis'}
                </span>
              </div>
              ${clientLine}
              <div class="dash-ord-chips">${itemsChips}</div>
            </div>
            <div class="dash-ord-hdr-r">
              <div class="dash-ord-total">${fmt(q.total_ht)} DH HT</div>
              <div class="dash-ord-ttc">${fmt(ttc)} DH TTC</div>
              <div class="dash-ord-date">${d} · ${t}</div>
            </div>
            <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div class="dash-ord-body">
            <div class="dash-section-lbl">Produits</div>
            <div class="dash-detail-items">${itemsDetail}</div>
            <div class="dash-totals-row" style="margin-top:6px">
              <span style="color:var(--t2)">Total HT</span>
              <strong>${fmt(q.total_ht)} DH</strong>
            </div>
            <div class="dash-totals-row dash-totals-ttc">
              <span>Total TTC</span>
              <strong style="color:var(--bl)">${fmt(ttc)} DH</strong>
            </div>
            <div class="dash-actions">
              <div></div>
              <div class="dash-action-btns">
                <button class="dash-act-btn dash-act-pdf"
                  onclick="DASHBOARD.openQuoteInvoice('${q.id}')">
                  ${IC.printer} Aperçu PDF
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Load external script once ── */
  function _loadScript(src, globalCheck) {
    return new Promise((res, rej) => {
      if (globalCheck && window[globalCheck]) { res(); return; }
      if (document.querySelector(`script[src="${src}"]`)) {
        // Already injected — wait for global to appear
        let tries = 0;
        const poll = setInterval(() => {
          if (!globalCheck || window[globalCheck]) { clearInterval(poll); res(); }
          else if (++tries > 40) { clearInterval(poll); rej(new Error('Timeout: '+src)); }
        }, 100);
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => res();
      s.onerror = () => rej(new Error('Failed: '+src));
      document.head.appendChild(s);
    });
  }

  /* ── A5 Package Label Generator ── */
  function printLabel(id) {
    const ord    = _orders.find(o => o.id === id);
    if (!ord) return;
    const p      = ord.payload || {};
    const items  = p.items || [];
    const client = p.client || {};
    const ttc    = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const delAmt = p.totals?.del || 0;
    const d      = ord.created_at
      ? new Date(ord.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})
      : new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'});
    const shopTel   = DB?.contact?.whatsapp || DB?.contact?.tel || '+212 6 44 50 20 90';
    const shopEmail = DB?.contact?.email || 'contact@kdigital.ma';
    const shopAddr  = DB?.contact?.adresse || '144, Bd de la Gironde — Casablanca';

    // QR = tracking URL (short = small QR version = prints clearly at small size)
    const qrData = location.origin + location.pathname.replace(/[^/]*$/, '') + 'tracking.html?ref=' + encodeURIComponent(ord.ref);

    document.getElementById('labelModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'labelModal';

    // A6 landscape: 148x105mm → 559x397px @ 96dpi
    modal.innerHTML = `<style>
#labelModal{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.82);
  backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem}
#lbl-box{background:#f1f5f9;border-radius:12px;box-shadow:0 24px 72px rgba(0,0,0,.45);
  display:flex;flex-direction:column;overflow:hidden;max-height:96vh;width:600px}
#lbl-tb{display:flex;align-items:center;justify-content:space-between;padding:.55rem .85rem;
  background:#fff;border-bottom:1px solid #e4e9f0;flex-shrink:0;gap:.5rem}
#lbl-tb-l{font-size:.7rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:6px}
#lbl-tb-r{display:flex;gap:.35rem}
.l-btn{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:6px;
  border:1.5px solid #e4e9f0;background:#fff;font-family:inherit;font-size:.62rem;
  font-weight:700;cursor:pointer;color:#5a6a7e;transition:all .14s}
.l-btn:hover{border-color:#0f172a;color:#0f172a}
.l-btn.p{background:#0f172a;color:#fff;border-color:#0f172a}
.l-btn.p:hover{background:#1e293b}
#lbl-scroll{overflow-y:auto;padding:.85rem;background:#dde1e7}

/* A6 landscape: 559x397 screen / 148x105mm print */
#lbl-a6{
  width:559px;height:397px;
  background:#fff;margin:0 auto;
  font-family:'Poppins',sans-serif;
  display:grid;
  grid-template-columns:190px 1fr;
  grid-template-rows:auto 1fr auto;
  border:1.5px solid #0f172a;
  overflow:hidden;
  color:#0f172a;
}

/* TOP BAR — spans full width */
.la-top{
  grid-column:1/-1;
  display:flex;align-items:center;
  border-bottom:2px solid #0f172a;
  height:54px;
}
.la-logo-cell{
  width:190px;flex-shrink:0;
  padding:0 16px;
  display:flex;align-items:center;
  border-right:1.5px solid #0f172a;
  height:100%;
}
.la-logo-svg{height:22px;width:auto;display:block}
.la-ref-cell{
  flex:1;padding:0 16px;
  display:flex;align-items:center;justify-content:space-between;gap:12px;
}
.la-ref-val{
  font-size:22px;font-weight:900;
  font-family:'Courier New',monospace;
  letter-spacing:.07em;line-height:1;color:#0f172a;
}
.la-ref-meta{
  display:flex;flex-direction:column;align-items:flex-end;gap:2px;
  flex-shrink:0;
}
.la-date{font-size:8px;color:#64748b;font-weight:500}
.la-mode{display:flex;align-items:center;gap:4px;font-size:8px;font-weight:700;color:#0f172a}
.la-mode svg{width:11px;height:11px;flex-shrink:0}

/* LEFT COLUMN — addresses */
.la-addr-col{
  grid-column:1;grid-row:2;
  border-right:1.5px solid #0f172a;
  display:flex;flex-direction:column;
}
.la-addr-block{
  flex:1;padding:10px 14px;
  display:flex;flex-direction:column;gap:3px;
}
.la-addr-block:first-child{border-bottom:1.5px solid #0f172a;background:#fafafa}
.la-addr-eyebrow{
  font-size:6.5px;font-weight:800;text-transform:uppercase;
  letter-spacing:1.1px;color:#94a3b8;margin-bottom:5px;
}
.la-addr-name{font-size:11.5px;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:2px}
.la-addr-line{font-size:9px;color:#475569;line-height:1.5;font-weight:400}
.la-addr-tel{font-size:10px;font-weight:700;color:#0f172a;margin-top:2px}

/* RIGHT COLUMN — 3 sub-zones: QR | totals | policy */
.la-right{
  grid-column:2;grid-row:2;
  display:grid;
  grid-template-columns:150px 1fr;
  grid-template-rows:1fr;
}
.la-qr-zone{
  border-right:1.5px solid #0f172a;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;
  padding:10px;gap:5px;
}
#lbl-qr-el{display:flex;align-items:center;justify-content:center;overflow:hidden;width:110px;height:110px}
#lbl-qr-el canvas,#lbl-qr-el img,#lbl-qr-el table{display:block!important;max-width:110px!important;max-height:110px!important;width:110px!important;height:110px!important;image-rendering:pixelated}
.la-qr-cap{font-size:6px;color:#94a3b8;text-transform:uppercase;letter-spacing:.7px;text-align:center;font-weight:600}
.la-info-zone{
  padding:10px 12px;
  display:flex;flex-direction:column;justify-content:space-between;
  gap:8px;
}
.la-sec{font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;
  margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #e2e8f0}
.la-totals-box{display:flex;flex-direction:column;gap:3px}
.la-tr{display:flex;justify-content:space-between;font-size:9.5px;color:#475569;font-weight:400;padding:1px 0}
.la-tr.ttc{font-size:13px;font-weight:900;color:#0f172a;border-top:2px solid #0f172a;margin-top:4px;padding-top:5px}
.la-policy{border:1px solid #cbd5e1;border-radius:3px;padding:6px 8px;margin-top:auto}
.la-policy-t{font-size:7px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px}
.la-policy-b{font-size:7px;color:#475569;line-height:1.5;font-weight:400}

/* FOOTER — full width barcode */
.la-foot{
  grid-column:1/-1;grid-row:3;
  border-top:2px solid #0f172a;
  display:flex;align-items:center;
  padding:6px 16px;gap:14px;
  height:52px;background:#fff;
}
.la-foot-brand{font-size:8.5px;font-weight:800;color:#0f172a;white-space:nowrap;letter-spacing:.3px;flex-shrink:0}
.la-foot-bc{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}
#lbl-barcode-svg{display:block;max-width:100%}
.la-foot-hint{font-size:6px;color:#94a3b8;text-transform:uppercase;letter-spacing:.7px;margin-top:2px;white-space:nowrap}
.la-foot-ci{font-size:7.5px;color:#475569;text-align:right;white-space:nowrap;line-height:1.55;flex-shrink:0}

@media print{
  body>*:not(#labelModal){display:none!important}
  #labelModal{position:static;background:none!important;padding:0;backdrop-filter:none}
  #lbl-box{border-radius:0;box-shadow:none;max-height:none;width:100%;background:none}
  #lbl-tb{display:none!important}
  #lbl-scroll{padding:0;background:white;overflow:visible}
  #lbl-a6{width:148mm;height:105mm;border:none}
  @page{size:A6 landscape;margin:0}
}
</style>
<div id="lbl-box">
  <div id="lbl-tb">
    <div id="lbl-tb-l">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
      Bon d\u2019exp\xe9dition \xb7 ${ord.ref}
    </div>
    <div id="lbl-tb-r">
      <button class="l-btn p" onclick="window.print()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimer A6 Paysage
      </button>
      <button class="l-btn" onclick="document.getElementById('labelModal').remove()">\u2715 Fermer</button>
    </div>
  </div>
  <div id="lbl-scroll">
    <div id="lbl-a6">

      <!-- TOP BAR -->
      <div class="la-top">
        <div class="la-logo-cell">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.63 123.79" class="la-logo-svg">
            <path fill="#696969" d="M191,123.79a62.31,62.31,0,0,0,31.07-8A59.36,59.36,0,0,0,244.5,93.65a62,62,0,0,0,8.26-31.84A62,62,0,0,0,244.5,30a58.88,58.88,0,0,0-22.39-22,65.43,65.43,0,0,0-62.41,0,59.26,59.26,0,0,0-22.56,22,61.44,61.44,0,0,0-8.34,31.84,61.44,61.44,0,0,0,8.34,31.84,59.93,59.93,0,0,0,22.56,22.14A62.66,62.66,0,0,0,191,123.79Zm0-35.25q-11.41,0-17.54-7.23t-6.13-19.5q0-12.44,6.13-19.67T191,34.91q11.24,0,17.37,7.23t6.13,19.67q0,12.25-6.13,19.5T191,88.54ZM259.57,2V32h31.67V122.6H329V32h32V2ZM451.63,32.18V2H371.26V122.6h80.37V92.46H409.07v-17h37.45V47H409.07V32.18Z"/>
            <path fill="#2563EB" d="M103.06,41.51a18.57,18.57,0,0,0,18.57-18.57V1M103.06,122.6A18.57,18.57,0,0,0,121.63,104v-22M40.54,41.51H81.09v22.3A18.24,18.24,0,0,1,62.85,82.05H40.54V122.6H0V1H40.54ZM121.63,1H81.09V41.51h22M121.63,82.05H81.09V122.6h22"/>
          </svg>
        </div>
        <div class="la-ref-cell">
          <div class="la-ref-val">${ord.ref}</div>
          <div class="la-ref-meta">
            <div class="la-date">${d}</div>
            ${delAmt > 0
              ? `<div class="la-mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</div>`
              : `<div class="la-mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Retrait</div>`
            }
          </div>
        </div>
      </div>

      <!-- LEFT: ADDRESSES -->
      <div class="la-addr-col">
        <div class="la-addr-block">
          <div class="la-addr-eyebrow">Exp\xe9diteur</div>
          <div class="la-addr-name">Kote Imprimerie</div>
          <div class="la-addr-line">${shopAddr}</div>
          ${shopTel ? `<div class="la-addr-tel">${shopTel}</div>` : ''}
          <div class="la-addr-line">${shopEmail}</div>
        </div>
        <div class="la-addr-block">
          <div class="la-addr-eyebrow">Destinataire</div>
          <div class="la-addr-name">${ord.client_nom||client.nom||'—'}</div>
          ${(ord.client_tel||client.tel)?`<div class="la-addr-tel">${ord.client_tel||client.tel}</div>`:''}
          ${(ord.client_adresse||client.adresse)?`<div class="la-addr-line">${ord.client_adresse||client.adresse||''}${(ord.client_ville||client.ville)?', '+(ord.client_ville||client.ville):''}</div>`:''}
        </div>
      </div>

      <!-- RIGHT: QR + AMOUNTS -->
      <div class="la-right">
        <div class="la-qr-zone">
          <div id="lbl-qr-el"></div>
          <div class="la-qr-cap">Scanner \u2192 d\xe9tail colis</div>
        </div>
        <div class="la-info-zone">
          <div>
            <div class="la-sec">Montant</div>
            <div class="la-totals-box">
              <div class="la-tr"><span>Sous-total HT</span><span>${fmt(ord.total_ht)} DH</span></div>
              ${delAmt>0?`<div class="la-tr"><span>Livraison</span><span>+${fmt(delAmt)} DH</span></div>`:''}
              <div class="la-tr"><span>TVA 20%</span><span>${fmt(ttc-(ord.total_ht||0))} DH</span></div>
              <div class="la-tr ttc"><span>Total TTC</span><span>${fmt(ttc)} DH</span></div>
            </div>
          </div>
          <div class="la-policy">
            <div class="la-policy-t">Retour</div>
            <div class="la-policy-b">Aucun retour sur commande personnalis\xe9e. D\xe9faut d\u2019impression : 48h \u2014 ${shopEmail}</div>
          </div>
        </div>
      </div>

      <!-- FOOTER: barcode -->
      <div class="la-foot">
        <div class="la-foot-brand">KOTE</div>
        <div class="la-foot-bc">
          <svg id="lbl-barcode-svg"></svg>
          <div class="la-foot-hint">Gestion colis \xb7 Kote Imprimerie</div>
        </div>
        <div class="la-foot-ci">${shopAddr}<br>${shopEmail}</div>
      </div>

    </div>
  </div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', 'QRCode'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js', 'JsBarcode'),
    ]).then(() => {
      const qrEl = document.getElementById('lbl-qr-el');
      if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: qrData, width: 100, height: 100,
          colorDark: '#0f172a', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
      }
      const bcEl = document.getElementById('lbl-barcode-svg');
      if (bcEl && typeof JsBarcode !== 'undefined') {
        JsBarcode(bcEl, ord.ref, {
          format: 'CODE128', width: 1.1, height: 32,
          displayValue: true, fontSize: 10, font: 'Courier New',
          textMargin: 2, margin: 0, lineColor: '#0f172a', background: '#ffffff',
        });
      }
    }).catch(err => {
      console.warn('[Label] CDN load failed:', err);
      const qrEl = document.getElementById('lbl-qr-el');
      if (qrEl) qrEl.innerHTML = '<div style="width:110px;height:110px;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:8px;color:#94a3b8">QR offline</div>';
    });
  }

  function openQuoteInvoice(id) {
    const q = _quotes.find(x => x.id === id)
           || (window._jsonQuotes||[]).find(x => x.id === id);
    if (!q) return;
    const p = q.payload || {};
    if (typeof INVOICE !== 'undefined') {
      INVOICE.open(p, { dbId: q.id, docType: q.status || 'devis' });
    }
  }

  return { load, refresh, switchTab, toggleOrder, setStatus, openInvoice, notifyWA, notifyEmail, filterByStatus, printLabel, search, _clearSearch, setKpiPeriod, setKpiRange, openQuoteInvoice };
})();
