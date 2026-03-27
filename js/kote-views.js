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
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey':        window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ── Supabase PATCH helper ── */
  async function _patch(table, id, body) {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
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
                <button class="dash-act-btn" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff" onclick="DASHBOARD.showDF('${o.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  DF
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
      console.warn('[Label] CDN load failed — using fallback:', err);
      // Barcode fallback: pure JS CODE128B
      const bcEl = document.getElementById('lbl-barcode-svg');
      if (bcEl) _code128B(ord.ref, bcEl, { height: 32, barWidth: 1.1, showText: true });
      // QR fallback: plain text ref in a box
      const qrEl = document.getElementById('lbl-qr-el');
      if (qrEl) qrEl.innerHTML = `<div style="width:100px;height:100px;border:1.5px solid #0f172a;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#0f172a;text-align:center;padding:4px;word-break:break-all;font-family:monospace">${ord.ref}</div>`;
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

  /* ── Dossier de Fabrication modal ── */
  function showDF(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const p      = ord.payload || {};
    const items  = p.items || [];
    const ttc    = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const tva    = Math.round((ttc - (ord.total_ht||0))*100)/100;
    const delAmt = p.totals?.del    || 0;
    const surAmt = p.totals?.surAmt || 0;
    const sub    = p.totals?.sub    || (ord.total_ht||0) - surAmt - delAmt;
    const d      = ord.created_at
      ? new Date(ord.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'})
      : '—';
    const ta         = p.ta || {};
    const totals     = { sub, surAmt, del: delAmt, grand: ord.total_ht||0, tva, ttc };
    const cityLabel  = p.client?.ville || ord.client_ville || '';

    const dfText = (typeof buildOrderDF === 'function')
      ? buildOrderDF(items, totals, ta.label, ta.days, ord.ref, d, cityLabel)
      : items.map(i => `• ${i.quantity}× ${i.prodName}${i.specs?' — '+i.specs:''}`).join('\n');

    const dfHtml = (typeof buildOrderDFHtml === 'function')
      ? buildOrderDFHtml(items)
      : items.map(i => `<li><strong>${i.quantity}×</strong> ${i.prodName}</li>`).join('');

    document.getElementById('dfModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'dfModal';
    const escapedText = dfText.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$/g,'\\$');
    modal.innerHTML = `<style>
#dfModal{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.75);
  backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem}
#df-box{background:var(--sf,#fff);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);
  display:flex;flex-direction:column;overflow:hidden;max-height:90vh;width:100%;max-width:540px}
#df-tb{display:flex;align-items:center;justify-content:space-between;
  padding:.6rem .9rem;background:var(--s2,#f8fafc);border-bottom:1px solid var(--bd,#e4e9f0);
  flex-shrink:0;gap:.5rem}
#df-tb-l{font-size:.72rem;font-weight:700;color:var(--t1,#0f172a);
  display:flex;align-items:center;gap:6px}
.df-m-btn{display:flex;align-items:center;gap:4px;padding:5px 11px;border-radius:6px;
  border:1.5px solid var(--bd,#e4e9f0);background:var(--sf,#fff);font-family:inherit;
  font-size:.62rem;font-weight:700;cursor:pointer;color:var(--t2,#5a6a7e);transition:all .14s}
.df-m-btn:hover{border-color:var(--t1,#0f172a);color:var(--t1,#0f172a)}
.df-m-btn.p{background:#7c3aed;color:#fff;border-color:#7c3aed}
.df-m-btn.p:hover{background:#6d28d9}
#df-body{overflow-y:auto;padding:1rem}
#df-body ul{list-style:none;margin:0;padding:0}
.df-meta-row{display:flex;justify-content:space-between;font-size:.65rem;
  color:var(--t2,#5a6a7e);padding:.2rem 0;border-bottom:1px solid var(--bd,#e4e9f0);margin-bottom:.6rem}
.df-totals{margin-top:.75rem;padding:.6rem .75rem;background:var(--s2,#f8fafc);
  border-radius:7px;border:1px solid var(--bd,#e4e9f0)}
.df-tot-row{display:flex;justify-content:space-between;font-size:.68rem;
  color:var(--t2,#5a6a7e);padding:.18rem 0}
.df-tot-ttc{font-size:.76rem;font-weight:700;color:var(--t1,#0f172a);
  border-top:1.5px solid var(--bd,#e4e9f0);margin-top:.25rem;padding-top:.3rem}
@media print{body>*:not(#dfModal){display:none!important}
  #dfModal{position:static;background:none;padding:0}
  #df-box{box-shadow:none;max-height:none}
  #df-tb{display:none!important}}
</style>
<div id="df-box">
  <div id="df-tb">
    <div id="df-tb-l">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      DF · ${ord.ref}
    </div>
    <div style="display:flex;gap:.3rem">
      <button class="df-m-btn p" id="dfCopyBtn" onclick="(function(btn){
        var txt = document.getElementById('dfRawText').value;
        navigator.clipboard.writeText(txt).then(function(){
          btn.textContent='✓ Copié'; setTimeout(function(){btn.textContent='Copier';},2000);
        }).catch(function(){
          var ta=document.createElement('textarea');ta.value=txt;
          ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);
          ta.select();document.execCommand('copy');document.body.removeChild(ta);
          btn.textContent='✓ Copié'; setTimeout(function(){btn.textContent='Copier';},2000);
        });
      })(this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copier
      </button>
      <button class="df-m-btn" onclick="window.print()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Imprimer
      </button>
      <button class="df-m-btn" onclick="document.getElementById('dfModal').remove()">✕</button>
    </div>
  </div>
  <textarea id="dfRawText" style="display:none">${dfText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <div id="df-body">
    <div class="df-meta-row">
      <span><strong>${ord.ref}</strong> · ${d}</span>
      <span>${ta.label||''}${ta.days?' ('+ta.days+')':''}</span>
    </div>
    ${ord.client_nom ? `<div style="font-size:.68rem;color:var(--t2,#5a6a7e);margin-bottom:.65rem;padding:.4rem .5rem;background:var(--s2,#f8fafc);border-radius:6px;border:1px solid var(--bd,#e4e9f0)">
      <strong>${ord.client_nom}</strong>${ord.client_tel?' · '+ord.client_tel:''}${ord.client_email?' · '+ord.client_email:''}
      ${(cityLabel||ord.client_adresse)?'<br><span style="color:var(--t3,#9ca3af)">'+(cityLabel||'')+(ord.client_adresse?', '+ord.client_adresse:'')+'</span>':''}
    </div>` : ''}
    <ul>${dfHtml}</ul>
    <div class="df-totals">
      ${surAmt>0?`<div class="df-tot-row"><span>Délai express</span><span>+${fmt(surAmt)} DH</span></div>`:''}
      ${delAmt>0?`<div class="df-tot-row"><span>Livraison${cityLabel?' ('+cityLabel+')':''}</span><span>+${fmt(delAmt)} DH</span></div>`:''}
      <div class="df-tot-row"><span>Total HT</span><span>${fmt(ord.total_ht||0)} DH</span></div>
      <div class="df-tot-row"><span>TVA 20%</span><span>${fmt(tva)} DH</span></div>
      <div class="df-tot-row df-tot-ttc"><span>Total TTC</span><span>${fmt(ttc)} DH</span></div>
    </div>
  </div>
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  return { load, refresh, switchTab, toggleOrder, setStatus, openInvoice, notifyWA, notifyEmail, filterByStatus, printLabel, showDF, search, _clearSearch, setKpiPeriod, setKpiRange, openQuoteInvoice };
})();



/* ══════════════════════════════════════════════════════════════
   KOTE INVOICE PREVIEW  v6.0
   ══════════════════════════════════════════════════════════════
   window.INVOICE.open(quoteData)
   window.INVOICE.setImage(key, dataURL)
   ══════════════════════════════════════════════════════════════ */
window.INVOICE = (() => {
  'use strict';

  /* ── Layout constants ── */
  const DOC_W = 794, DOC_H = 1123;
  const CT    = 128, CS = 48;   // content top / side offsets

  const CDN_H2C  = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const CDN_JPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  /* ══════════════════════════════════════════════════════════
     Images — stored as base64 in localStorage
  ══════════════════════════════════════════════════════════ */
  const LS = { lh:'kote_img_lh', stamp:'kote_img_stamp', sig:'kote_img_sig' };
  const _b64 = { lh:null, stamp:null, sig:null };

  function _loadB64() {
    for (const [k,lk] of Object.entries(LS)) _b64[k] = localStorage.getItem(lk) || null;
  }
  function setImage(key, dataURL) {
    if (!LS[key]) return;
    dataURL ? localStorage.setItem(LS[key], dataURL) : localStorage.removeItem(LS[key]);
    _b64[key] = dataURL || null;
    if (key === 'lh') { const i = document.querySelector('#inv-lh img'); if (i) i.src = dataURL || 'images/letterhead.png'; }
  }
  function _src(k) { return _b64[k] || (k==='lh'?'images/letterhead.png':k==='stamp'?'images/stamp.png':'images/signature.png'); }

  /* Load any image (relative URL or data-URL) to base64 via an <img> element.
     Using <img> instead of fetch avoids CORS/mode issues on mobile browsers.  */
  async function _imgToB64(src) {
    if (!src) return null;
    /* data-URL already — return as-is */
    if (src.startsWith('data:')) return src;
    return new Promise(res => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0);
          res(cv.toDataURL('image/png'));
        } catch(e) { res(null); }
      };
      img.onerror = () => {
        /* Second attempt without crossOrigin (works for same-origin) */
        const img2 = new Image();
        img2.onload = () => {
          try {
            const cv = document.createElement('canvas');
            cv.width = img2.naturalWidth || img2.width;
            cv.height = img2.naturalHeight || img2.height;
            document.createElement('canvas').getContext('2d');
            const ctx2 = cv.getContext('2d');
            ctx2.drawImage(img2, 0, 0);
            res(cv.toDataURL('image/png'));
          } catch(e) { res(null); }
        };
        img2.onerror = () => res(null);
        img2.src = src + (src.includes('?') ? '&' : '?') + '_t=' + Date.now();
      };
      img.src = src;
    });
  }

  /* ══════════════════════════════════════════════════════════
     State
  ══════════════════════════════════════════════════════════ */
  let _q       = null;
  let _dbId    = null;
  let _cl      = { id:null, nom:'', adresse:'', ice:'', tel:'', email:'' };
  let _type    = 'devis';
  let _layers  = { lh:true, stamp:false, sig:false };
  let _dovs    = { stamp:null, sig:null };
  let _blob    = null;
  let _fname   = '';
  let _srchTO  = null;
  let _mobView = 'form';
  const _COND_DEFAULT = 'Un acompte de 50% est exigible à la commande. Le solde de 50% est dû à la livraison.';
  let _condOn   = true;
  let _condText = _COND_DEFAULT;
  let _validDate = '';
  let _tvaOn    = false;
  let _tvaRate  = 20;

  /* ══════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════ */
  const CSS = `
/* ── Overlay ── */
#inv-ovl{display:none;position:fixed;inset:0;z-index:900;background:rgba(8,12,24,.84);
  backdrop-filter:blur(6px)}
#inv-ovl.on{display:flex}
#inv-panel{display:flex;width:100%;height:100%;font-family:'Poppins',Arial,sans-serif;
  overflow:hidden}

/* ════ SIDEBAR ════ */
#inv-sb{width:276px;min-width:250px;flex-shrink:0;background:#fff;
  display:flex;flex-direction:column;border-right:1px solid #eaecf0;overflow:hidden}

/* header */
#inv-hd{display:flex;align-items:center;gap:7px;padding:11px 14px 11px;
  border-bottom:1px solid #f0f2f5;background:#fafbfc;flex-shrink:0}
#inv-hd-ico{width:26px;height:26px;background:#eff6ff;border-radius:6px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0}
#inv-hd-ico svg{width:13px;height:13px;color:#2563EB}
#inv-hd-title{flex:1;font-size:12px;font-weight:700;color:#0f172a;line-height:1.2}
#inv-hd-sub{font-size:9px;color:#94a3b8;margin-top:1px}
.inv-x{background:none;border:none;cursor:pointer;color:#cbd5e1;padding:4px;
  border-radius:4px;display:flex;align-items:center;justify-content:center;
  line-height:0;transition:all .14s}
.inv-x:hover{background:#f1f5f9;color:#475569}
.inv-x svg{width:13px;height:13px}

/* scroll body */
#inv-bd{flex:1;overflow-y:auto;display:flex;flex-direction:column}
#inv-bd::-webkit-scrollbar{width:3px}
#inv-bd::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:2px}
.isec{padding:13px 14px;border-bottom:1px solid #f4f6f8}
.isec-ttl{font-size:8px;font-weight:700;color:#94a3b8;text-transform:uppercase;
  letter-spacing:.9px;margin-bottom:9px}

/* type pills */
.itype{display:flex;background:#f1f5f9;border-radius:7px;padding:3px;gap:0}
.iimport-btn{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid #e2e8f0;
  border-radius:5px;background:#f8fafc;font-family:inherit;font-size:9.5px;font-weight:700;
  color:#64748b;cursor:pointer;transition:all .15s;white-space:nowrap}
.iimport-btn:hover,.iimport-btn.on{background:#eff6ff;border-color:#bfdbfe;color:#2563EB}
.iimport-panel{display:none;margin-top:8px;border:1px solid #e2e8f0;border-radius:8px;
  overflow:hidden;background:#fff}
.iimport-panel.on{display:block}
.iimport-search{display:flex;align-items:center;gap:6px;padding:7px 10px;
  border-bottom:1px solid #f0f4f9;background:#fafbfc}
.iimport-search input{flex:1;border:none;background:transparent;font-family:inherit;
  font-size:11.5px;color:#0f172a;outline:none}
.iimport-search input::placeholder{color:#cbd5e1}
.iimport-list{max-height:180px;overflow-y:auto}
.iimport-row{padding:7px 11px;cursor:pointer;border-bottom:1px solid #f4f6f8;transition:background .1s}
.iimport-row:last-child{border-bottom:none}
.iimport-row:hover{background:#f0f7ff}
.iimport-row-ref{font-size:11px;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:5px}
.iimport-badge{font-size:8.5px;font-weight:700;padding:1px 6px;border-radius:10px;
  background:#eff6ff;color:#2563EB;text-transform:capitalize}
.iimport-row-sub{font-size:9.5px;color:#94a3b8;margin-top:1px}
.iimport-msg{padding:10px 11px;font-size:11px;color:#94a3b8;text-align:center}
.itbtn{flex:1;padding:5px;border:none;border-radius:5px;font-family:inherit;font-size:11px;
  font-weight:600;color:#64748b;background:transparent;cursor:pointer;transition:all .15s}
.itbtn.on{background:#fff;color:#2563EB;box-shadow:0 1px 4px rgba(0,0,0,.1)}

/* ════ CLIENT BLOCK ════ */
/* search row */
.icl-search{display:flex;align-items:center;gap:6px;background:#f8fafc;
  border:1px solid #e2e8f0;border-radius:7px;padding:7px 10px;
  transition:border-color .15s,box-shadow .15s;position:relative}
.icl-search:focus-within{border-color:#2563EB;box-shadow:0 0 0 2px #dbeafe;background:#fff}
.icl-search svg{width:12px;height:12px;color:#94a3b8;flex-shrink:0}
.icl-search input{flex:1;border:none;background:transparent;font-family:inherit;
  font-size:12px;color:#0f172a;outline:none;min-width:0}
.icl-search input::placeholder{color:#cbd5e1}
.icl-clr{background:none;border:none;cursor:pointer;color:#94a3b8;display:flex;
  line-height:0;padding:0;transition:color .12s}
.icl-clr:hover{color:#475569}
.icl-clr svg{width:12px;height:12px}
/* dropdown */
.icl-drop{position:absolute;top:calc(100% - 1px);left:0;right:0;background:#fff;
  border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;
  box-shadow:0 8px 24px rgba(0,0,0,.1),0 2px 6px rgba(0,0,0,.06);
  z-index:60;display:none;overflow:hidden}
.icl-drop.on{display:block}
.icl-search.drop-open{border-radius:7px 7px 0 0;border-color:#2563EB;box-shadow:0 0 0 2px #dbeafe;background:#fff}
.icl-dr-row{padding:8px 12px;cursor:pointer;border-bottom:1px solid #f4f6f8;
  transition:background .1s}
.icl-dr-row:last-child{border-bottom:none}
.icl-dr-row:hover{background:#f0f7ff}
.icl-dr-name{font-size:11.5px;font-weight:600;color:#0f172a}
.icl-dr-sub{font-size:9.5px;color:#94a3b8;margin-top:1px}
.icl-dr-msg{padding:10px 12px;font-size:11px;color:#94a3b8;text-align:center}
/* form */
.icl-form{display:flex;flex-direction:column;gap:5px;margin-top:7px}
.ifl{display:flex;flex-direction:column;gap:2px}
.ifl label{font-size:8px;font-weight:700;color:#94a3b8;text-transform:uppercase;
  letter-spacing:.5px}
.ifl input,.ifl textarea{padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0;
  border-radius:6px;font-family:inherit;font-size:11.5px;color:#0f172a;
  outline:none;transition:border-color .15s,background .15s;width:100%;box-sizing:border-box}
.ifl textarea{height:40px;resize:none;line-height:1.4}
.ifl input:focus,.ifl textarea:focus{border-color:#2563EB;background:#fff;
  box-shadow:0 0 0 2px #dbeafe}
.ifl-row{display:flex;gap:5px}
.ifl-row .ifl{flex:1;min-width:0}
/* save-to-db button — hidden until name filled */
.icl-save{display:none;width:100%;margin-top:6px;padding:7px;border-radius:7px;
  border:1.5px dashed #bfdbfe;background:#eff6ff;
  font-family:inherit;font-size:11px;font-weight:700;color:#2563EB;
  cursor:pointer;align-items:center;justify-content:center;gap:5px;
  transition:all .15s}
.icl-save.on{display:flex}
.icl-save:hover{background:#dbeafe;border-color:#93c5fd}
.icl-save svg{width:11px;height:11px}
/* selected chip */
.icl-chip{display:none;align-items:center;gap:7px;background:#f0fdf4;
  border:1px solid #bbf7d0;border-radius:7px;padding:7px 10px;
  margin-bottom:7px}
.icl-chip.on{display:flex}
.icl-chip-info{flex:1;min-width:0}
.icl-chip-name{font-size:11.5px;font-weight:700;color:#14532d;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.icl-chip-sub{font-size:9.5px;color:#16a34a;margin-top:1px}
.icl-chip-x{background:none;border:none;cursor:pointer;color:#86efac;
  display:flex;line-height:0;padding:2px;flex-shrink:0}
.icl-chip-x:hover{color:#14532d}
.icl-chip-x svg{width:13px;height:13px}

/* ════ LAYER PILLS ════ */
.ilpills{display:flex;gap:14px}
.ilpill{flex:none;padding:4px 0;border:none;background:transparent;
  font-family:inherit;font-size:11px;font-weight:600;
  color:#cbd5e1;cursor:pointer;display:flex;align-items:center;
  gap:4px;transition:color .18s;line-height:1}
.ilpill svg{width:11px;height:11px;flex-shrink:0;transition:color .18s}
.ilpill:hover:not(.on){color:#94a3b8}
.ilpill.on{color:#16a34a}
.ilpill.on svg{color:#16a34a}

/* ════ FOOTER ════ */
#inv-ft{padding:10px 14px;border-top:1px solid #f0f2f5;background:#fafbfc;
  flex-shrink:0;display:flex;flex-direction:column;gap:6px}
.ibtn{width:100%;padding:9px;border-radius:8px;font-family:inherit;font-size:12px;
  font-weight:700;cursor:pointer;border:none;display:flex;align-items:center;
  justify-content:center;gap:6px;transition:all .15s}
.ibtn svg{width:13px;height:13px;flex-shrink:0}
.ibtn:disabled{opacity:.45;cursor:not-allowed}
.ibtn-gen{background:#0f172a;color:#fff}
.ibtn-gen:not(:disabled):hover{background:#1e293b}
.ibtn-back{background:transparent;color:#94a3b8;font-size:11px;font-weight:500;padding:5px}
.ibtn-back:hover{color:#334155}
/* share tray */
#inv-tray{display:none;flex-direction:column;gap:5px}
#inv-tray.on{display:flex}
.itray-lbl{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;
  color:#94a3b8;text-align:center}
.itray-row{display:flex;gap:5px}
.itr{flex:1;padding:8px 0;border-radius:7px;font-family:inherit;font-size:10.5px;
  font-weight:700;border:none;cursor:pointer;display:flex;align-items:center;
  justify-content:center;gap:5px;transition:background .15s;text-decoration:none}
.itr svg{width:11px;height:11px;flex-shrink:0}
.itr-wa{background:#16a34a;color:#fff}.itr-wa:hover{background:#15803d}
.itr-ml{background:#d97706;color:#fff}.itr-ml:hover{background:#b45309}
.itr-dl{background:#0f172a;color:#fff}.itr-dl:hover{background:#1e293b}
.itr-sh{background:#6d28d9;color:#fff}.itr-sh:hover{background:#5b21b6}

/* ════ PREVIEW PANE ════ */
#inv-prev{flex:1;overflow:auto;background:#cdd3dc;display:flex;
  align-items:flex-start;justify-content:center;padding:20px 18px}
#inv-prev::-webkit-scrollbar{width:5px}
#inv-prev::-webkit-scrollbar-thumb{background:#9ca3af;border-radius:3px}
#inv-doc-wrap{transform-origin:top center;flex-shrink:0}
#inv-doc{width:${DOC_W}px;height:${DOC_H}px;background:#fff;position:relative;
  overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.08)}

/* A4 layers */
#inv-lh{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .2s}
#inv-lh.on{opacity:1}
#inv-lh img{width:100%;height:100%;object-fit:cover;display:block}
#inv-ct{position:absolute;z-index:1;top:${CT}px;left:${CS}px;right:${CS}px;bottom:0;
  box-sizing:border-box;overflow:hidden;font-family:'Poppins',Arial,sans-serif}

/* doc typography */
.dc-date{text-align:right;font-size:8.5pt;font-weight:600;color:#1a1f2e;margin-bottom:18px}
.dc-top{display:flex;justify-content:space-between;align-items:flex-start;
  margin-bottom:14px;gap:14px}
.dc-ttl{font-size:21pt;font-weight:300;color:#1a1f2e;letter-spacing:-.5px;line-height:1.1}
.dc-ref{font-size:9pt;color:#6b7a8d;margin-top:3px}
.dc-cbox{border:1px solid #d0d8e4;border-radius:6px;padding:9px 12px;
  min-width:180px;max-width:52%}
.dc-cnom{font-size:9.5pt;font-weight:700;color:#1a1f2e;margin-bottom:3px}
.dc-cadr{font-size:7.5pt;color:#5a6a7e;line-height:1.5}
.dc-cice{font-size:7.5pt;color:#5a6a7e;margin-top:3px}
.dc-cice strong{color:#1a1f2e}
.dc-tbl{width:100%;border-collapse:collapse;font-size:9pt}
.dc-tbl th{padding:7px 9px;font-size:8.5pt;font-weight:700;color:#1a1f2e;
  text-align:left;border-bottom:1.5px solid #1a1f2e}
.dc-tbl th.r,.dc-tbl td.r{text-align:right;white-space:nowrap}
.dc-tbl td{padding:8px 9px;border-bottom:1px solid #edf1f7;vertical-align:top}
.dc-tbl tr.er td{background:rgba(247,249,252,0.5)}
.dc-tn{font-weight:700;color:#1a1f2e}
.dc-ts{font-size:7pt;color:#5a6a7e;line-height:1.4;margin-top:2px}
.dc-to{font-size:7pt;color:#9eafc0;font-style:italic;margin-top:1px}
.dc-tbl tfoot td{border-bottom:none}
.tfsep td{border-top:1.5px solid #d0d8e4}
.tfl{text-align:right;color:#5a6a7e;font-size:8.5pt}
.tflb{text-align:right;font-weight:700;font-size:9.5pt;color:#1a1f2e}
.tfv{text-align:right;font-weight:700;white-space:nowrap}
.dc-arr{border-left:3px solid #2563EB;padding:8px 12px;margin:10px 0;
  font-size:8.5pt;color:#1a1f2e;line-height:1.5}
.dc-arr strong{display:block;font-size:9pt;margin-top:2px}
.dc-cond{border:1px solid #d0d8e4;border-radius:5px;padding:9px 12px;margin-top:8px}
.dc-cond-t{font-weight:700;color:#1a1f2e;font-size:8.5pt;margin-bottom:4px}
.dc-cond p{font-size:7.5pt;color:#5a6a7e;line-height:1.5;margin-top:3px}
.dc-cond strong{color:#1a1f2e}

/* draggable */
.inv-dov{position:absolute;z-index:3;cursor:grab;touch-action:none;
  border:1.5px solid transparent;border-radius:4px;user-select:none}
.inv-dov:hover{border-color:rgba(37,99,235,.3)}
.inv-dov.dragging{cursor:grabbing;border-color:#2563EB}
.inv-dov img{display:block;pointer-events:none}
.inv-dov-hint{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);
  font-size:8px;color:#2563EB;white-space:nowrap;font-family:'Poppins',sans-serif;
  opacity:0;transition:opacity .15s;pointer-events:none}
.inv-dov:hover .inv-dov-hint{opacity:1}

/* spinner */
#inv-spin{display:none;position:absolute;inset:0;z-index:10;
  background:rgba(255,255,255,.9);backdrop-filter:blur(2px);
  align-items:center;justify-content:center;flex-direction:column;gap:10px}
#inv-spin.on{display:flex}
.isp{width:24px;height:24px;border:2.5px solid #e2e8f0;border-top-color:#2563EB;
  border-radius:50%;animation:isp-r .6s linear infinite}
@keyframes isp-r{to{transform:rotate(360deg)}}
#inv-spin p{font-size:10.5px;color:#64748b;font-family:'Poppins',sans-serif}

/* extra pages */
.inv-page-extra{width:${DOC_W}px;height:${DOC_H}px;background:#fff;position:relative;
  overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.08);
  margin-top:20px;flex-shrink:0}
.inv-lh-clone{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .2s}
.inv-lh-clone.on{opacity:1}
.inv-lh-clone img{width:100%;height:100%;object-fit:cover;display:block}
.inv-ct-extra{position:absolute;z-index:1;top:${CT}px;left:${CS}px;right:${CS}px;bottom:0;
  box-sizing:border-box;overflow:hidden;font-family:'Poppins',Arial,sans-serif}

/* conditions section */
.icond-toggle{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.icond-pill{padding:3px 9px;border:1.5px solid #e2e8f0;border-radius:20px;
  background:#f8fafc;font-family:inherit;font-size:9.5px;font-weight:700;
  color:#64748b;cursor:pointer;transition:all .15s}
.icond-pill.on{background:#eff6ff;border-color:#bfdbfe;color:#2563EB}
.icond-body{display:flex;flex-direction:column;gap:6px}
.icond-body.off{display:none}
.ifl input[type=date]{padding:5px 8px;background:#f8fafc;border:1px solid #e2e8f0;
  border-radius:6px;font-family:inherit;font-size:11px;color:#0f172a;
  outline:none;width:100%;box-sizing:border-box;transition:border-color .15s}
.ifl input[type=date]:focus{border-color:#2563EB;background:#fff;box-shadow:0 0 0 2px #dbeafe}
.ifl textarea.icond-txt{height:52px;font-size:10.5px;line-height:1.45}

/* ════ MOBILE ════ */
#inv-mob-bar{display:none}

@media(max-width:700px){
  #inv-panel{flex-direction:column;position:relative}

  /* sidebar & preview take full space, toggled by JS */
  #inv-sb{width:100%;height:calc(100% - 52px);min-width:unset;border-right:none;
    border-top:none;position:absolute;top:0;left:0;right:0;
    transition:opacity .2s,visibility .2s}
  #inv-prev{width:100%;height:calc(100% - 52px);position:absolute;top:0;left:0;right:0;
    padding:12px 8px;overflow-y:auto;overflow-x:hidden;
    -webkit-overflow-scrolling:touch;transition:opacity .2s,visibility .2s}

  /* hidden state */
  #inv-sb.mob-hidden,#inv-prev.mob-hidden{opacity:0;visibility:hidden;pointer-events:none}

  /* doc wrap: scale to screen width */
  #inv-doc-wrap{display:block}

  /* sticky bottom bar */
  #inv-mob-bar{display:flex;position:absolute;bottom:0;left:0;right:0;height:52px;
    background:#fff;border-top:1px solid #e2e8f0;z-index:10;
    align-items:center;padding:0 8px;gap:6px}
  .imb-btn{flex:1;height:36px;border-radius:8px;border:1.5px solid #e2e8f0;
    background:#f8fafc;font-family:inherit;font-size:12px;font-weight:600;
    color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;
    gap:6px;transition:all .18s}
  .imb-btn svg{width:13px;height:13px;flex-shrink:0}
  .imb-btn.on{border-color:#2563EB;background:#eff6ff;color:#2563EB}
}
`;

  /* ══════════════════════════════════════════════════════════
     SVG icons
  ══════════════════════════════════════════════════════════ */
  const I = {
    doc:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    x:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    srch:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>`,
    save:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    lh:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="5" rx="1"/><line x1="2" y1="11" x2="22" y2="11" stroke-dasharray="3 2"/><line x1="2" y1="15" x2="16" y2="15" stroke-dasharray="3 2"/></svg>`,
    stamp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 21h12M8 17c0-2.21 1.79-4 4-4s4 1.79 4 4v1H8v-1z"/></svg>`,
    sig:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18c3-6 5-9 7-9s2 3 4 3 4-4.5 7-10.5"/><path d="M3 21h18"/></svg>`,
    wa:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    mail:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
    dl:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="2" x2="12" y2="16"/></svg>`,
    share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    form:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`,
    eye:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };

  /* ══════════════════════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════════════════════ */
  const fmt  = n => (+n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtN = n => (+n||0).toLocaleString('fr-FR').replace(/\u202F/g,'\u00A0');
  const _$   = id => document.getElementById(id);

  function _lettre(n) {
    const u=['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const d=['','','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
    if(!n||n===0) return 'zéro';
    function hw(x){if(x<20)return u[x];const di=Math.floor(x/10),un=x%10;if(di<7)return d[di]+(un?(un===1&&di<8?'-et-un':'-'+u[un]):(di===8?'s':''));if(di===7)return'soixante-'+(un?u[10+un]:'dix');if(di===8)return'quatre-vingt'+(un?'-'+u[un]:'s');return'quatre-vingt-'+u[10+un];}
    function grp(x){const h=Math.floor(x/100),r=x%100;let s='';if(h)s+=(h===1?'cent':u[h]+' cent')+(h>1&&!r?'s':'');if(h&&r)s+=' ';s+=hw(r);return s;}
    const int=Math.floor(n), dec=Math.round((n-int)*100);
    const pts=[];
    if(int>=1000){const m=Math.floor(int/1000);pts.push(m===1?'mille':grp(m)+' mille');}
    if(int%1000) pts.push(grp(int%1000));
    let r=pts.join(' ').trim();
    r=r.charAt(0).toUpperCase()+r.slice(1);
    return r+(dec>0?' et '+grp(dec)+' centimes':'')+' dirhams';
  }

  function _load(src) {
    return new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)){res();return;}
      const s=document.createElement('script');s.src=src;s.onload=res;
      s.onerror=()=>rej(new Error('CDN: '+src));document.head.appendChild(s);
    });
  }

  /* ══════════════════════════════════════════════════════════
     Supabase
  ══════════════════════════════════════════════════════════ */
  function _sbH(extra={}) {
    const k=window.SUPABASE_ANON_KEY||'';
    return {'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json',...extra};
  }
  async function _sbSearch(q) {
    /* JSON mode — search embedded clients if available */
    if (window._jsonClients) {
      const lq = q.toLowerCase();
      return window._jsonClients.filter(c =>
        (c.nom||'').toLowerCase().includes(lq) ||
        (c.ice||'').toLowerCase().includes(lq)
      ).slice(0, 8);
    }
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients?select=id,nom,adresse,ice,tel,email&or=(nom.ilike.*${encodeURIComponent(q)}*,ice.ilike.*${encodeURIComponent(q)}*)&limit=8`;
    const r=await fetch(url,{headers:_sbH()});if(!r.ok)throw new Error(await r.text());
    return r.json();
  }
  async function _sbInsertClient(payload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients`;
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'return=representation'}),body:JSON.stringify(payload)});
    if(!r.ok)throw new Error(await r.text());
    return (await r.json())[0];
  }
  async function _sbUpsertQuote(quotePayload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_quotes`;
    const body={
      ref:        quotePayload.ref,
      status:     _type,
      client_nom: _cl.nom||'',
      client_ice: _cl.ice||'',
      total_ht:   quotePayload.totals?.grand||0,
      total_ttc:  quotePayload.totals?.ttc||quotePayload.totals?.grand||0,
      payload:    quotePayload,
    };
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text());
    return (await r.json())[0];
  }

  /* ══════════════════════════════════════════════════════════
     Inject HTML + CSS
  ══════════════════════════════════════════════════════════ */
  function _inject() {
    if (_$('inv-ovl')) return;
    const st=document.createElement('style');st.id='inv-css';st.textContent=CSS;
    document.head.appendChild(st);

    document.body.insertAdjacentHTML('beforeend',`
<div id="inv-ovl">
 <div id="inv-panel">

  <!-- ════ SIDEBAR ════ -->
  <div id="inv-sb">
   <div id="inv-hd">
    <div id="inv-hd-ico">${I.doc}</div>
    <div style="flex:1;min-width:0">
     <div id="inv-hd-title">Aperçu document</div>
     <div id="inv-hd-sub" style="font-size:9px;color:#94a3b8;margin-top:1px">Devis · Facture</div>
    </div>
    <button class="inv-x" onclick="INVOICE.close()" title="Fermer">${I.x}</button>
   </div>

   <div id="inv-bd">

    <!-- 1. Type + Import -->
    <div class="isec">
     <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
      <div class="isec-ttl" style="margin-bottom:0">Document</div>
      <button class="iimport-btn" id="inv-imp-toggle" onclick="INVOICE._toggleImport()">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 15V3m0 12l-4-4m4 4l4-4M3 18v2a1 1 0 001 1h16a1 1 0 001-1v-2"/></svg>
       Importer
      </button>
     </div>
     <div class="itype">
      <button class="itbtn on" id="inv-t-d" onclick="INVOICE._setType('devis')">Devis</button>
      <button class="itbtn"    id="inv-t-f" onclick="INVOICE._setType('facture')">Facture</button>
     </div>
     <div class="iimport-panel" id="inv-imp-panel">
      <div class="iimport-search">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="11" height="11"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>
       <input id="inv-imp-q" type="text" placeholder="Ref, client…" autocomplete="off"
              oninput="INVOICE._impSearch(this.value)">
      </div>
      <div class="iimport-list" id="inv-imp-list">
       <div class="iimport-msg">Tapez pour chercher…</div>
      </div>
     </div>
    </div>

    <!-- 2. Client -->
    <div class="isec">
     <div class="isec-ttl">Client</div>

     <!-- chip (shown after picking from DB) -->
     <div class="icl-chip" id="inv-chip">
      <div class="icl-chip-info">
       <div class="icl-chip-name" id="inv-chip-name"></div>
       <div class="icl-chip-sub"  id="inv-chip-sub"></div>
      </div>
      <button class="icl-chip-x" onclick="INVOICE._resetClient()" title="Changer">${I.x}</button>
     </div>

     <!-- search -->
     <div style="position:relative" id="inv-srch-wrap">
      <div class="icl-search">
       ${I.srch}
       <input id="inv-cl-q" type="text" placeholder="Rechercher dans la base…"
              autocomplete="off"
              oninput="INVOICE._onSearch(this.value)"
              onfocus="INVOICE._onSearch(this.value)">
       <button class="icl-clr" id="inv-cl-clr" onclick="INVOICE._clearSearch()" style="display:none">${I.x}</button>
      </div>
      <div class="icl-drop" id="inv-cl-drop">
       <div class="icl-dr-msg">Tapez pour rechercher…</div>
      </div>
     </div>

     <!-- form (always shown, fills when picking from search) -->
     <div class="icl-form" id="inv-cl-form">
      <div class="ifl"><label>Nom / Société *</label>
       <input id="inv-fn" type="text" placeholder="Nom ou raison sociale"
              oninput="INVOICE._syncCl()">
      </div>
      <div class="ifl"><label>Adresse</label>
       <textarea id="inv-fa" placeholder="Rue, ville…" oninput="INVOICE._syncCl()"></textarea>
      </div>
      <div class="ifl-row">
       <div class="ifl"><label>ICE</label><input id="inv-fi" type="text" oninput="INVOICE._syncCl()"></div>
       <div class="ifl"><label>Tél</label><input id="inv-ft2" type="text" oninput="INVOICE._syncCl()"></div>
      </div>
      <div class="ifl"><label>Email</label>
       <input id="inv-fe" type="email" oninput="INVOICE._syncCl()">
      </div>
      <!-- appears when nom is filled and client is new -->
      <button class="icl-save" id="inv-cl-save" onclick="INVOICE._saveClient()">
       ${I.save} Ajouter à la base de données
      </button>
     </div>
    </div>

    <!-- 3. Éléments visuels (pill row) -->
    <div class="isec">
     <div class="isec-ttl">Éléments visuels</div>
     <div class="ilpills">
      <button class="ilpill on" id="inv-pl-lh"    onclick="INVOICE._layer('lh')">${I.lh} En-tête</button>
      <button class="ilpill"    id="inv-pl-stamp"  onclick="INVOICE._layer('stamp')">${I.stamp} Cachet</button>
      <button class="ilpill"    id="inv-pl-sig"    onclick="INVOICE._layer('sig')">${I.sig} Signature</button>
     </div>
    </div>

    <!-- 4. Conditions & Validité -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl" style="margin-bottom:0">Conditions de règlement</div>
      <button class="icond-pill on" id="inv-cond-pill" onclick="INVOICE._toggleCond()">Activé</button>
     </div>
     <div class="icond-body" id="inv-cond-body">
      <div class="ifl">
       <label>Texte des conditions</label>
       <textarea id="inv-cond-txt" class="ifl icond-txt" oninput="INVOICE._syncCond(this.value)"></textarea>
      </div>
      <div class="ifl">
       <label>Validité du devis (optionnel)</label>
       <input type="date" id="inv-valid-date" onchange="INVOICE._syncValidDate(this.value)">
      </div>
     </div>
    </div>

    <!-- 5. TVA -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl" style="margin-bottom:0">TVA</div>
      <button class="icond-pill" id="inv-tva-pill" onclick="INVOICE._toggleTva()">OFF</button>
     </div>
     <div class="icond-body off" id="inv-tva-body">
      <div class="ifl">
       <label>Taux TVA (%)</label>
       <input type="number" id="inv-tva-rate" min="0" max="100" step="0.1" value="20"
              oninput="INVOICE._syncTvaRate(+this.value)">
      </div>
     </div>
    </div>

   </div><!-- #inv-bd -->

   <!-- Footer -->
   <div id="inv-ft">
    <button class="ibtn ibtn-gen" id="inv-gen-btn" onclick="INVOICE._generate()">
     ${I.doc} Générer le PDF
    </button>
    <div id="inv-tray">
     <div class="itray-lbl">Partager le PDF</div>
     <div class="itray-row">
      <a  class="itr itr-wa" id="inv-tr-wa" href="#" onclick="event.preventDefault();INVOICE._shareWA()" style="display:none">${I.wa} WhatsApp</a>
      <button class="itr itr-ml" onclick="INVOICE._shareMail()">${I.mail} Mail</button>
     </div>
     <div class="itray-row">
      <button class="itr itr-dl" onclick="INVOICE._dl()">${I.dl} Télécharger</button>
      <button class="itr itr-sh" id="inv-tr-sh" onclick="INVOICE._share()" style="display:none">${I.share} Partager</button>
     </div>
    </div>
    <button class="ibtn ibtn-back" onclick="INVOICE.close()">← Retour</button>
   </div>
  </div><!-- #inv-sb -->

  <!-- ════ PREVIEW ════ -->
  <div id="inv-prev">
   <div id="inv-doc-wrap">
    <div id="inv-doc">
     <div id="inv-lh" class="on"><img src="images/letterhead.png" alt=""></div>
     <div id="inv-ct"></div>
     <div id="inv-spin"><div class="isp"></div><p>Génération…</p></div>
    </div>
   </div>
  </div>

  <!-- ════ MOBILE BOTTOM BAR ════ -->
  <div id="inv-mob-bar">
   <button class="imb-btn on" id="inv-mb-form" onclick="INVOICE._mobSwitch('form')">
    ${I.form} Formulaire
   </button>
   <button class="imb-btn" id="inv-mb-prev" onclick="INVOICE._mobSwitch('preview')">
    ${I.eye} Aperçu
   </button>
  </div>

 </div><!-- #inv-panel -->
</div>`);

    window.addEventListener('resize', _onResize);
    document.addEventListener('click', e => {
      if (!e.target.closest('#inv-srch-wrap')) _$('inv-cl-drop')?.classList.remove('on');
    });
  }

  /* ══════════════════════════════════════════════════════════
     Scale + mobile
  ══════════════════════════════════════════════════════════ */
  function _onResize() { _scaleDoc(); _mobLayout(); }

  function _scaleDoc() {
    const prev=_$('inv-prev'), wrap=_$('inv-doc-wrap');
    if(!prev||!wrap) return;
    /* Reset transform first so offsetHeight reflects true layout height */
    wrap.style.transform = 'none';
    const actualH = wrap.offsetHeight || DOC_H;
    const mob = window.innerWidth <= 700;
    if (mob) {
      const avail = prev.clientWidth - 16;
      const sc = avail / DOC_W;
      wrap.style.transformOrigin = 'top left';
      wrap.style.transform  = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = (DOC_W  * sc - DOC_W)   + 'px';
      wrap.style.marginLeft   = '';
    } else {
      const sc = Math.min(
        (prev.clientWidth  - 32) / DOC_W,
        (prev.clientHeight - 40) / actualH,
        1
      );
      wrap.style.transformOrigin = 'top center';
      wrap.style.transform = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = '';
    }
  }

  function _mobLayout() {
    const mob = window.innerWidth <= 700;
    const sb = _$('inv-sb'), pv = _$('inv-prev');
    if (!sb || !pv) return;
    if (!mob) {
      sb.classList.remove('mob-hidden');
      pv.classList.remove('mob-hidden');
      return;
    }
    sb.classList.toggle('mob-hidden', _mobView !== 'form');
    pv.classList.toggle('mob-hidden', _mobView !== 'preview');
  }

  function _mobSwitch(view) {
    _mobView = view;
    _$('inv-mb-form')?.classList.toggle('on', view === 'form');
    _$('inv-mb-prev')?.classList.toggle('on', view === 'preview');
    _mobLayout();
    if (view === 'preview') requestAnimationFrame(_scaleDoc);
  }

  function _getScale() {
    const w=_$('inv-doc-wrap'); if(!w) return 1;
    return new DOMMatrix(getComputedStyle(w).transform).a || 1;
  }

  /* ══════════════════════════════════════════════════════════
     Layer pills
  ══════════════════════════════════════════════════════════ */
  function _layer(k) {
    _layers[k] = !_layers[k];
    _$(`inv-pl-${k}`)?.classList.toggle('on', _layers[k]);
    if (k === 'lh') { _$('inv-lh')?.classList.toggle('on', _layers[k]); return; }
    if (_layers[k]) { _dovs[k] ? (_dovs[k].style.display='') : _mkDov(k); }
    else { if (_dovs[k]) _dovs[k].style.display='none'; }
  }

  function _toggleCond() {
    _condOn = !_condOn;
    const pill = _$('inv-cond-pill'), body = _$('inv-cond-body');
    if (pill) { pill.classList.toggle('on', _condOn); pill.textContent = _condOn ? 'Activé' : 'Désactivé'; }
    if (body) body.classList.toggle('off', !_condOn);
    _renderDoc();
  }
  function _syncCond(val) { _condText = val; _renderDoc(); }
  function _syncValidDate(val) { _validDate = val; _renderDoc(); }

  function _toggleTva() {
    _tvaOn = !_tvaOn;
    const pill = _$('inv-tva-pill'), body = _$('inv-tva-body');
    if (pill) { pill.classList.toggle('on', _tvaOn); pill.textContent = _tvaOn ? `${_tvaRate}%` : 'OFF'; }
    if (body) body.classList.toggle('off', !_tvaOn);
    _renderDoc();
  }
  function _syncTvaRate(val) {
    _tvaRate = isNaN(val)||val<0 ? 20 : val;
    const pill = _$('inv-tva-pill');
    if (pill && _tvaOn) pill.textContent = `${_tvaRate}%`;
    _renderDoc();
  }

  function _mkDov(k) {
    const doc=_$('inv-doc'); if(!doc) return;
    const W=k==='stamp'?120:140;
    const ov=document.createElement('div'); ov.className='inv-dov'; ov.dataset.k=k;
    const img=document.createElement('img');
    img.src=_src(k); img.alt=k; img.style.width=W+'px';
    img.onerror=()=>{img.style.cssText=`width:${W}px;height:${Math.round(W*.65)}px;background:rgba(37,99,235,.06);border:1.5px dashed #2563EB;border-radius:6px;display:block;`;};
    ov.appendChild(img); doc.appendChild(ov);
    /* Default: sig left of stamp, both bottom-right, same Y */
    const Y = DOC_H - 210;
    if(k==='stamp') {
      ov.style.left=(DOC_W-CS-W-10)+'px';
    } else {
      /* sig sits left of stamp with 10px gap */
      ov.style.left=(DOC_W-CS-120-10-W-14)+'px';
    }
    ov.style.top=Y+'px';
    _drag(ov); _dovs[k]=ov;
  }

  function _drag(ov) {
    let sx,sy,sl,st,active=false;
    const start=e=>{e.preventDefault();active=true;const p=e.touches?e.touches[0]:e,sc=_getScale();sx=p.clientX/sc;sy=p.clientY/sc;sl=parseFloat(ov.style.left)||0;st=parseFloat(ov.style.top)||0;ov.classList.add('dragging');};
    const move=e=>{if(!active)return;e.preventDefault();const p=e.touches?e.touches[0]:e,sc=_getScale(),w=ov.parentElement;ov.style.left=Math.max(0,Math.min(w.offsetWidth-ov.offsetWidth,sl+p.clientX/sc-sx))+'px';ov.style.top=Math.max(0,Math.min(w.offsetHeight-ov.offsetHeight,st+p.clientY/sc-sy))+'px';};
    const end=()=>{active=false;ov.classList.remove('dragging');};
    ov.addEventListener('mousedown',start);ov.addEventListener('touchstart',start,{passive:false});
    document.addEventListener('mousemove',move);document.addEventListener('touchmove',move,{passive:false});
    document.addEventListener('mouseup',end);document.addEventListener('touchend',end);
  }

  /* ══════════════════════════════════════════════════════════
     Client — search
  ══════════════════════════════════════════════════════════ */
  function _onSearch(val) {
    clearTimeout(_srchTO);
    const drop=_$('inv-cl-drop'), clr=_$('inv-cl-clr');
    const srch=_$('inv-cl-q')?.closest('.icl-search');
    if(!drop) return;
    if(clr) clr.style.display = val ? '' : 'none';
    if(!val.trim()){
      drop.innerHTML='<div class="icl-dr-msg">Tapez pour rechercher…</div>';
      drop.classList.remove('on'); srch?.classList.remove('drop-open'); return;
    }
    drop.innerHTML='<div class="icl-dr-msg">Recherche…</div>';
    drop.classList.add('on'); srch?.classList.add('drop-open');
    _srchTO=setTimeout(async()=>{
      try {
        const rows=await _sbSearch(val.trim());
        if(!rows.length){ drop.innerHTML='<div class="icl-dr-msg">Aucun résultat</div>'; return; }
        drop.innerHTML=rows.map(r=>`
          <div class="icl-dr-row" data-cl="${JSON.stringify(r).replace(/"/g,'&quot;')}" onclick="INVOICE._pickClient(this.dataset.cl)">
           <div class="icl-dr-name">${r.nom||'—'}</div>
           <div class="icl-dr-sub">${[r.ice,r.tel,r.email].filter(Boolean).join(' · ')||r.adresse||''}</div>
          </div>`).join('');
      } catch(e){ drop.innerHTML='<div class="icl-dr-msg">⚠ Erreur réseau</div>'; }
    },280);
  }

  function _clearSearch() {
    const q=_$('inv-cl-q'); if(q){q.value='';q.focus();}
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
  }

  function _pickClient(jsonStr) {
    const r=JSON.parse(jsonStr);
    _cl={id:r.id||null,nom:r.nom||'',adresse:r.adresse||'',ice:r.ice||'',tel:r.tel||'',email:r.email||''};
    _fillForm(); _showChip(); _renderDoc();
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
  }

  function _fillForm() {
    const set=(id,v)=>{const e=_$(id);if(e)e.value=v||'';};
    set('inv-fn',_cl.nom); set('inv-fa',_cl.adresse);
    set('inv-fi',_cl.ice); set('inv-ft2',_cl.tel); set('inv-fe',_cl.email);
    _updateSaveBtn();
  }

  function _showChip() {
    _$('inv-chip-name').textContent=_cl.nom||'—';
    _$('inv-chip-sub').textContent=[_cl.ice,_cl.tel].filter(Boolean).join(' · ')||_cl.adresse||'';
    _$('inv-chip')?.classList.add('on');
  }

  function _resetClient() {
    _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    _fillForm(); _$('inv-chip')?.classList.remove('on');
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');
    _renderDoc();
  }

  /* ── form sync ── */
  function _syncCl() {
    _cl.nom     = (_$('inv-fn')?.value ||'').trim();
    _cl.adresse = (_$('inv-fa')?.value ||'').trim();
    _cl.ice     = (_$('inv-fi')?.value ||'').trim();
    _cl.tel     = (_$('inv-ft2')?.value||'').trim();
    _cl.email   = (_$('inv-fe')?.value ||'').trim();
    _cl.id      = null; // manual edit → treat as new
    _updateSaveBtn();
    _renderDoc();
  }

  function _updateSaveBtn() {
    // Show "add to DB" only when nom is filled AND client not already saved
    const show = !!_cl.nom && !_cl.id;
    _$('inv-cl-save')?.classList.toggle('on', show);
  }

  async function _saveClient() {
    const btn=_$('inv-cl-save'); if(!_cl.nom) return;
    const origHTML=btn?btn.innerHTML:'';
    if(btn){btn.disabled=true;btn.style.cssText='background:#e2e8f0;border-color:#cbd5e1;color:#94a3b8;cursor:not-allowed';}
    try {
      const saved=await _sbInsertClient({nom:_cl.nom,adresse:_cl.adresse,ice:_cl.ice,tel:_cl.tel,email:_cl.email});
      _cl.id=saved?.id||null;
      /* flash green success on the button */
      if(btn){
        btn.style.cssText='background:#dcfce7;border-color:#86efac;color:#16a34a;cursor:default';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Client ajouté avec succès`;
        setTimeout(()=>{
          btn.disabled=false; btn.style.cssText='';
          btn.innerHTML=origHTML;
          _updateSaveBtn(); /* hides btn since cl.id is now set */
        },2500);
      }
      _showChip();
    } catch(e){
      console.error('[INVOICE] saveClient:',e);
      if(btn){
        btn.disabled=false; btn.style.cssText='';
        btn.style.cssText='background:#fef2f2;border-color:#fca5a5;color:#dc2626';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Erreur — réessayer`;
        setTimeout(()=>{btn.style.cssText='';btn.innerHTML=origHTML;},3000);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     Render A4
  ══════════════════════════════════════════════════════════ */
  function _renderDoc() {
    /* Remove any extra pages from a previous render */
    document.querySelectorAll('.inv-page-extra').forEach(e => e.remove());
    const mainDoc = _$('inv-doc'), ct = _$('inv-ct');
    if (!ct || !_q || !mainDoc) return;

    const {ref, date, items=[], totals={}, ta, shop={}} = _q;
    const {surAmt=0, del=0, grand=0} = totals;
    const isD = _type === 'devis';

    /* TVA */
    const tvaAmt = _tvaOn ? Math.round(grand * (_tvaRate / 100) * 100) / 100 : 0;
    const total  = _tvaOn ? Math.round((grand + tvaAmt) * 100) / 100 : grand;

    /* Layout */
    const CONTENT_W  = DOC_W - 2 * CS;          // 698 px
    const PAGE_CONT  = DOC_H - CT - 40;          // usable height per page (minus footer pad)

    /* Off-screen height measurement — CSS classes injected by _inject() apply */
    const _msr = html => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
        + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
        + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
      d.innerHTML = html;
      document.body.appendChild(d);
      const h = d.offsetHeight;
      document.body.removeChild(d);
      return h + 4; // +4 safety
    };

    /* ── HTML fragments ── */
    const cbox = (_cl.nom||_cl.adresse||_cl.ice) ? `
      <div class="dc-cbox">
        ${_cl.nom    ?`<div class="dc-cnom">${_cl.nom}</div>`:''}
        ${_cl.adresse?`<div class="dc-cadr">${_cl.adresse.replace(/\n/g,'<br>')}</div>`:''}
        ${_cl.ice    ?`<div class="dc-cice"><strong>ICE : </strong>${_cl.ice}</div>`:''}
      </div>` : '<div></div>';

    const headerHTML = `
      <div class="dc-date">${date}</div>
      <div class="dc-top">
        <div><div class="dc-ttl">${isD?'Devis':'Facture'}</div><div class="dc-ref">N° ${ref}</div></div>
        ${cbox}
      </div>`;

    const theadHTML = `<thead><tr>
      <th>Désignations</th>
      <th class="r" style="width:60px">Qté</th>
      <th class="r" style="width:72px">P.U. HT</th>
      <th class="r" style="width:88px">Total HT</th>
    </tr></thead>`;

    const rowHTMLs = items.map((it, i) => `
      <tr class="${i%2?'er':''}">
        <td><div class="dc-tn">${it.prodName||''}</div>
          ${it.specs ?`<div class="dc-ts">${it.specs}</div>`:''}
          ${it.notes ?`<div class="dc-to">"${it.notes}"</div>`:''}</td>
        <td class="r">${fmtN(it.quantity)}</td>
        <td class="r">${fmt(it.perUnit)}</td>
        <td class="r" style="font-weight:700">${fmt(it.baseTotal)}</td>
      </tr>`);

    const tfootRows = [
      surAmt>0 ? `<tr><td colspan="3" style="text-align:right;font-size:8pt;color:#f59e0b">${ta?.label||''}</td><td class="tfv" style="text-align:right;color:#f59e0b">+${fmt(surAmt)} DH</td></tr>` : '',
      del>0    ? `<tr><td colspan="3" class="tfl">Livraison</td><td class="tfv" style="text-align:right">+${fmt(del)} DH</td></tr>` : '',
      _tvaOn
        ? `<tr class="tfsep"><td colspan="3" class="tfl">Total HT</td><td class="tfv" style="text-align:right">${fmt(grand)} DH</td></tr>
           <tr><td colspan="3" class="tfl">TVA ${_tvaRate}%</td><td style="text-align:right;color:#94a3b8">${fmt(tvaAmt)} DH</td></tr>
           <tr class="tfsep"><td colspan="3" class="tflb">Total TTC</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(total)} DH</td></tr>`
        : `<tr class="tfsep"><td colspan="3" class="tflb">Total Hors champ de TVA</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(grand)} DH</td></tr>`
    ].join('');
    const tfootHTML = `<tfoot><tr><td colspan="4" style="padding:3px 0;border:none"></td></tr>${tfootRows}</tfoot>`;

    const arreteHTML = `<div class="dc-arr">Arrêter la présente ${isD?'offre':'facture'} à la somme de :
      <strong>${_lettre(total||grand).toUpperCase()}.</strong></div>`;

    const condHTML = _condOn ? `<div class="dc-cond">
      <div class="dc-cond-t">Conditions de règlement</div>
      ${shop.rib?`<p>RIB : <strong>${shop.rib}</strong></p>`:''}
      <p>${_condText||_COND_DEFAULT}</p>
      ${_validDate?`<p style="margin-top:5px;font-size:7.5pt;color:#1a1f2e"><strong>Validité du devis : </strong>${new Date(_validDate+'T00:00:00').toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})}</p>`:''}
    </div>` : '';

    const suffixHTML = arreteHTML + condHTML;

    /* ── Single-page fast path ── */
    if (!items.length) {
      const fill = Array(4).fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('');
      ct.innerHTML = `${headerHTML}<table class="dc-tbl">${theadHTML}<tbody>${fill}</tbody>${tfootHTML}</table>${suffixHTML}`;
      requestAnimationFrame(_scaleDoc); return;
    }

    /* ── Measure heights for page-break algorithm ── */
    const msrDiv = document.createElement('div');
    msrDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
      + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
      + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
    msrDiv.innerHTML = `
      <div>${headerHTML}</div>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">
        ${theadHTML}<tbody>${rowHTMLs.join('')}</tbody>
      </table>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">${tfootHTML}</table>
      <div>${suffixHTML}</div>`;
    document.body.appendChild(msrDiv);

    const kids      = msrDiv.children;
    const headerH   = kids[0].offsetHeight;
    const allTrs    = Array.from(msrDiv.querySelectorAll('tbody tr'));
    const theadH    = msrDiv.querySelector('thead').offsetHeight;
    const rowHts    = allTrs.map(tr => tr.offsetHeight);
    const tfootH    = kids[2].offsetHeight;
    const sfxH      = kids[3].offsetHeight;
    const suffH     = tfootH + sfxH + 4;

    document.body.removeChild(msrDiv);

    /* ── Greedy page packing ── */
    const pages = [[]];
    let used = headerH + theadH;

    for (let i = 0; i < rowHTMLs.length; i++) {
      const rh = rowHts[i];
      const isLast = i === rowHTMLs.length - 1;
      const fits   = used + rh + (isLast ? suffH : 0) <= PAGE_CONT;
      const isFirstOnPage = pages[pages.length - 1].length === 0;

      if (fits || isFirstOnPage) {
        pages[pages.length - 1].push(i);
        used += rh;
      } else {
        pages.push([i]);
        used = theadH + rh;
      }
    }

    /* If suffix doesn't fit on last page, push it to a new page */
    if (used + suffH > PAGE_CONT) pages.push([]);

    const numPages = pages.length;

    /* ── Build page content HTML ── */
    const lhSrc = _b64.lh || 'images/letterhead.png';

    const _pageContent = (rowIdxs, isFirst, isLast) => {
      const fill = (isFirst && isLast) ? Array(Math.max(0, 4 - rowIdxs.length))
        .fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('') : '';
      return `${isFirst ? headerHTML : ''}
        <table class="dc-tbl">
          ${theadHTML}
          <tbody>${rowIdxs.map(i => rowHTMLs[i]).join('')}${fill}</tbody>
          ${isLast ? tfootHTML : '<tfoot></tfoot>'}
        </table>
        ${isLast ? suffixHTML : ''}`;
    };

    /* Page 1 — goes into #inv-ct */
    ct.innerHTML = _pageContent(pages[0], true, numPages === 1);

    /* Extra pages */
    const wrap = mainDoc.parentElement;
    for (let p = 1; p < numPages; p++) {
      const div = document.createElement('div');
      div.className = 'inv-page-extra';
      div.innerHTML = `
        <div class="inv-lh-clone${_layers.lh?' on':''}"><img src="${lhSrc}" alt=""></div>
        <div class="inv-ct-extra">${_pageContent(pages[p], false, p === numPages - 1)}</div>`;
      wrap.appendChild(div);
    }

    requestAnimationFrame(_scaleDoc);
  }

  /* ══════════════════════════════════════════════════════════
     open / close
  ══════════════════════════════════════════════════════════ */
  function open(q, opts={}) {
    _inject(); _loadB64();
    _q=q; _blob=null; _dbId=opts.dbId||null;
    _type=opts.docType||'devis';
    _layers={lh:true,stamp:false,sig:false};
    _dovs={stamp:null,sig:null};
    _mobView='form';

    /* Pre-fill client if passed in opts */
    if(opts.client){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...opts.client};
    } else {
      _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    }

    /* Reset UI */
    _fillForm();
    _$('inv-chip')?.classList.remove('on');
    if(_cl.nom) _showChip();
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');

    /* type btns */
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');

    /* layer pills */
    _$('inv-pl-lh')?.classList.add('on');
    ['stamp','sig'].forEach(k=>_$(`inv-pl-${k}`)?.classList.remove('on'));
    _$('inv-lh')?.classList.add('on');

    /* letterhead src */
    const lhImg=document.querySelector('#inv-lh img');
    if(lhImg) lhImg.src=_b64.lh||'images/letterhead.png';

    /* generate + tray */
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`${I.doc} Générer le PDF`;}

    /* WA / share */
    const wa=_$('inv-tr-wa');
    if(wa) wa.style.display = navigator.canShare ? 'flex' : 'none';
    const sh=_$('inv-tr-sh');if(sh) sh.style.display=navigator.share?'flex':'none';

    /* Reset conditions state */
    _condOn   = true;
    _condText = _COND_DEFAULT;
    _validDate = '';
    const condTxt  = _$('inv-cond-txt');
    const condDate = _$('inv-valid-date');
    const condPill = _$('inv-cond-pill');
    const condBody = _$('inv-cond-body');
    if(condTxt)  condTxt.value  = _COND_DEFAULT;
    if(condDate) condDate.value = '';
    if(condPill){ condPill.classList.add('on'); condPill.textContent='Activé'; }
    if(condBody) condBody.classList.remove('off');

    /* Reset TVA state */
    _tvaOn   = false;
    _tvaRate = 20;
    const tvaPill = _$('inv-tva-pill'), tvaBody = _$('inv-tva-body'), tvaRate = _$('inv-tva-rate');
    if(tvaPill){ tvaPill.classList.remove('on'); tvaPill.textContent='OFF'; }
    if(tvaBody) tvaBody.classList.add('off');
    if(tvaRate) tvaRate.value = 20;

    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _$('inv-mob-bar') && _mobSwitch('form');
    _$('inv-ovl').classList.add('on');
    document.body.style.overflow='hidden';
    _renderDoc();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ _scaleDoc(); _mobLayout(); }));
  }

  function close() {
    _$('inv-ovl')?.classList.remove('on');
    document.body.style.overflow='';
    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _dovs={stamp:null,sig:null};
  }

  /* ══════════════════════════════════════════════════════════
     Generate PDF — taint-proof
     ─────────────────────────────────────────────────────────
     Strategy (same as v5):
     1. base64 in localStorage → swap src → zero external URLs
     2. http(s):// without base64 → useCORS:true
     3. file:// without base64 → hide images before capture
  ══════════════════════════════════════════════════════════ */
  async function _generate() {
    const gb=_$('inv-gen-btn'), sp=_$('inv-spin');
    if(gb){gb.disabled=true;gb.textContent='⏳ Rendu…';}
    if(sp) sp.classList.add('on');

    const isFile=location.protocol==='file:';
    const hidden=[];
    const hide=el=>{if(el){el.style.visibility='hidden';hidden.push(el);}};
    const restore=()=>hidden.forEach(el=>el.style.visibility='');

    try {
      await _load(CDN_H2C); await _load(CDN_JPDF);

      /* ── Resolve all images to base64, wait for load, then capture ──
         html2canvas clones the DOM before rendering — two-step fix:
         1) resolve + onload in live DOM (browser cache populated)
         2) re-inject in onclone() so the cloned doc also has data-URLs  */
      const _resolved = {};

      /* Resolve every image we might need — use _src() which already
         returns localStorage data-URL if uploaded, else the file path */
      const _keys = ['lh', 'stamp', 'sig'];
      for (const k of _keys) {
        const b64 = await _imgToB64(_src(k));
        if (b64) _resolved[k] = b64;
      }

      /* Pre-warm live DOM images with resolved data-URLs */
      const lhImg = document.querySelector('#inv-lh img');
      if (lhImg && _resolved.lh) {
        await new Promise(res => {
          if (lhImg.src === _resolved.lh && lhImg.complete) { res(); return; }
          lhImg.onload = lhImg.onerror = () => { lhImg.onload = lhImg.onerror = null; res(); };
          lhImg.src = _resolved.lh;
          if (lhImg.complete) res();
        });
      }
      for (const dov of document.querySelectorAll('.inv-dov')) {
        const k = dov.dataset.k, img = dov.querySelector('img');
        if (img && _resolved[k]) {
          await new Promise(res => {
            if (img.src === _resolved[k] && img.complete) { res(); return; }
            img.onload = img.onerror = () => { img.onload = img.onerror = null; res(); };
            img.src = _resolved[k];
            if (img.complete) res();
          });
        }
      }

      await new Promise(r => setTimeout(r, 60));

      /* ══════════════════════════════════════════════════════
         OFF-SCREEN DESKTOP ENGINE
         Build completely isolated render containers outside
         the overlay DOM — zero mobile CSS contamination.
         html2canvas then captures clean, unclipped elements.
      ══════════════════════════════════════════════════════ */
      const lhSrc  = _resolved.lh || null;
      const lhVis  = _layers.lh;

      /* Page data: collect innerHTML of each page's content area */
      const mainDoc  = _$('inv-doc');
      const ctHTML   = _$('inv-ct')?.innerHTML || '';
      const extraEls = Array.from(document.querySelectorAll('.inv-page-extra'));
      const pageContents = [{ ct: ctHTML, lh: lhVis }];
      extraEls.forEach(el => {
        pageContents.push({
          ct:  el.querySelector('.inv-ct-extra')?.innerHTML || '',
          lh:  el.querySelector('.inv-lh-clone')?.classList.contains('on') ?? lhVis,
        });
      });

      /* Dov (stamp/sig) snapshots: position + resolved src */
      const dovSnaps = Array.from(document.querySelectorAll('.inv-dov')).map(dov => ({
        k:    dov.dataset.k,
        left: dov.style.left,
        top:  dov.style.top,
        w:    dov.querySelector('img')?.style.width || '120px',
        src:  _resolved[dov.dataset.k] || null,
      }));

      /* Off-screen host — completely outside #inv-ovl */
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-${DOC_W + 40}px;top:0;`
        + `width:${DOC_W}px;overflow:visible;z-index:-1;pointer-events:none`;
      document.body.appendChild(host);

      /* Build one render-frame per page, measure, capture */
      const {jsPDF} = window.jspdf;
      const pdf = new jsPDF('p','mm','a4');

      for (let pi = 0; pi < pageContents.length; pi++) {
        const pg = pageContents[pi];

        /* Build isolated page element */
        const frame = document.createElement('div');
        frame.style.cssText = `width:${DOC_W}px;height:${DOC_H}px;background:#fff;`
          + `position:relative;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;

        /* Letterhead */
        if (pg.lh && lhSrc) {
          const lhDiv = document.createElement('div');
          lhDiv.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none';
          const lhI = document.createElement('img');
          lhI.src = lhSrc;
          lhI.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
          lhDiv.appendChild(lhI);
          frame.appendChild(lhDiv);
        }

        /* Content area */
        const ctDiv = document.createElement('div');
        ctDiv.style.cssText = `position:absolute;z-index:1;`
          + `top:${CT}px;left:${CS}px;right:${CS}px;bottom:0;`
          + `box-sizing:border-box;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;
        ctDiv.innerHTML = pg.ct;
        frame.appendChild(ctDiv);

        /* Stamp / sig overlays (page 1 only) */
        if (pi === 0) {
          dovSnaps.forEach(snap => {
            if (!snap.src) return;
            const dov = document.createElement('div');
            dov.style.cssText = `position:absolute;z-index:3;left:${snap.left};top:${snap.top}`;
            const img = document.createElement('img');
            img.src = snap.src;
            img.style.width = snap.w;
            img.style.display = 'block';
            dov.appendChild(img);
            frame.appendChild(dov);
          });
        }

        host.innerHTML = '';
        host.appendChild(frame);

        /* Wait for images to fully load inside frame */
        const imgs = Array.from(frame.querySelectorAll('img'));
        await Promise.all(imgs.map(img => new Promise(res => {
          if (img.complete && img.naturalWidth > 0) { res(); return; }
          img.onload = img.onerror = res;
        })));
        await new Promise(r => requestAnimationFrame(r));

        const canvas = await window.html2canvas(frame, {
          scale: 2, useCORS: false, allowTaint: true,
          foreignObjectRendering: false,
          width: DOC_W, height: DOC_H, backgroundColor: '#ffffff',
          logging: false, imageTimeout: 0,
        });

        if (pi > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 210, 297);
      }

      document.body.removeChild(host);

      restore();
      _blob=pdf.output('blob');
      _fname=`${_type==='devis'?'Devis':'Facture'}_${_q.ref}_${(_q.date||'').replace(/\//g,'-')}.pdf`;

      /* upsert to kote_quotes with full payload + client */
      const fullPayload={ ..._q, client:_cl, docType:_type };
      _sbUpsertQuote(fullPayload).then(row=>{ if(row?.id) _dbId=row.id; }).catch(()=>{});

      _$('inv-tray')?.classList.add('on');
      if(gb){gb.disabled=false;gb.textContent='↺ Regénérer';}
    } catch(err){
      restore();
      console.error('[INVOICE]',err);
      if(gb){gb.disabled=false;gb.textContent='⚠ Erreur — Réessayer';}
    } finally {
      if(sp) sp.classList.remove('on');
    }
  }

  function _dl() {
    if(!_blob) return;
    const url=URL.createObjectURL(_blob);
    const a=document.createElement('a');a.href=url;a.download=_fname;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
  }
  async function _share() {
    if(!_blob) return;
    const f=new File([_blob],_fname,{type:'application/pdf'});
    if(navigator.canShare?.({files:[f]})){try{await navigator.share({files:[f],title:_fname});}catch(e){if(e.name!=='AbortError')_dl();}}else _dl();
  }
  function _shareMail() {
    if(!_q) return;
    const sub=encodeURIComponent(`${_type==='devis'?'Devis':'Facture'} ${_q.ref}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver en pièce jointe notre ${_type==='devis'?'devis':'facture'} réf. ${_q.ref}.\n\nCordialement,\n${_q.shop?.name||''}`);
    _dl();
    setTimeout(()=>{const a=document.createElement('a');a.href=`mailto:?subject=${sub}&body=${body}`;a.click();},350);
  }

  async function _shareWA() {
    if (!_blob) return;
    const f = new File([_blob], _fname, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: _fname }); }
      catch(e) { if (e.name !== 'AbortError') _dl(); }
    } else {
      /* Fallback: download + open WhatsApp web so user can attach manually */
      _dl();
      const num = (_q?.shop?.whatsapp || '').replace(/\D/g, '');
      if (num) setTimeout(() => window.open(`https://wa.me/${num}`, '_blank'), 400);
    }
  }


  function _setType(t) {
    _type=t;
    _$('inv-t-d')?.classList.toggle('on',t==='devis');
    _$('inv-t-f')?.classList.toggle('on',t==='facture');
    _renderDoc();
  }

  /* ════ Import from kote_quotes ════ */
  let _impTO=null, _impOpen=false;

  function _toggleImport() {
    _impOpen=!_impOpen;
    _$('inv-imp-panel')?.classList.toggle('on',_impOpen);
    _$('inv-imp-toggle')?.classList.toggle('on',_impOpen);
    if(_impOpen){ _$('inv-imp-q')?.focus(); _impSearch(''); }
  }

  function _impSearch(val) {
    clearTimeout(_impTO);
    const list=_$('inv-imp-list'); if(!list) return;
    list.innerHTML='<div class="iimport-msg">Chargement…</div>';
    _impTO=setTimeout(async()=>{
      const q=val.trim();
      const fd=s=>new Date(s).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'2-digit'});
      const fm=n=>(+n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});

      /* JSON mode — search embedded quotes */
      if (window._jsonQuotes) {
        let rows = window._jsonQuotes;
        if (q) {
          const lq = q.toLowerCase();
          rows = rows.filter(r =>
            (r.ref||'').toLowerCase().includes(lq) ||
            (r.client_nom||'').toLowerCase().includes(lq)
          );
        }
        rows = rows.slice(0, 25);
        if (!rows.length) { list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
        return;
      }

      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      const filter=q?`&or=(ref.ilike.*${encodeURIComponent(q)}*,client_nom.ilike.*${encodeURIComponent(q)}*)`:'';
      const url=`${SB}/rest/v1/kote_quotes?select=id,ref,status,client_nom,total_ht,created_at&order=created_at.desc&limit=25${filter}`;
      try {
        const r=await fetch(url,{headers:{'apikey':K,'Authorization':'Bearer '+K}});
        if(!r.ok) throw new Error(r.status);
        const rows=await r.json();
        if(!rows.length){ list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
      } catch(e){ list.innerHTML='<div class="iimport-msg">⚠ Erreur réseau</div>'; }
    }, val.trim()?280:0);
  }

  async function _impLoad(dbId) {
    let row;
    /* JSON mode — find in embedded quotes */
    if (window._jsonQuotes) {
      row = window._jsonQuotes.find(r => r.id === dbId);
    }
    if (!row) {
      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      try {
        const r=await fetch(`${SB}/rest/v1/kote_quotes?id=eq.${dbId}&select=*&limit=1`,
          {headers:{'apikey':K,'Authorization':'Bearer '+K}});
        const rows=await r.json(); row=rows[0];
      } catch(e){ console.error('[INVOICE] impLoad:',e); return; }
    }
    if (!row) return;
    const p=row.payload||{};
    _q={...p}; _type=row.status||'devis';
    if(p.client&&(p.client.nom||p.client.id)){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...p.client};
      _fillForm(); if(_cl.nom) _showChip();
    }
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');
    _renderDoc();
    _impOpen=false;
    _$('inv-imp-panel')?.classList.remove('on');
    _$('inv-imp-toggle')?.classList.remove('on');
    _blob=null;
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Générer le PDF`;}
  }

  return {
    open, close, setImage,
    _setType, _layer, _toggleCond, _syncCond, _syncValidDate, _toggleTva, _syncTvaRate, _mobSwitch,
    _toggleImport, _impSearch, _impLoad,
    _onSearch, _clearSearch, _pickClient, _syncCl, _resetClient, _saveClient,
    _renderDoc, _generate, _dl, _share, _shareWA, _shareMail,
  };
})();

