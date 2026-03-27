'use strict';

/* ════ auth.js ════ */
/* ════════════════════════════════════════════════════════
   AUTH — Magic Link + Google OAuth for client.html
   Reads OAuth credentials from DB.contact (set in admin panel)

   Public API:
     AUTH.init()              — call on page load
     AUTH.openSignIn(afterFn) — show sign-in modal
     AUTH.signOut()           — sign out
     AUTH.getUser()           — current user or null
     AUTH.getUserId()         — uid string or null
     AUTH.openMyOrders()      — open order history drawer
   ════════════════════════════════════════════════════════ */
const AUTH = (() => {

  let _user    = null;
  let _afterFn = null;

  /* ── Helpers ── */
  const _url = () => window.SUPABASE_URL || '';
  const _key = () => window.SUPABASE_ANON_KEY || '';
  const _hdrs = tok => ({
    'apikey':        _key(),
    'Authorization': 'Bearer ' + (tok || _key()),
    'Content-Type':  'application/json',
  });
  const _ref = () => _url().replace('https://','').split('.')[0];
  const _storageKey = () => `sb-${_ref()}-auth-token`;

  /* ── Session ── */
  function _saveSession(data) {
    if (!data?.access_token) return;
    localStorage.setItem(_storageKey(), JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now()/1000) + (data.expires_in||3600),
      user:          data.user,
    }));
  }

  function _clearSession() {
    localStorage.removeItem(_storageKey());
    _user = null;
  }

  async function _getSession() {
    const raw = localStorage.getItem(_storageKey());
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data.expires_at && Date.now()/1000 > data.expires_at - 60) {
        return await _refreshSession(data.refresh_token);
      }
      return data;
    } catch { return null; }
  }

  async function _refreshSession(rt) {
    if (!rt) return null;
    try {
      const r = await fetch(`${_url()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: _hdrs(),
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!r.ok) { _clearSession(); return null; }
      const data = await r.json();
      _saveSession(data);
      return data;
    } catch { return null; }
  }

  /* ── Handle callback — works for BOTH magic link AND Google OAuth ── */
  async function _handleCallback() {
    const hash   = window.location.hash;
    const search = window.location.search;

    // ── Implicit flow: #access_token=... (magic link + Google if flow=implicit) ──
    if (hash && hash.includes('access_token')) {
      const params       = new URLSearchParams(hash.replace('#',''));
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn    = parseInt(params.get('expires_in') || '3600');
      if (!accessToken) return false;
      try {
        const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(accessToken) });
        if (!r.ok) return false;
        const user = await r.json();
        _saveSession({ access_token:accessToken, refresh_token:refreshToken, expires_in:expiresIn, user });
        _user = user;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[AUTH] implicit callback → signed in:', user.email);
        return true;
      } catch(e) { console.error('[AUTH] implicit callback error', e); return false; }
    }

    // ── PKCE flow: ?code=... (Supabase default) — exchange code for token ──
    if (search && search.includes('code=')) {
      const code     = new URLSearchParams(search).get('code');
      const verifier = sessionStorage.getItem('pkce_verifier');
      if (!code) return false;
      try {
        const body = { auth_code: code };
        if (verifier) body.code_verifier = verifier;
        const r = await fetch(`${_url()}/auth/v1/token?grant_type=pkce`, {
          method: 'POST', headers: _hdrs(),
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          console.warn('[AUTH] PKCE exchange failed', r.status, await r.text());
          // Clean URL anyway
          window.history.replaceState(null, '', window.location.pathname);
          return false;
        }
        const data = await r.json();
        _saveSession(data);
        _user = data.user;
        sessionStorage.removeItem('pkce_verifier');
        window.history.replaceState(null, '', window.location.pathname);
        console.log('[AUTH] PKCE callback → signed in:', data.user?.email);
        return true;
      } catch(e) { console.error('[AUTH] PKCE callback error', e); return false; }
    }

    return false;
  }

  /* ── Magic link ── */
  async function _sendMagicLink(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const r = await fetch(`${_url()}/auth/v1/otp`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, create_user: true, options: { emailRedirectTo: redirectTo } }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.msg || err.message || `HTTP ${r.status}`);
    }
  }

  /* ── Google OAuth ── */
  async function _signInWithGoogle() {
    const redirectTo = window.location.origin + window.location.pathname;
    // Use the Supabase authorize endpoint — it handles the Google redirect
    window.location.href =
      `${_url()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  /* ── Google configured? ── */
  function _googleEnabled() {
    // Google works if the Supabase project has it enabled — we always show it,
    // but it will fail gracefully if not configured
    return true;
  }

  /* ── Init ── */
  async function init() {
    const fromCallback = await _handleCallback();
    if (!fromCallback) {
      const session = await _getSession();
      if (session?.user) _user = session.user;
      else if (session?.access_token) {
        // Session exists but user missing — fetch it
        try {
          const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(session.access_token) });
          if (r.ok) { _user = await r.json(); _saveSession({ ...session, user: _user }); }
        } catch(e) { console.warn('[AUTH] user fetch failed', e); }
      }
    }

    _updateHeader();
    console.log('[AUTH] init done. user:', _user?.email || 'guest');

    if (fromCallback && _user) {
      const pending = sessionStorage.getItem('auth_pending_action');
      if (pending === 'order') {
        sessionStorage.removeItem('auth_pending_action');
        closeModal();
        setTimeout(() => ORDERS?.openOrderForm?.(), 300);
      }
    }
  }

  /* ── Header button ── */
  function _updateHeader() {
    const btn = document.getElementById('authHeaderBtn');
    if (!btn) { console.warn('[AUTH] #authHeaderBtn not found'); return; }
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.style.display = 'flex';

    if (_user) {
      const name   = _user.user_metadata?.full_name || _user.email?.split('@')[0] || 'Compte';
      const avatar = _user.user_metadata?.avatar_url;
      btn.title = name;
      btn.onclick = () => _toggleUserMenu();
      btn.innerHTML = avatar
        ? `<img src="${avatar}" alt="${name}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid #bfdbfe">`
        : `<div style="width:24px;height:24px;border-radius:50%;background:var(--bl);color:#fff;font-size:.6rem;font-weight:700;display:flex;align-items:center;justify-content:center">${name[0].toUpperCase()}</div>`;
    } else {
      btn.title = 'Se connecter';
      btn.onclick = () => openSignIn();
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }

  /* ── User menu ── */
  function _toggleUserMenu() {
    const ex = document.getElementById('authUserMenu');
    if (ex) { ex.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'authUserMenu';
    const name  = _user?.user_metadata?.full_name || _user?.email?.split('@')[0] || 'Compte';
    const email = _user?.email || '';
    const provider = _user?.app_metadata?.provider || 'email';
    const providerTag = provider === 'google'
      ? `<span style="font-size:.58rem;background:#eff6ff;color:#2563eb;border-radius:4px;padding:1px 6px;font-weight:600;display:inline-block;margin-top:2px">Google</span>`
      : `<span style="font-size:.58rem;background:#f0fdf4;color:#059669;border-radius:4px;padding:1px 6px;font-weight:600;display:inline-block;margin-top:2px">Magic Link</span>`;
    menu.innerHTML = `
      <div class="auth-menu-head">
        <div class="auth-menu-name">${name}</div>
        <div class="auth-menu-email">${email}</div>
        ${providerTag}
      </div>
      <div class="auth-menu-divider"></div>
      <button class="auth-menu-item" onclick="AUTH.openMyOrders()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        Mes commandes
      </button>
      <button class="auth-menu-item auth-menu-signout" onclick="AUTH.signOut()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Déconnexion
      </button>`;
    document.body.appendChild(menu);
    const btn  = document.getElementById('authHeaderBtn');
    const rect = btn.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;z-index:900`;
    setTimeout(() => {
      const close = e => { if (!menu.contains(e.target)&&e.target!==btn){menu.remove();document.removeEventListener('click',close);} };
      document.addEventListener('click', close);
    }, 50);
  }

  /* ── Sign-in modal ── */
  function openSignIn(afterFn) {
    _afterFn = afterFn || null;
    document.getElementById('authModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.innerHTML = `
      <div class="auth-modal-backdrop" onclick="AUTH.closeModal()"></div>
      <div class="auth-modal-box">
        <button class="auth-modal-close" onclick="AUTH.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <div class="auth-modal-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.63 123.79" style="height:22px;width:auto">
            <path fill="#696969" d="M191,123.79a62.31,62.31,0,0,0,31.07-8A59.36,59.36,0,0,0,244.5,93.65a62,62,0,0,0,8.26-31.84A62,62,0,0,0,244.5,30a58.88,58.88,0,0,0-22.39-22,65.43,65.43,0,0,0-62.41,0,59.26,59.26,0,0,0-22.56,22,61.44,61.44,0,0,0-8.34,31.84,61.44,61.44,0,0,0,8.34,31.84,59.93,59.93,0,0,0,22.56,22.14A62.66,62.66,0,0,0,191,123.79Zm0-35.25q-11.41,0-17.54-7.23t-6.13-19.5q0-12.44,6.13-19.67T191,34.91q11.24,0,17.37,7.23t6.13,19.67q0,12.25-6.13,19.5T191,88.54ZM259.57,2V32h31.67V122.6H329V32h32V2ZM451.63,32.18V2H371.26V122.6h80.37V92.46H409.07v-17h37.45V47H409.07V32.18Z"/>
            <path fill="#2563EB" d="M103.06,41.51a18.57,18.57,0,0,0,18.57-18.57V1M103.06,122.6A18.57,18.57,0,0,0,121.63,104v-22M40.54,41.51H81.09v22.3A18.24,18.24,0,0,1,62.85,82.05H40.54V122.6H0V1H40.54ZM121.63,1H81.09V41.51h22M121.63,82.05H81.09V122.6h22"/>
          </svg>
        </div>

        <!-- STEP 1: input -->
        <div id="authStep1">
          <h2 class="auth-modal-title">Suivez votre commande</h2>
          <p class="auth-modal-sub">Connectez-vous pour accéder à l'historique et au suivi de vos commandes.</p>

          <!-- Google -->
          <button class="auth-google-btn" onclick="AUTH._googleClick()">
            <svg viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </button>

          <div class="auth-divider"><span>ou par email</span></div>

          <div class="auth-email-wrap">
            <input class="auth-email-inp" id="authEmailInp" type="email"
              placeholder="votre@email.com" autocomplete="email"
              onkeydown="if(event.key==='Enter')AUTH._submitEmail()">
            <button class="auth-email-btn" id="authEmailBtn" onclick="AUTH._submitEmail()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Envoyer le lien
            </button>
          </div>
          <div class="auth-email-err" id="authEmailErr"></div>

          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">
            Continuer sans compte
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <p class="auth-modal-note">Sans compte, notre équipe vous contactera par téléphone.</p>
        </div>

        <!-- STEP 2: email sent -->
        <div id="authStep2" style="display:none">
          <div class="auth-sent-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5" width="32" height="32"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h2 class="auth-modal-title">Vérifiez votre email</h2>
          <p class="auth-modal-sub">Lien envoyé à <strong id="authSentEmail"></strong>. Cliquez dessus pour vous connecter instantanément.</p>
          <p class="auth-modal-note" style="margin-top:.6rem">Vérifiez aussi vos spams. Le lien expire dans 1 heure.</p>
          <button class="auth-guest-btn" style="margin-top:1rem;width:100%" onclick="AUTH._backToEmail()">← Changer d'adresse</button>
          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">Continuer sans compte <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('on');
      setTimeout(() => document.getElementById('authEmailInp')?.focus(), 220);
    });
  }

  function _googleClick() {
    sessionStorage.setItem('auth_pending_action', 'order');
    _signInWithGoogle();
  }

  async function _submitEmail() {
    const inp = document.getElementById('authEmailInp');
    const err = document.getElementById('authEmailErr');
    const btn = document.getElementById('authEmailBtn');
    const email = (inp?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      if (err) { err.textContent = 'Adresse email invalide.'; err.style.display = 'block'; }
      inp?.focus(); return;
    }
    if (err) err.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    sessionStorage.setItem('auth_pending_action', 'order');
    try {
      await _sendMagicLink(email);
      document.getElementById('authStep1').style.display = 'none';
      document.getElementById('authStep2').style.display = 'block';
      const el = document.getElementById('authSentEmail');
      if (el) el.textContent = email;
    } catch(e) {
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    }
  }

  function _backToEmail() {
    document.getElementById('authStep1').style.display = 'block';
    document.getElementById('authStep2').style.display = 'none';
    const btn = document.getElementById('authEmailBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    setTimeout(() => document.getElementById('authEmailInp')?.focus(), 80);
  }

  function closeModal() {
    const m = document.getElementById('authModal');
    if (!m) return;
    m.classList.remove('on');
    setTimeout(() => m.remove(), 200);
  }

  function _continueAsGuest() {
    closeModal();
    sessionStorage.removeItem('auth_pending_action');
    if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
  }

  /* ── My Orders drawer ── */
  async function openMyOrders() {
    document.getElementById('authUserMenu')?.remove();
    const ex = document.getElementById('myOrdersPanel');
    if (ex) { ex.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'myOrdersPanel';
    panel.innerHTML = `
      <div class="my-orders-backdrop" onclick="document.getElementById('myOrdersPanel').remove()"></div>
      <div class="my-orders-drawer">
        <div class="my-orders-hdr">
          <div class="my-orders-title">Mes commandes</div>
          <button class="auth-modal-close" onclick="document.getElementById('myOrdersPanel').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="my-orders-body" id="myOrdersBody">
          <div class="my-orders-loading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" style="opacity:.3;animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Chargement…
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('on'));
    await _loadMyOrders();
  }

  async function _loadMyOrders() {
    const body = document.getElementById('myOrdersBody');
    if (!body || !_user) return;
    const session = await _getSession();
    if (!session?.access_token) return;
    try {
      const r = await fetch(
        `${_url()}/rest/v1/kote_orders?user_id=eq.${_user.id}&select=*&order=created_at.desc`,
        { headers: _hdrs(session.access_token) }
      );
      if (!r.ok) throw new Error('HTTP '+r.status);
      const orders = await r.json();
      if (!orders.length) {
        body.innerHTML = `<div class="my-orders-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="32" height="32" style="opacity:.2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>Aucune commande pour le moment</p></div>`;
        return;
      }
      body.innerHTML = orders.map(_renderRow).join('');
    } catch(e) {
      body.innerHTML = `<div class="my-orders-empty" style="color:#dc2626">Erreur — ${e.message}</div>`;
    }
  }

  const _SL = {nouveau:'Nouveau',en_cours:'En cours',en_impression:'Impression',finition:'Finition',pret:'Prêt',livre:'Livré',annule:'Annulé'};
  const _SC = {nouveau:'#f59e0b',en_cours:'#2563eb',en_impression:'#7c3aed',finition:'#0891b2',pret:'#16a34a',livre:'#059669',annule:'#dc2626'};
  const _f = n => (n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});

  function _renderRow(o) {
    const st  = o.status||'nouveau', col=_SC[st]||'#9ca3af', lbl=_SL[st]||st;
    const d   = o.created_at ? new Date(o.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    const ttc = o.total_ttc||Math.round((o.total_ht||0)*1.2*100)/100;
    const preview = (o.payload?.items||[]).slice(0,2).map(i=>i.prodName).join(', ') + ((o.payload?.items||[]).length>2?` +${(o.payload?.items||[]).length-2}`:'');
    return `<div class="my-order-row" onclick="window.open('tracking.html?ref=${encodeURIComponent(o.ref)}','_blank')">
      <div class="my-order-top">
        <span class="my-order-ref">${o.ref}</span>
        <span class="my-order-badge" style="color:${col};background:${col}18;border-color:${col}35"><span style="width:5px;height:5px;border-radius:50%;background:${col};display:inline-block;margin-right:4px;vertical-align:middle"></span>${lbl}</span>
      </div>
      <div class="my-order-desc">${preview||'—'}</div>
      <div class="my-order-foot"><span class="my-order-date">${d}</span><span class="my-order-total">${_f(ttc)} DH TTC</span></div>
    </div>`;
  }

  /* ── Sign out ── */
  function signOut() {
    document.getElementById('authUserMenu')?.remove();
    const s = JSON.parse(localStorage.getItem(_storageKey())||'{}');
    _clearSession(); _updateHeader();
    if (s.access_token) fetch(`${_url()}/auth/v1/logout`,{method:'POST',headers:_hdrs(s.access_token)}).catch(()=>{});
  }

  function getUser()   { return _user; }
  function getUserId() { return _user?.id || null; }

  return {
    init, openSignIn, closeModal, signOut,
    openMyOrders, getUser, getUserId,
    _submitEmail, _backToEmail, _continueAsGuest, _googleClick,
  };
})();


/* ════ orders.js ════ */
/* ════════════════════════════════════════════════════════
   ORDERS  — client order form + kote_orders Supabase push
   Used by client.html only (ROLE === 'client').

   Public API:
     ORDERS.open(quoteSnapshot)  — show order form with quote attached
     ORDERS.submit()             — validate + push + show confirmation
     ORDERS.close()              — dismiss overlay
   ════════════════════════════════════════════════════════ */
const ORDERS = (() => {

  let _q = null;   // quote snapshot passed from CART

  /* ── Supabase POST helper ── */
  async function _push(row) {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/kote_orders`, {
      method: 'POST',
      headers: {
        'apikey':        window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${txt}`);
    }
  }

  /* ── Field value helper ── */
  const _val = id => ($('ord-' + id)?.value || '').trim();

  /* ── Resolve totals — city chosen in form overrides snapshot delivery fee ── */
  function _getTotals() {
    const sub    = _q?.totals?.sub    ?? (_q?.totals?.grand ?? 0);
    const surAmt = _q?.totals?.surAmt ?? 0;
    // City chosen in order form takes priority over cart snapshot estimate
    const del    = _ordCityChosen != null
                 ? (_ordCityChosen.fee || 0)
                 : (_q?.totals?.del ?? 0);
    const grand  = Math.round((sub + surAmt + del) * 100) / 100;
    const tva    = Math.round(grand * 0.20 * 100) / 100;
    const ttc    = Math.round((grand + tva) * 100) / 100;
    return { sub, surAmt, del, grand, tva, ttc };
  }

  /* ── Re-render totals strip live (called on city pick/clear) ── */
  function _refreshSummary() {
    const summaryEl = $('ordBox')?.querySelector('.ord-summary');
    if (!summaryEl) return;
    const { del, surAmt, grand, ttc } = _getTotals();
    const truckIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
    const itemRows = (_q?.items || []).map(i => {
      const concLine = i.snap?.designOption === 'service' && i.snap?.designTier && i.snap?.designCost
        ? `<div class="ord-item-row ord-item-service">
             <span class="ord-item-name">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" style="flex-shrink:0;margin-right:.3rem;color:var(--pu,#7c3aed)"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</span>
           </div>`
        : '';
      return `<div class="ord-item-row">
        <span class="ord-item-name">${i.prodName}</span>
        <span class="ord-item-spec">${i.specs || ''}</span>
        <span class="ord-item-qty">${fmtN(i.quantity)} × ${fmt(i.perUnit)} DH</span>
      </div>${concLine}`;
    }).join('');
    summaryEl.innerHTML = `
      <div class="ord-items">${itemRows}</div>
      <div class="ord-totals">
        ${surAmt > 0 ? `<div class="ord-total-row"><span style="color:var(--am)">Délai express</span><strong style="color:var(--am)">+${fmt(surAmt)} DH</strong></div>` : ''}
        ${del > 0 ? `<div class="ord-total-row"><span style="display:flex;align-items:center;gap:5px;color:var(--t2)">${truckIco}Livraison${_ordCityChosen ? ' — ' + _ordCityChosen.label : ''}</span><strong>+${fmt(del)} DH</strong></div>` : ''}
        <div class="ord-total-row"><span>Total HT</span><strong>${fmt(grand)} DH</strong></div>
        <div class="ord-total-row ord-total-ttc"><span>Total TTC (TVA 20%)</span><strong>${fmt(ttc)} DH</strong></div>
      </div>`;
  }

  /* ── Render form content ── */
  function _renderForm() {
    const box = $('ordBox');
    if (!box) return;

    const itemRows = (_q?.items || []).map(i => {
      const concLine = i.snap?.designOption === 'service' && i.snap?.designTier && i.snap?.designCost
        ? `<div class="ord-item-row ord-item-service">
             <span class="ord-item-name">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" style="flex-shrink:0;margin-right:.3rem;color:var(--pu,#7c3aed)"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</span>
           </div>`
        : '';
      return `<div class="ord-item-row">
        <span class="ord-item-name">${i.prodName}</span>
        <span class="ord-item-spec">${i.specs || ''}</span>
        <span class="ord-item-qty">${fmtN(i.quantity)} × ${fmt(i.perUnit)} DH</span>
      </div>${concLine}`;
    }).join('');

    const { grand, del, surAmt, tva, ttc } = _getTotals();

    box.innerHTML = `
      <div class="ord-hdr">
        <div class="ord-hdr-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            style="width:15px;height:15px;color:var(--bl)">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <div class="ord-hdr-text">
          <div class="ord-hdr-title">Confirmer la demande</div>
          <div class="ord-hdr-sub">Vos coordonnées · Réf ${_q?.ref || '—'}</div>
        </div>
        <button class="inv-x" onclick="ORDERS.close()" title="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Summary strip -->
      <div class="ord-summary">
        <div class="ord-items">${itemRows}</div>
        <div class="ord-totals">
          ${surAmt > 0 ? `<div class="ord-total-row"><span style="color:var(--am)">Délai express</span><strong style="color:var(--am)">+${fmt(surAmt)} DH</strong></div>` : ''}
          ${del > 0 ? `<div class="ord-total-row"><span style="display:flex;align-items:center;gap:5px;color:var(--t2)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</span><strong>+${fmt(del)} DH</strong></div>` : ''}
          <div class="ord-total-row">
            <span>Total HT</span>
            <strong>${fmt(grand)} DH</strong>
          </div>
          <div class="ord-total-row ord-total-ttc">
            <span>Total TTC (TVA 20%)</span>
            <strong>${fmt(ttc)} DH</strong>
          </div>
        </div>
      </div>

      <!-- Client form -->
      <div class="ord-form">
        <div class="ord-form-title">Vos coordonnées</div>

        <div class="ord-field-row">
          <div class="ord-field">
            <label class="ord-lbl" for="ord-nom">Nom complet <span class="ord-req">*</span></label>
            <input id="ord-nom" class="ord-inp" type="text"
              placeholder="Prénom Nom / Raison sociale" autocomplete="name">
          </div>
          <div class="ord-field">
            <label class="ord-lbl" for="ord-tel">Téléphone <span class="ord-req">*</span></label>
            <input id="ord-tel" class="ord-inp" type="tel"
              placeholder="+212 6XX XXX XXX" autocomplete="tel">
          </div>
        </div>

        <div class="ord-field-row">
          <div class="ord-field">
            <label class="ord-lbl" for="ord-email">Email</label>
            <input id="ord-email" class="ord-inp" type="email"
              placeholder="exemple@domaine.ma" autocomplete="email">
          </div>
        </div>

        ${del > 0 ? `
        <div class="ord-city-banner" id="ordCityBanner">
          <div class="ord-city-banner-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              width="16" height="16" style="color:var(--bl)">
              <rect x="1" y="3" width="15" height="13" rx="1"/>
              <path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0">
            <div class="ord-city-banner-title">Choisissez votre ville de livraison</div>
            <div class="ord-city-banner-sub">Le tarif exact sera ajouté à votre commande</div>
          </div>
        </div>
        <div class="ord-field">
          <div class="ord-city-wrap" id="ordCityWrap">
            <div style="position:relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);
                width:13px;height:13px;color:var(--t3);pointer-events:none">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input id="ord-ville" class="ord-inp" type="text" style="padding-left:2rem"
                placeholder="Rechercher votre ville…" autocomplete="off"
                oninput="ORDERS._filterCities(this.value)"
                onfocus="ORDERS._openCityDrop()">
            </div>
            <div class="ord-city-drop" id="ordCityDrop" style="display:none"></div>
            <div class="ord-city-chosen" id="ordCityChosen" style="display:none"></div>
            <div class="ord-delivery-hint" id="ordDeliveryHint" style="display:none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                width="12" height="12"><rect x="1" y="3" width="15" height="13" rx="1"/>
                <path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/></svg>
              <span id="ordDeliveryHintText"></span>
            </div>
          </div>
        </div>` : ''}

        ${del > 0 ? `<div class="ord-field">
          <label class="ord-lbl" for="ord-adresse">Adresse de livraison <span class="ord-req">*</span></label>
          <input id="ord-adresse" class="ord-inp" type="text"
            placeholder="N°, rue, quartier…" autocomplete="street-address">
        </div>` : ''}

        <div class="ord-field">
          <label class="ord-lbl" for="ord-note">Note additionnelle</label>
          <textarea id="ord-note" class="ord-inp ord-textarea"
            placeholder="Délai souhaité, informations complémentaires…"
            rows="2"></textarea>
        </div>

        <div class="ord-err" id="ordErr"></div>

        <div class="ord-actions">
          <button class="btn btn-outline" style="height:36px;font-size:.72rem"
            onclick="ORDERS.close()">Annuler</button>
          <button class="btn btn-p" id="ordSubmitBtn" style="height:36px;font-size:.72rem;min-width:160px;overflow:hidden;position:relative"
            onclick="ORDERS.submit()">
            <span class="btn-slot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="width:13px;height:13px">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Envoyer la demande
            </span>
          </button>
        </div>
      </div>`;
  }

  /* ── Telegram notification (fire-and-forget) ── */
  function _tgNotify(row) {
    const c = (typeof DB !== 'undefined' && DB?.contact) || {};
    if (!c.tg_enabled || !c.tg_token || !c.tg_chat_id) return;
    const p     = row.payload || {};
    const items = p.items || [];
    const ttc   = row.total_ttc || Math.round((row.total_ht||0)*1.20*100)/100;
    const del   = p.totals?.del > 0 ? '🚚 Livraison' : '🏪 Retrait';
    const lines = [
      `🛎 <b>Nouvelle commande — ${row.ref}</b>`,
      `👤 ${row.client_nom || '—'}${row.client_tel ? ' · ' + row.client_tel : ''}`,
      '',
      ...items.map(i => `📦 ${i.prodName} × ${i.quantity}`),
      '',
      `💰 ${(row.total_ht||0).toLocaleString('fr-MA',{minimumFractionDigits:2})} DH HT · ${del}`,
      `💵 TTC : ${ttc.toLocaleString('fr-MA',{minimumFractionDigits:2})} DH`,
    ].join('\n');
    fetch(`https://api.telegram.org/bot${c.tg_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.tg_chat_id, text: lines, parse_mode: 'HTML' }),
    }).catch(() => {}); // silent — never block the order flow
  }
  let _ordCityChosen = null;

  function _openCityDrop() {
    _renderCityDrop('');
    const drop = $('ordCityDrop');
    if (drop) drop.style.display = 'block';
    setTimeout(() => {
      document.addEventListener('click', function _cc(e) {
        if (!e.target.closest('#ordCityWrap')) {
          const d = $('ordCityDrop'); if (d) d.style.display='none';
          document.removeEventListener('click', _cc);
        }
      });
    }, 0);
  }

  function _filterCities(q) {
    _renderCityDrop(q);
    const drop = $('ordCityDrop');
    if (drop) drop.style.display = 'block';
    // If cleared, un-choose
    if (!q.trim()) { _ordCityChosen=null; _updateCityChosen(); }
  }

  function _renderCityDrop(q) {
    const drop = $('ordCityDrop'); if (!drop) return;
    const cities = (typeof DB !== 'undefined' && DB.delivery_cities) || [];
    const sq = q.toLowerCase().trim();
    const results = sq ? cities.filter(c=>c.label.toLowerCase().includes(sq)).slice(0,20)
                       : cities.slice(0,20);
    drop.innerHTML = results.length
      ? results.map(c=>`<div class="ord-city-item" onclick="ORDERS._chooseCity('${c.id}')">
          <span>${c.label}</span>
          <span style="font-size:.65rem;font-weight:700;color:var(--bl)">${c.fee} DH</span>
        </div>`).join('')
      : `<div class="ord-city-empty">Aucune ville trouvée</div>`;
  }

  function _chooseCity(id) {
    const cities = (typeof DB !== 'undefined' && DB.delivery_cities) || [];
    _ordCityChosen = cities.find(c=>c.id===id) || null;
    const inp = $('ord-ville');
    if (inp && _ordCityChosen) inp.value = _ordCityChosen.label;
    const drop = $('ordCityDrop'); if (drop) drop.style.display='none';
    _updateCityChosen();
  }

  function _updateCityChosen() {
    const chosen = $('ordCityChosen');
    const hint   = $('ordDeliveryHint');
    const hintTxt= $('ordDeliveryHintText');
    if (!chosen) return;
    if (_ordCityChosen) {
      chosen.style.display = 'flex';
      chosen.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="color:var(--gn)"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${_ordCityChosen.label}</span>
        <span style="font-weight:700;color:var(--bl)">${_ordCityChosen.fee} DH</span>
        <button onclick="ORDERS._clearCity()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--t3);font-size:.65rem">✕</button>`;
      if (hint && hintTxt) {
        hint.style.display='flex';
        hintTxt.textContent = _ordCityChosen.fee > 0
          ? `Livraison vers ${_ordCityChosen.label} : +${_ordCityChosen.fee} DH${_ordCityChosen.days ? ' · '+_ordCityChosen.days : ''}`
          : `Livraison gratuite vers ${_ordCityChosen.label}`;
      }
    } else {
      chosen.style.display = 'none';
      if (hint) hint.style.display='none';
    }
    // Refresh totals strip to reflect city change
    _refreshSummary();
  }

  function _clearCity() {
    _ordCityChosen = null;
    const inp = $('ord-ville'); if (inp) inp.value='';
    _updateCityChosen();
  }

  /* ── Open (intercepts for auth) ── */
  function open(quoteSnapshot) {
    _q = quoteSnapshot;

    // If user is already signed in, go straight to form
    if (typeof AUTH !== 'undefined' && AUTH.getUser()) {
      _openForm();
      return;
    }

    // Otherwise show sign-in prompt first
    if (typeof AUTH !== 'undefined') {
      AUTH.openSignIn(() => _openForm());
    } else {
      _openForm(); // fallback if AUTH not loaded
    }
  }

  function _openForm() {
    _renderForm();
    const ovl = $('ordOverlay');
    const box = $('ordBox');
    if (ovl) ovl.classList.add('open');
    if (box) { box.style.transform = 'translateY(0)'; }
    // Pre-fill from Google profile if signed in
    if (typeof AUTH !== 'undefined') {
      const user = AUTH.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const nomField   = $('ord-nom');
        const emailField = $('ord-email');
        if (nomField   && !nomField.value)   nomField.value   = meta.full_name || '';
        if (emailField && !emailField.value) emailField.value = user.email     || '';
      }
    }
    setTimeout(() => {
      const nom = $('ord-nom');
      if (nom && !nom.value) nom.focus();
      else $('ord-tel')?.focus();
    }, 120);
  }

  /* ── Close ── */
  function close() {
    $('ordOverlay')?.classList.remove('open');
  }

  /* ── Submit ── */
  async function submit() {
    const nom     = _val('nom');
    const tel     = _val('tel');
    const email   = _val('email');
    const ville   = _ordCityChosen ? _ordCityChosen.label : _val('ville');
    const adresse = _val('adresse');
    const note    = _val('note');

    /* Validate required fields */
    const { grand, del, surAmt, tva, ttc } = _getTotals();
    const err = $('ordErr');
    if (!nom)  { if (err) { err.textContent = 'Le nom est requis.'; err.classList.add('on'); } $('ord-nom')?.focus(); return; }
    if (!tel)  { if (err) { err.textContent = 'Le téléphone est requis.'; err.classList.add('on'); } $('ord-tel')?.focus(); return; }
    if ((del > 0 || _ordCityChosen) && !adresse) {
      if (err) { err.textContent = "L'adresse de livraison est requise."; err.classList.add('on'); }
      $('ord-adresse')?.focus(); return;
    }
    if (err) err.classList.remove('on');

    /* Loading state */
    const btn  = $('ordSubmitBtn');
    const slot = btn?.querySelector('.btn-slot');
    const origHTML = slot?.innerHTML;
    if (btn && slot) {
      btn.disabled = true;
      slot.classList.add('slide-out');
      const loading = document.createElement('span');
      loading.className = 'btn-slot-success';
      loading.textContent = '⏳ Envoi…';
      btn.appendChild(loading);
      requestAnimationFrame(() => loading.classList.add('slide-in'));
    }

    const row = {
      ref:            _q?.ref || ('KTE-' + Date.now().toString(36).toUpperCase().slice(-6)),
      status:         'nouveau',
      client_nom:     nom,
      client_tel:     tel,
      client_email:   email,
      client_ville:   ville,
      client_adresse: adresse,
      total_ht:       grand,
      total_ttc:      ttc,
      user_id:        (typeof AUTH !== 'undefined' ? AUTH.getUserId() : null),
      source:         (typeof ROLE !== 'undefined' && ROLE === 'provider') ? 'admin' : 'client',
      payload: {
        ..._q,
        client: { nom, tel, email, ville, adresse, note },
      },
    };

    try {
      await _push(row);
      _tgNotify(row); // fire-and-forget — never blocks
    } catch(e) {
      console.error('ORDERS.submit push failed:', e);
      if (btn && slot) {
        btn.disabled = false;
        slot.classList.remove('slide-out');
        btn.querySelector('.btn-slot-success')?.remove();
      }
      if (err) {
        err.textContent = `Erreur d'envoi — vérifiez votre connexion. (${e.message})`;
        err.classList.add('on');
      }
      return;
    }

    /* Show success animation on button briefly before navigating */
    if (btn && slot) {
      const loadingEl = btn.querySelector('.btn-slot-success');
      if (loadingEl) { loadingEl.textContent = '✓ Envoyé !'; }
    }
    await new Promise(r => setTimeout(r, 420));

    /* Build WhatsApp notification link for provider */
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    const d = new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});
    const waLines = [
      `Kote Imprimerie — Nouvelle commande`,
      `Ref : ${row.ref}  |  ${d}`,
      ``,
      `Client : ${nom}`,
      `Tel    : ${tel}`,
      email   ? `Email  : ${email}`   : null,
      adresse ? `Adresse: ${adresse}${ville ? ', '+ville : ''}` : null,
      ``,
      `Produits`,
      `--------`,
      ...(_q?.items || []).map(i => `- ${fmtN(i.quantity)} x ${i.prodName} : ${fmt(i.baseTotal)} DH`),
      ``,
      // Design requests summary
      ...(_q?.items || []).flatMap(i => {
        if (!i.snap) return [];
        if (i.snap.designOption === 'service' && i.snap.designTier) {
          const tLabel = { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier;
          return [`Conception ${tLabel} (${i.snap.designCost || 0} DH) — ${i.prodName}`];
        }
        if (i.snap.designOption === 'file' && i.snap.designFileName) {
          return [`Fichier fourni : ${i.snap.designFileName} — ${i.prodName}`];
        }
        return [];
      }),
      `Total HT  : ${fmt(grand)} DH`,
      `Total TTC : ${fmt(ttc)} DH`,
      note ? `\nNote : ${note}` : null,
    ].filter(l => l !== null).join('\n');

    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`
      : null;

    /* Close form overlay */
    close();

    /* Render success confirmation */
    _renderSuccess(row, waUrl, { nom, tel, email, ville, adresse, note });
    UI.show('vConfirm');
  }

  /* ── Success screen ── */
  function _renderSuccess(row, waUrl, client) {
    const grand  = row.total_ht;
    const ttc    = row.total_ttc;
    const del    = row.payload?.totals?.del   ?? 0;
    const surAmt = row.payload?.totals?.surAmt ?? 0;
    const d      = new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});
    const truckSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

    $('confirmBox').innerHTML = `
      <div class="cf-ico" style="color:var(--gn)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          style="width:28px;height:28px">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 class="cf-title">Demande envoyée !</h2>
      <p class="cf-sub">
        Notre équipe vous contactera sous 24h au
        <strong>${client.tel}</strong>.
      </p>

      <div class="ref-box">
        <div class="ref-lbl">Référence</div>
        <div class="ref-val">${row.ref}</div>

        <!-- Items summary -->
        <table class="cf-table">
          <thead><tr>
            <th>Désignation</th>
            <th class="cf-td-num">Qté</th>
            <th class="cf-td-num">Total HT</th>
          </tr></thead>
          <tbody>
            ${(_q?.items || []).map(i => `
              <tr>
                <td>
                  <strong>${i.prodName}</strong>
                  ${i.specs ? `<br><span style="font-size:.59rem;color:var(--t2);font-weight:400">${i.specs}</span>` : ''}
                  ${i.notes ? `<br><em style="font-size:.57rem;color:var(--t3)">"${i.notes}"</em>` : ''}
                </td>
                <td class="cf-td-num">${fmtN(i.quantity)}</td>
                <td class="cf-td-num" style="color:var(--bl);font-weight:700">${fmt(i.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${(_q?.items||[]).filter(i=>i.snap?.designOption==='service'&&i.snap?.designCost).map(i=>`
              <tr>
                <td style="color:var(--pu,#7c3aed)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="9" height="9" style="vertical-align:middle;margin-right:3px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
                  Conception ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier]||i.snap.designTier }
                </td>
                <td class="cf-td-num" colspan="1"></td>
                <td class="cf-td-num" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</td>
              </tr>`).join('')}
            ${surAmt > 0 ? `<tr><td style="text-align:right;color:var(--am)" colspan="2">Délai express</td><td class="cf-td-num" style="color:var(--am)">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0 ? `<tr><td style="text-align:right;color:var(--t2)" colspan="2"><span style="display:inline-flex;align-items:center;gap:4px">${truckSVG}Livraison</span></td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td style="text-align:right;color:var(--t2)" colspan="2">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td style="text-align:right;color:var(--t2)" colspan="2">TVA 20%</td>
              <td class="cf-td-num" style="color:var(--t2)">${fmt(ttc - grand)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td style="text-align:right" colspan="2">Total TTC</td>
              <td class="cf-td-num">${fmt(ttc)} DH</td>
            </tr>
          </tfoot>
        </table>

        <!-- Client details recap -->
        <div class="ord-recap">
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${client.nom}</span>
          </div>
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.1 .86a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span>${client.tel}</span>
          </div>
          ${client.email ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>${client.email}</span>
          </div>` : ''}
          ${client.adresse ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${client.adresse}${client.ville ? ', '+client.ville : ''}</span>
          </div>` : `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            <span style="color:var(--t3)">Retrait en boutique</span>
          </div>`}
        </div>
      </div>

      <!-- Actions -->
      <div class="cf-btns">
        ${waUrl
          ? `<a class="cf-ico-btn cf-wa-btn" href="${waUrl}" target="_blank" rel="noopener">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
               <span>Notifier par WhatsApp</span>
             </a>`
          : ''
        }
        ${(() => {
          // Designer WA button — only if order has a conception service item
          const designItems = (_q?.items || []).filter(i => i.snap?.designOption === 'service' && i.snap?.designTier);
          const waDesigner = (DB?.contact?.designer_whatsapp || '').replace(/\D/g, '');
          if (!designItems.length || !waDesigner) return '';
          const tierLabels = { basic:'Basic', pro:'Pro', premium:'Premium' };
          const lines = designItems.map(i => `${i.prodName} — Niveau ${tierLabels[i.snap.designTier] || i.snap.designTier} (${fmt(i.snap.designCost || 0)} DH)`).join(', ');
          const msg = encodeURIComponent(`Bonjour, je viens de passer une commande (réf: ${row.ref}) avec une demande de conception graphique : ${lines}. Pouvez-vous me contacter ?`);
          return `<a class="cf-ico-btn" href="https://wa.me/${waDesigner}?text=${msg}" target="_blank" rel="noopener"
            style="background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe;text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            <span>Contacter le graphiste</span>
          </a>`;
        })()}
        ${(typeof AUTH !== 'undefined' && AUTH.getUser())
          ? `<button class="cf-ico-btn" onclick="AUTH.openMyOrders()" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
               <span>Mes commandes</span>
             </button>`
          : `<a class="cf-ico-btn" href="tracking.html?ref=${row.ref}" target="_blank" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe;text-decoration:none">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
               <span>Suivre ma commande</span>
             </a>`
        }
      </div>

      <div style="margin-top:.7rem">
        <button class="btn-xs" onclick="afterCheckout()">← Faire une autre demande</button>
      </div>`;
  }

  return { open, openOrderForm: _openForm, close, submit, _filterCities, _openCityDrop, _chooseCity, _clearCity, _refreshSummary };
})();


/* ══════════════════════════════════════════════════════════
   BOOT — runs last after all page scripts are loaded
   ══════════════════════════════════════════════════════════ */
DB_MOD.tryRestore();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = document.createElement('div');
          bar.className = 'update-bar';
          bar.innerHTML = `Nouvelle version disponible — <button onclick="location.reload()">Actualiser</button>`;
          document.body.appendChild(bar);
          nw.postMessage('SKIP_WAITING');
        }
      });
    });
  }).catch(e => console.warn('[SW] Registration failed:', e));
}

function _setOffline(isOffline) {
  const bar = $('offlineBar');
  if (bar) bar.style.display = isOffline ? 'flex' : 'none';
}
window.addEventListener('offline', () => _setOffline(true));
window.addEventListener('online',  () => _setOffline(false));
_setOffline(!navigator.onLine);
