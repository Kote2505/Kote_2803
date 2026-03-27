'use strict';

/* ════ sheetSVG (moved from admin.js) ════ */
/* ════════════════════════════════════════════════════════
   SHEET SVG  — imposition preview renderer (pure, returns string)
   ════════════════════════════════════════════════════════ */
function sheetSVG(fit, iW, iH, sh, opts = {}) {
  const SC = 98 / sh.w;
  const W  = Math.round(sh.w * SC), H = Math.round(sh.h * SC);
  const mg = sh.margin * SC, bl = sh.bleed * SC;
  const cW = fit.rotated ? (iH + sh.bleed*2)*SC : (iW + sh.bleed*2)*SC;
  const cH = fit.rotated ? (iW + sh.bleed*2)*SC : (iH + sh.bleed*2)*SC;
  const tW = cW - bl*2, tH = cH - bl*2;
  let pieces = '', folds = '', pages = '';

  for (let r = 0; r < fit.rows; r++) for (let col = 0; col < fit.cols; col++) {
    const x = mg + col*cW, y = mg + r*cH;
    const tx = x + bl, ty = y + bl;
    pieces += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cW.toFixed(1)}" height="${cH.toFixed(1)}" fill="#BFDBFE" rx=".5"/>`;
    pieces += `<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tW.toFixed(1)}" height="${tH.toFixed(1)}" fill="#2563EB" rx=".3"/>`;

    if (opts.folds > 1) {
      const n = opts.folds, portrait = tH > tW;
      for (let f = 1; f < n; f++) {
        if (portrait) {
          const ly = (ty + f*tH/n).toFixed(1);
          folds += `<line x1="${tx.toFixed(1)}" y1="${ly}" x2="${(tx+tW).toFixed(1)}" y2="${ly}" stroke="rgba(255,255,255,.6)" stroke-width=".9" stroke-dasharray="2 1.4"/>`;
        } else {
          const lx = (tx + f*tW/n).toFixed(1);
          folds += `<line x1="${lx}" y1="${ty.toFixed(1)}" x2="${lx}" y2="${(ty+tH).toFixed(1)}" stroke="rgba(255,255,255,.6)" stroke-width=".9" stroke-dasharray="2 1.4"/>`;
        }
      }
    }

    if (opts.pageGrid) {
      const { cols: pc, rows: pr } = opts.pageGrid;
      const pw = tW/pc, ph = tH/pr;
      for (let pr2 = 0; pr2 < pr; pr2++) for (let pc2 = 0; pc2 < pc; pc2++) {
        const px = tx + pc2*pw, py = ty + pr2*ph;
        const fill = (pr2+pc2)%2===0 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)';
        pages += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(pw-.4).toFixed(1)}" height="${(ph-.4).toFixed(1)}" fill="${fill}" rx=".2"/>`;
        if (pw > 8 && ph > 6) {
          const pnum = r*fit.cols*pc*pr + col*pc*pr + pr2*pc + pc2 + 1;
          pages += `<text x="${(px+pw/2).toFixed(1)}" y="${(py+ph/2+1.5).toFixed(1)}" font-size="3" fill="rgba(255,255,255,.7)" text-anchor="middle" font-family="sans-serif">${pnum}</text>`;
        }
      }
      for (let pc2 = 1; pc2 < pc; pc2++) {
        const lx = (tx + pc2*pw).toFixed(1);
        pages += `<line x1="${lx}" y1="${ty.toFixed(1)}" x2="${lx}" y2="${(ty+tH).toFixed(1)}" stroke="rgba(255,255,255,.4)" stroke-width=".5"/>`;
      }
      for (let pr2 = 1; pr2 < pr; pr2++) {
        const ly = (ty + pr2*ph).toFixed(1);
        pages += `<line x1="${tx.toFixed(1)}" y1="${ly}" x2="${(tx+tW).toFixed(1)}" y2="${ly}" stroke="rgba(255,255,255,.4)" stroke-width=".5"/>`;
      }
    }
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:3px;flex-shrink:0">
    <rect width="${W}" height="${H}" fill="#EEF2F7"/>
    <rect x="${mg.toFixed(1)}" y="${mg.toFixed(1)}" width="${(W-mg*2).toFixed(1)}" height="${(H-mg*2).toFixed(1)}" fill="white"/>
    ${pieces}${folds}${pages}</svg>`;
}

/* ════════════════════════════════════════════════════════
   ADMIN  — password guard + full configuration panel
   ════════════════════════════════════════════════════════ */

/* ════ globals.js ════ */
/* ════════════════════════════════════════════════════════
   CONSTANTS & GLOBALS
   ════════════════════════════════════════════════════════ */
const APP_VERSION = 'kote-v9.6';

// Shared mutable state — kept minimal and explicit
let DB       = null;   // loaded data.json
let curProd  = null;   // currently configured product
let curSel   = {};     // current selection state
let editId   = null;   // cart item being edited (null = new)
let detailOpen = false;

/* DOM shortcut */
const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════
   FORMATTERS  (pure, no side-effects)
   ════════════════════════════════════════════════════════ */
const fmt  = n => n.toLocaleString('fr-MA', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtN = n => n.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0');

/* ════════════════════════════════════════════════════════
   ICONS  (SVG sprite map, keyed by name)
   ════════════════════════════════════════════════════════ */
const IC = (() => {
  const s = (d, sw=1.75) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}">${d}</svg>`;
  return {
    'credit-card': s('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    'file-text':   s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    'layout':      s('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="13" y1="21" x2="13" y2="9"/>'),
    'book-open':   s('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>'),
    'book':        s('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>'),
    'tag':         s('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    'image':       s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
    'scroll':      s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/>'),
    'flag':        s('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    'pen-tool':    s('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'),
    'check':       s('<polyline points="20 6 9 17 4 12"/>', 2.5),
    'cart':        s('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>', 2),
    'chev-r':      s('<path d="M9 18l6-6-6-6"/>', 2),
    'chev-d':      s('<path d="M6 9l6 6 6-6"/>', 2),
    'trash':       s('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>', 1.8),
    'edit':        s('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>', 1.8),
    'truck':       s('<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>', 1.8),
    'arrow-l':     s('<path d="M19 12H5M12 5l-7 7 7 7"/>', 2),
    'info':        s('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 2),
    'plus':        s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2),
    'alert':       s('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 2),
    'file-plus':   s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>', 1.8),
    'layers':      s('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    'printer':     s('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    'clock':       s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    'wifi-off':    s('<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>'),
    'whatsapp':    s('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>', 1.8),
    'mail':        s('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', 1.8),
  };
})();

/* ════════════════════════════════════════════════════════
   SECTION_CATALOG  — master vocabulary of all section types
   Used by the admin section builder + DB migration
   ════════════════════════════════════════════════════════ */
const SECTION_CATALOG = [
  { id:'size',            label:'Formats / Tailles',      icon:'layout',    group:'structure',  configurable:true,  desc:'Sélection du format'              },
  { id:'paper',           label:'Papier',                 icon:'file-text', group:'materials',  configurable:true,  desc:'Papier standard + spéciaux'       },
  { id:'sides',           label:'Recto / Recto-Verso',    icon:'layers',    group:'structure',  configurable:false, desc:'Mode d\'impression'               },
  { id:'lam',             label:'Pelliculage',             icon:'tag',       group:'finish',     configurable:true,  desc:'Finition de surface'              },
  { id:'addon',           label:'Façonnage & finitions',  icon:'flag',      group:'finish',     configurable:true,  desc:'Options spéciales'                },
  { id:'qty',             label:'Quantité',               icon:'scroll',    group:'order',      configurable:true,  desc:'Paliers de quantité'              },
  { id:'notes',           label:'Notes & instructions',   icon:'file-plus', group:'order',      configurable:false, desc:'Champ texte libre'                },
  { id:'depl-format',     label:'Format dépliant',        icon:'scroll',    group:'structure',  configurable:true,  desc:'Format ouvert + pliage'           },
  { id:'cat-pages',       label:'Nombre de pages',        icon:'book',      group:'structure',  configurable:true,  desc:'Sélecteur de pages catalogue'     },
  { id:'cat-int',         label:'Intérieur catalogue',    icon:'layers',    group:'materials',  configurable:true,  desc:'Papier + finition intérieur'      },
  { id:'cat-cov',         label:'Couverture catalogue',   icon:'book-open', group:'materials',  configurable:true,  desc:'Papier + finition couverture'     },
  { id:'cat-bind',        label:'Reliure',                icon:'book',      group:'structure',  configurable:false, desc:'Type de reliure'                  },
  { id:'gf-material',     label:'Matière grand format',   icon:'image',     group:'materials',  configurable:false, desc:'Support d\'impression GF'         },
  { id:'gf-dims',         label:'Dimensions libres',      icon:'layout',    group:'structure',  configurable:false, desc:'Largeur × hauteur en cm'          },
  { id:'gf-options',      label:'Options grand format',   icon:'flag',      group:'finish',     configurable:true,  desc:'Finitions grand format'           },
  { id:'rollup-size',     label:'Format roll-up',         icon:'scroll',    group:'structure',  configurable:true,  desc:'Format prédéfini roll-up'         },
  { id:'rollup-options',  label:'Options roll-up',        icon:'flag',      group:'structure',  configurable:false, desc:'Support aluminium'                },
  { id:'chemise-options', label:'Options chemise',         icon:'folder',    group:'finish',     configurable:false, desc:'Rabat collé / rabat imprimé'      },
  { id:'pancarte-support',label:'Support rigide',          icon:'layers',    group:'materials',  configurable:false, desc:'Forex / Plexiglass / MDF'         },
  { id:'sac-options',     label:'Soufflet sac',            icon:'package',   group:'structure',  configurable:false, desc:'Soufflet latéral mm'              },
  { id:'gadget-qty',      label:'Quantité gadget',         icon:'package',   group:'order',      configurable:true,  desc:'Quantités fixes — gadgets'        },
  { id:'conception-type', label:'Prestation conception',  icon:'pen-tool',  group:'conception', configurable:false, desc:'Type de prestation conception'    },
  { id:'carnet-format',   label:'Format carnet',           icon:'book',      group:'structure',  configurable:false, desc:'Format du carnet NCR'             },
  { id:'carnet-pages',    label:'Feuillets par carnet',    icon:'book-open', group:'structure',  configurable:false, desc:'Nombre de feuillets (hors couv.)' },
  { id:'carnet-souches',  label:'Nombre de souches',       icon:'layers',    group:'materials',  configurable:false, desc:'2 à 5 souches NCR couleurs'       },
  { id:'carnet-options',  label:'Options carnet',          icon:'flag',      group:'finish',     configurable:false, desc:'Numérotation, perfo, couverture'  },
  { id:'env-fenetre',      label:'Fenêtre enveloppe',        icon:'credit-card',group:'materials', configurable:false, desc:'Avec / sans fenêtre (choix client)'},
  { id:'env-size',         label:'Format enveloppe',          icon:'layout',     group:'structure', configurable:true,  desc:'Formats DL / C6 / C5… sélectionnables'},
  { id:'env-support',      label:'Support enveloppe',         icon:'credit-card',group:'materials', configurable:true,  desc:'Autodex / Normal / Spécial'},
  { id:'env-offset-colors',label:'Couleurs offset env.',      icon:'layers',     group:'finish',    configurable:true,  desc:'Impression offset — nb couleurs'},
  { id:'design-file',      label:'Conception & fichier',      icon:'pen-tool',   group:'design',    configurable:false, desc:'Upload fichier client + niveaux de conception graphique'},
];

/* ── Helper: normalise product sections → composition array ── */
function _getComposition(p) {
  if (p.composition) return p.composition;
  return (p.sections || []).map(s => ({ type_id: s, config: {} }));
}

/* ── DB migration: convert old flat arrays → composition ── */
function _migrateDB(db) {
  if (!db?.products) return;
  db.products.forEach(p => {
    if (p.composition) return;   // already new format
    const sections = p.sections || [];
    p.composition = sections.map(sid => {
      const entry = { type_id: sid, config: {} };
      switch (sid) {
        case 'paper':
          entry.config = {
            allowed: [...(p.paper_stocks || [])],
            special: [...(p.paper_stocks_special || [])],
          };
          break;
        case 'lam':
          entry.config = { allowed: [...(p.finishes_lam || [])] };
          break;
        case 'addon':
          entry.config = { allowed: [...(p.finishes_addon || [])] };
          break;
        case 'cat-int':
          entry.config = {
            allowed: [...(p.paper_stocks || [])],
            lam:     [...(p.finishes_lam_int || [])],
          };
          break;
        case 'cat-cov':
          entry.config = {
            allowed: [...(p.paper_stocks_cover || [])],
            lam:     [...(p.finishes_lam || [])],
          };
          break;
        case 'gf-options':
          entry.config = { allowed: [...(p.gf_finish_options || [])] };
          break;
        default:
          entry.config = {};
      }
      return entry;
    });
  });
}


/* ════ db.js ════ */
const DB_MOD = (() => {

  let _source = DEFAULT_SOURCE; // runtime active source

  /* ── JSON button dual-state: "JSON" when loaded, "Charger" when not ── */
  function _updateJsonBtn(state) {
    const btn = $('dbBtnJson');
    if (!btn) return;
    if (_source !== 'json') {
      /* Supabase mode — restore default label, normal toggle behaviour */
      btn.textContent = 'JSON';
      btn.onclick = () => DB_MOD.setSource('json');
      return;
    }
    if (state === 'on') {
      /* JSON loaded fine — show "JSON", click re-fetches */
      btn.textContent = 'JSON';
      btn.onclick = () => DB_MOD.setSource('json');
    } else {
      /* Not loaded / error — show "Charger", click opens file picker */
      btn.textContent = 'Charger';
      btn.onclick = () => $('dbFile')?.click();
    }
  }

  /* ── Toggle UI sync ── */
  function _syncToggleUI() {
    const bjson = $('dbBtnJson'), bsupa = $('dbBtnSupa');
    if (!bjson || !bsupa) return;
    bjson.classList.toggle('on', _source === 'json');
    bsupa.classList.toggle('on', _source === 'supabase');
    /* On source switch, reset JSON button to pending state if switching to JSON */
    if (_source === 'json') _updateJsonBtn('');
    // Update empty-state content to match active source
    const isSupa = _source === 'supabase';
    const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
    if (title) title.textContent = isSupa ? 'Connexion Supabase…' : 'Aucune base chargée';
    if (sub)   sub.innerHTML     = isSupa
      ? 'Connexion en cours à <strong>Supabase</strong>…'
      : 'Chargez votre fichier <strong>data.json</strong>';
    if (btn) {
      btn.style.display = isSupa ? 'none' : 'inline-flex';
    }
  }

  /* ── Status helper ── */
  function _status(text, state = '') {
    const st  = $('dbStatus'); if (!st) return;
    const dot = $('dbDot');
    st.textContent = text;
    st.title = text;
    st.className = 'sb-db-st' + (state ? ' ' + state : '');
    if (dot) {
      dot.className = 'sb-db-dot';
      if      (state === 'on')  dot.classList.add('connected');
      else if (state === 'err') dot.classList.add('error');
      else                      dot.classList.add('pending');
    }
    _updateJsonBtn(state);
    if (typeof ADMIN !== 'undefined' && ADMIN.syncDbDot) ADMIN.syncDbDot();
  }

  /* ── Apply parsed DB object ── */
  function _apply(parsed, label) {
    DB = parsed;
    _migrateDB(DB);
    window._jsonClients = Array.isArray(parsed._clients) ? parsed._clients : null;
    window._jsonQuotes  = Array.isArray(parsed._quotes)  ? parsed._quotes  : null;
    _status(label, 'on');
    _updateJsonBtn('on');
    if (ROLE === 'provider') {
      const tag = $('admSourceTag');
      if (tag) tag.textContent = DB_MOD.getSource() === 'supabase' ? 'Supabase' : 'JSON local';
      // Go to dashboard — ADMIN.goToDash handles all display logic
      if (typeof ADMIN !== 'undefined') {
        ADMIN.goToDash();
      } else {
        // Fallback if ADMIN not loaded yet
        $('vDB').style.display   = 'none';
        $('vDash').style.display = 'flex';
      }
      UI.buildSidebar();
      DASHBOARD.load();
    } else {
      UI.buildSidebar();
      UI.show('vEmpty');
      if (typeof AUTH !== 'undefined') AUTH.init();
    }
  }

  /* ── Session persistence ── */
  function _save(raw, name) {
    try {
      sessionStorage.setItem('kote_db',        raw);
      sessionStorage.setItem('kote_db_name',   name);
      sessionStorage.setItem('kote_db_source', _source);
    } catch (_) {}
  }

  /* ── Manual file upload ── */
  function onFile(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      let parsed;
      try { parsed = JSON.parse(e.target.result); }
      catch { alert('JSON invalide.'); return; }
      _source = 'json';
      _syncToggleUI();
      _apply(parsed, file.name);
      _save(e.target.result, file.name);
    };
    reader.readAsText(file);
    input.value = '';
  }

  /* ── Fetch data.json — falls back to file upload prompt if not found ── */
  async function _fetchJSON() {
    _status('Chargement…', 'pending');
    try {
      const res = await fetch('./data.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      _apply(parsed, 'data.json');
      _save(JSON.stringify(parsed), 'data.json');
    } catch(e) {
      _status('data.json introuvable', 'err');
      console.warn('DB_MOD: data.json fetch failed', e);
      /* Show file upload prompt prominently */
      const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
      if (title) title.textContent = 'Aucune base chargée';
      if (sub)   sub.innerHTML = 'Chargez votre fichier <strong>data.json</strong>';
      if (btn) {
        btn.style.display = 'inline-flex';
        btn.onclick = () => $('dbFile').click();
      }
    }
  }

  /* ── Fetch Supabase kote_config view ── */
  async function _fetchSupabase() {
    _status('Connexion…', 'pending');
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/kote_config?select=*&id=eq.1`,
        { headers: { 'apikey': window.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!rows || !rows.length) throw new Error('Aucun résultat');
      const parsed = rows[0];
      _apply(parsed, 'Supabase');
      _save(JSON.stringify(parsed), 'Supabase');
    } catch(e) {
      _status('Supabase erreur', 'err');
      console.warn('DB_MOD: Supabase fetch failed', e);
      // Update empty state to show error + retry
      const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
      if (title) title.textContent = 'Connexion Supabase échouée';
      if (sub)   sub.innerHTML = 'Impossible de joindre la base.<br>Vérifiez vos identifiants ou chargez un fichier JSON.';
      if (btn) { btn.style.display = 'inline-flex'; btn.textContent = 'Charger data.json'; btn.onclick = () => $('dbFile').click(); }
    }
  }

  /* ── Source toggle (called by UI buttons) ── */
  function setSource(src) {
    _source = src;
    _syncToggleUI();
    if (src === 'json')      _fetchJSON();
    else                     _fetchSupabase();
  }

  /* ── Session restore ── */
  function tryRestore() {
    _syncToggleUI();
    try {
      if (sessionStorage.getItem('kote_version') !== APP_VERSION) {
        sessionStorage.clear();
        sessionStorage.setItem('kote_version', APP_VERSION);
        // Fall through to auto-boot
      } else {
        const raw  = sessionStorage.getItem('kote_db');
        const name = sessionStorage.getItem('kote_db_name') || 'data.json';
        const src  = sessionStorage.getItem('kote_db_source') || DEFAULT_SOURCE;
        if (raw) {
          _source = src; _syncToggleUI();
          _apply(JSON.parse(raw), name);
          return;
        }
      }
    } catch (_) {}
    // Auto-boot from DEFAULT_SOURCE
    if (DEFAULT_SOURCE === 'supabase') _fetchSupabase();
    else                               _fetchJSON();
  }

  /* ── Persist after admin edits ── */
  function persistCurrent() {
    try { sessionStorage.setItem('kote_db', JSON.stringify(DB)); } catch (_) {}
  }

  async function pushToSupabase() {
    const body = {};
    Object.keys(DB).forEach(k => { if (k !== 'id') body[k] = DB[k]; });
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/kote_config?id=eq.1`,
        {
          method:  'PATCH',
          headers: {
            'apikey':        window.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=representation',
          },
          body: JSON.stringify(body),
        }
      );

      const rawText = await res.text();

      if (res.status === 403 || res.status === 401) return { ok: false, reason: 'permission' };
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

      let rows;
      try { rows = JSON.parse(rawText); } catch(_) { rows = null; }
      if (!rows || !rows.length) return { ok: false, reason: 'no_rows' };

      return { ok: true };
    } catch(e) {
      console.warn('DB_MOD: network error', e);
      return { ok: false, reason: 'network' };
    }
  }

  function getSource() { return _source; }

  return { onFile, tryRestore, persistCurrent, setSource, pushToSupabase, getSource };
})();


/* ════ calc.js ════ */
const CALC = (() => {

  /* ── Sheet imposition: best fit portrait vs landscape ── */
  function sheetFit(iW, iH, sh) {
    const uw = sh.w - sh.margin * 2, uh = sh.h - sh.margin * 2;
    const sW = iW + sh.bleed * 2,   sH = iH + sh.bleed * 2;
    const P = { cols: Math.floor(uw / sW), rows: Math.floor(uh / sH), rotated: false };
    const L = { cols: Math.floor(uw / sH), rows: Math.floor(uh / sW), rotated: true  };
    P.n = P.cols * P.rows;
    L.n = L.cols * L.rows;
    const best = L.n > P.n ? L : P;
    return { ...best, n: Math.max(best.n, 1) };
  }

  /* ── Quantity discount: find the highest tier the qty qualifies for ── */
  function qtyDisc(quantity, discounts) {
    return ([...discounts].reverse().find(d => quantity >= d.min)?.disc) || 0;
  }

  /* ── Addon line costs (setup_sheet | per_sheet | per_unit) ── */
  function addonLines(addons, addonFaces, sheets, quantity, db) {
    return (addons || []).map(id => {
      const f = (db.finishes_addon || []).find(x => x.id === id);
      if (!f) return { id, label: id, cost: 0 };
      const faces = addonFaces?.[id] || 1;
      let cost = 0;
      if      (f.pricing_model === 'setup_sheet') cost = f.cost_setup + f.cost_ps * sheets * faces;
      else if (f.pricing_model === 'per_sheet')   cost = f.cost_ps * sheets;
      else if (f.pricing_model === 'per_unit')    cost = f.cost_pu * quantity;
      return { id, label: f.label, model: f.pricing_model, cost, faces };
    });
  }

  /* ── Raw cost → selling price via profit margin ── */
  function applyMargin(raw, margin) {
    return raw / (1 - margin);
  }

  /* ── Main price dispatcher ── */
  /* ── Legacy product_type → calc_engine mapper ── */
  function _legacyEngine(type) {
    const map = { catalogue:'sheet_fit', grand_format:'sqm', rollup:'sqm', pancarte:'sqm',
                  conception:'service', gadget:'gadget', carnet:'carnet' };
    return map[type] || 'sheet_fit';
  }

  function price(sel, db) {
    if (!curProd) return null;
    const engine = curProd.calc_engine || _legacyEngine(curProd.product_type);
    switch (engine) {
      case 'sheet_fit': return _priceSheetFit(sel, db);
      case 'sqm':       return _priceSquareMeter(sel, db);
      case 'gadget':    return _priceGadget(sel, db);
      case 'carnet':    return _priceCarnet(sel, db);
      case 'service':   return _priceService(sel, db);
      default:          return _priceSheetFit(sel, db);
    }
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 1 — SHEET FIT
     Imposition A3+/A2+/A1+. Per-product planche override via product.planche.
     Two sub-modes (product.pricing_mode):
       'detailed' — engine computes paper + print + lam per sheet
       'planche'  — admin feeds sheet cost directly (recto / rv)
  ══════════════════════════════════════════════════════════ */
  function _priceSheetFit(sel, db) {
    const { sizeObj, paper, sides = 'single', addons = [], addonFaces = {}, quantity } = sel;
    if (!quantity) return null;
    if (!sizeObj || (sizeObj.id === 'custom' && (!sizeObj.w || !sizeObj.h))) return null;
    const pr  = db.pricing;
    const dbl = sides === 'double';
    const sh  = curProd.planche ? { ...db.sheet, w: curProd.planche.w, h: curProd.planche.h } : db.sheet;
    const isSac = !!(curProd?.is_sac || curProd?.id === 'sac-shopping' || curProd?.product_type === 'sac');
    const sacS  = (isSac && sel.sacSoufflet) ? sel.sacSoufflet : 0;
    const fitW  = (isSac && sacS && sizeObj.w) ? 2*sizeObj.w + 2*sacS : sizeObj.w;
    const fitH  = (isSac && sacS && sizeObj.h) ? sizeObj.h + sacS     : sizeObj.h;
    const fit    = sheetFit(fitW, fitH, sh);
    const sheets = Math.ceil(quantity / fit.n);
    const mode   = curProd.pricing_mode || 'detailed';
    let paperCost=0, printCost=0, lamCost=0, setupCost=0, plateCost=0, colorCount=0;
    let useOffset=false, offEligible=false, pObj=null, lamF={ id:'none', cost_ps:0 };
    if (mode === 'planche') {
      const pc    = curProd.planche_cost || {};
      printCost   = (dbl ? (pc.rv||0) : (pc.recto||0)) * sheets;
      lamCost     = 0;
    } else {
      if (!paper) return null;
      pObj = db.paper_stocks.find(p => p.id === paper); if (!pObj) return null;
      const lamId = sel.lam || 'none';
      lamF   = db.finishes.find(f => f.id === lamId) || { id:'none', cost_ps:0 };
      const off = db.offset;
      offEligible = off && off.enabled !== false && sheets >= (off.min_sheets || 1000);
      useOffset   = offEligible && !!sel.useOffset;
      colorCount  = useOffset ? (sel.offsetColors || 4) : 0;
      // Paper-level prices take priority; fall back to global pricing for legacy data
      const sheetRecto = pObj.print_recto != null ? pObj.print_recto : (pr.print_single || 2);
      const sheetRV    = pObj.print_rv    != null ? pObj.print_rv    : (pr.print_double || 3);
      paperCost   = 0; // consolidated into printCost
      printCost   = useOffset
        ? sheets * (dbl ? (off.print_double||off.print_single) : off.print_single)
        : sheets * (dbl ? sheetRV : sheetRecto);
      setupCost   = useOffset ? (off.setup_cost  || 0) : 0;
      plateCost   = useOffset ? colorCount * (off.cost_per_plate || 0) : 0;
      lamCost     = lamF?.cost_ps ? sheets * lamF.cost_ps * (dbl && lamF.per_side ? 2 : 1) : 0;
    }
    const isChemise   = !!(curProd?.is_chemise || curProd?.id === 'chemise-rabat');
    const chemiseCost = isChemise
      ? ((sel.chemiseColle   ? (curProd.rabat_colle_cost   ?? 0.8) : 0)
       + (sel.chemiseImprime ? (curProd.rabat_imprime_cost ?? 0.5) : 0)) * quantity : 0;
    let bindCost=0, bindObj=null;
    if (sel.binding && sel.binding !== 'none') {
      bindObj  = (db.binding_options || []).find(b => b.id === sel.binding);
      bindCost = bindObj ? bindObj.cost_flat + bindObj.cost_per_copy * quantity : 0;
    }
    let intPaper=0, covPaper=0, intPrint=0, covPrint=0, intLam=0, covLam=0, intTotal=0, covTotal=0;
    let catSidesInt=2, catSidesCov=2, catInteriorPages=0, catPpsInt=4;
    const isCatalogue = !!(sel.paperCover && sel.pages);
    if (isCatalogue && mode === 'detailed') {
      const covObj = db.paper_stocks.find(p => p.id === sel.paperCover); if (!covObj) return null;

      // ── Sides: default R/V for both interior and cover ──
      const sidesInt = sel.sidesInt === 'single' ? 1 : 2;
      const sidesCov = sel.sidesCov === 'single' ? 1 : 2;
      catSidesInt = sidesInt;
      catSidesCov = sidesCov;

      // ── Pages per press-sheet FACE (sizeObj.pps = 2 for A4 on A3 press) ──
      const ppsPerFace = sizeObj.pps_face ?? sizeObj.pps ?? 2;

      // Total pages per physical press sheet = face pages × sides printed
      const ppsInt = Math.max(1, ppsPerFace * sidesInt);
      catPpsInt = ppsInt;

      // ── Interior pages = total pages − 4 cover pages (outer+inner × front+back) ──
      const COVER_PAGES = 4;
      const interiorPages = Math.max(0, sel.pages - COVER_PAGES);
      catInteriorPages = interiorPages;

      // Interior press sheets per copy, then for all copies
      const intSheetsPerCopy = Math.ceil(interiorPages / ppsInt);
      intTotal = intSheetsPerCopy * quantity;

      // Cover press sheets: covFit.n = how many cover spreads (2× closed width) per press sheet
      const covFit = sheetFit(sizeObj.w * 2, sizeObj.h, sh);
      covTotal = Math.ceil(quantity / Math.max(covFit.n, 1));

      // ── Print cost per press sheet — respects paper-level pricing ──
      const intPrintPerSheet = sidesInt === 2
        ? (pObj?.print_rv    != null ? pObj.print_rv    : (pr.print_double || 3))
        : (pObj?.print_recto != null ? pObj.print_recto : (pr.print_single || 2));
      const covPrintPerSheet = sidesCov === 2
        ? (covObj.print_rv   != null ? covObj.print_rv  : (pr.print_double || 3))
        : (covObj.print_recto != null ? covObj.print_recto : (pr.print_single || 2));

      const lamCovF = db.finishes.find(f => f.id === (sel.lamCover    || 'none')) || { id:'none', cost_ps:0 };
      const lamIntF = db.finishes.find(f => f.id === (sel.lamInterior || 'none')) || { id:'none', cost_ps:0 };

      intPaper  = 0; covPaper = 0;
      intPrint  = intTotal * intPrintPerSheet;
      covPrint  = covTotal * covPrintPerSheet;
      intLam    = lamIntF.cost_ps ? intTotal * lamIntF.cost_ps : 0;
      covLam    = lamCovF.cost_ps ? covTotal * lamCovF.cost_ps : 0;
      paperCost = 0;
      printCost = intPrint + covPrint;
      lamCost   = intLam   + covLam;
    }
    const lines     = addonLines(addons, addonFaces, sheets, quantity, db);
    const addonCost = lines.reduce((s,l)=>s+l.cost,0);
    const cutFee    = pr.cutting_fee || 0;
    const raw     = paperCost + printCost + setupCost + plateCost + lamCost + addonCost + cutFee + chemiseCost + bindCost;
    const disc    = qtyDisc(quantity, pr.qty_discounts);
    const discAmt = raw * disc;
    const selling = applyMargin(raw - discAmt, pr.profit_margin);
    const designCost = _calcDesignCost(sel, db);
    return {
      baseTotal: selling + designCost, perUnit: (selling + designCost) / quantity,
      paperCost, printCost, setupCost, plateCost, colorCount, lamCost,
      addonCost, addonLines: lines, cutFee, chemiseCost, bindCost,
      intPaper, covPaper, intPrint, covPrint, intLam, covLam, intTotal, covTotal,
      raw, discAmt, disc, profit: selling-(raw-discAmt), designCost,
      sheets, unitsPerSheet: fit.n, fit, pObj,
      covObj: isCatalogue ? (DB?.paper_stocks||[]).find(p => p.id === sel.paperCover) : null,
      lamF, bindObj,
      lamIntF: isCatalogue ? ((DB?.finishes||[]).find(f=>f.id===(sel.lamInterior||'none'))||{id:'none',cost_ps:0}) : null,
      lamCovF: isCatalogue ? ((DB?.finishes||[]).find(f=>f.id===(sel.lamCover   ||'none'))||{id:'none',cost_ps:0}) : null,
      offEligible, isOffset: useOffset, mode, isSheetFit: true,
      sidesInt: catSidesInt, sidesCov: catSidesCov,
      interiorPages: catInteriorPages, ppsInt: catPpsInt,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 2 — SQUARE METER
     Products: bâche, vinyl, rollup, kakémono, totem, x-banner, pancarte.
     Global material list: DB.gf_materials (id, label, cost_per_sqm, laize).
     Global support list:  DB.rollup_supports (id, label, cost).
     Product references:   product.gf_material_id + optional product.support_id.
     Laize: width rounded UP to nearest laize multiple (min = 1 laize).
  ══════════════════════════════════════════════════════════ */
  function _priceSquareMeter(sel, db) {
    const { gfW, gfH, gfFinishes=[], withSupport, sizeObj, quantity } = sel;
    if (!quantity) return null;
    const rawW_cm = gfW ? parseFloat(gfW) : (sizeObj?.w ? sizeObj.w/10 : 0);
    const rawH_cm = gfH ? parseFloat(gfH) : (sizeObj?.h ? sizeObj.h/10 : 0);
    if (!rawW_cm || !rawH_cm) return null;
    // Material from global list
    const matList  = db.gf_materials || [];
    const matId    = curProd.gf_material_id || (matList[0]?.id);
    const mat      = matList.find(m => m.id === matId);
    const costPerSqm = mat ? (mat.cost_per_sqm || 0) : (curProd.cost_per_sqm || 0);
    const laize_m    = mat ? (mat.laize || 1.0)      : (curProd.laize || 1.0);
    // Laize rounding
    const rawW_m  = rawW_cm / 100;
    const rawH_m  = rawH_cm / 100;
    const eff_w_m = Math.ceil(rawW_m / laize_m) * laize_m;
    const area_m2 = eff_w_m * rawH_m;
    const sqmCost = area_m2 * costPerSqm * quantity;
    // Finishes
    let finCost = 0;
    const finLines = gfFinishes.map(fid => {
      const fo = (db.gf_finishes||[]).find(f=>f.id===fid); if (!fo) return null;
      const c  = fo.cost_flat ? fo.cost_flat*quantity : (fo.cost_per_sqm ? fo.cost_per_sqm*area_m2*quantity : 0);
      finCost += c;
      return { label: fo.label, cost: c };
    }).filter(Boolean);
    // Support from global list
    const supList    = db.rollup_supports || [];
    const supId      = curProd.support_id;
    const sup        = withSupport && supId ? supList.find(s=>s.id===supId) : null;
    const supportCost = sup ? (sup.cost||0)*quantity
      : (withSupport ? (curProd.support_cost||curProd.rollup_support_cost||0)*quantity : 0);
    const raw     = sqmCost + finCost + supportCost;
    const selling = applyMargin(raw, db.pricing.profit_margin);
    return {
      baseTotal: selling, perUnit: selling/quantity,
      sqmCost, finCost, finLines, supportCost, mat, sup,
      costPerSqm, laize_m, area_m2, eff_w_m, rawW_m, rawH_m,
      raw, discAmt:0, disc:0, profit: selling-raw,
      addonLines:[], addonCost:0, cutFee:0,
      sheets:quantity, unitsPerSheet:1,
      fit:{ cols:1, rows:1, n:1, rotated:false },
      lamF:{ id:'none', cost_ps:0 }, isSquareMeter:true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 3 — GADGET
     Products: gadgets + envelopes.
  ══════════════════════════════════════════════════════════ */
  function _priceGadget(sel, db) {
    const { quantity } = sel;
    if (!quantity || !curProd) return null;
    const pr = db.pricing;
    const isEnv = !!(sel.envFormatId || sel.envTypeId || curProd?.is_envelope || curProd?.id==='enveloppe');
    if (isEnv) {
      const envFmt  = (db.envelope_formats||[]).find(f=>f.id===sel.envFormatId);
      const envType = (db.envelope_types  ||[]).find(t=>t.id===sel.envTypeId);
      const envColors = sel.envColors || 1;
      const envThresh = 500;
      const unitCost  = envFmt?.cost || 0;
      const prcost    = envType
        ? (quantity>=envThresh
            ? (envType.cost_per_piece||0)+(envType.cost_per_color||0)*envColors
            : (envType.cost_per_piece||0))
        : 0;
      const raw     = (unitCost+prcost)*quantity;
      const disc    = qtyDisc(quantity, pr.qty_discounts);
      const discAmt = raw*disc;
      const selling = applyMargin(raw-discAmt, pr.profit_margin);
      return {
        baseTotal:selling, perUnit:selling/quantity,
        unitCost:unitCost*quantity, printCost:prcost*quantity,
        raw, discAmt, disc, profit:selling-(raw-discAmt),
        addonLines:[], addonCost:0, cutFee:0, sheets:quantity, unitsPerSheet:1,
        fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0},
        isEnv:true, envFmt, envType, envColors,
      };
    }
    const uprice = curProd.unit_price || 0;
    const prcost = curProd.print_cost  || 0;
    if (!uprice && !prcost) return null;
    const raw     = (uprice+prcost)*quantity;
    const disc    = qtyDisc(quantity, pr.qty_discounts);
    const discAmt = raw*disc;
    const selling = applyMargin(raw-discAmt, pr.profit_margin);
    return {
      baseTotal:selling, perUnit:selling/quantity,
      raw, discAmt, disc, profit:selling-(raw-discAmt),
      unitPrice:uprice, printCostPerUnit:prcost,
      addonLines:[], addonCost:0, cutFee:0, sheets:quantity, unitsPerSheet:1,
      fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0}, isGadget:true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 4 — CARNET NCR (always offset, always detailed)
  ══════════════════════════════════════════════════════════ */
  function _priceCarnet(sel, db) {
    const { sizeObj, carnetPages, carnetSouches, quantity } = sel;
    if (!sizeObj||!carnetPages||!carnetSouches||!quantity) return null;
    if (sizeObj.id==='custom'&&(!sizeObj.w||!sizeObj.h)) return null;
    const cp  = curProd.carnet_pricing || {};
    const off = db.offset || {};
    const pr  = db.pricing;
    const ncrCostPerSet    = (cp.ncr_cost_per_set||{})[String(carnetSouches)] || 0.5;
    const totalSets        = carnetPages*quantity;
    const ncrCost          = totalSets*ncrCostPerSet;
    const totalPrintSheets = carnetPages*carnetSouches*quantity;
    const fit              = sheetFit(sizeObj.w, sizeObj.h, db.sheet);
    const pressSheets      = Math.ceil(totalPrintSheets/fit.n);
    const printCost        = pressSheets*(off.print_single??pr.print_single);
    const setupCost        = off.setup_cost||0;
    const colorCount       = sel.carnetColors||4;
    const plateCost        = colorCount*(off.cost_per_plate||0);
    let coverCost=0, covPressSheets=0;
    if (sel.carnetCover) {
      const covPaper     = cp.cover_paper_id ? db.paper_stocks.find(p=>p.id===cp.cover_paper_id) : null;
      covPressSheets     = Math.ceil(quantity/Math.max(fit.n,1));
      const covPaperCost = covPaper ? covPressSheets*covPaper.cost_per_sheet : 0;
      const covPrintCost = covPressSheets*(cp.cover_print_cost_per_sheet??pr.print_single);
      coverCost = covPaperCost+covPrintCost;
    }
    const staplingCost = (cp.stapling_cost_per_carnet  ||0)*quantity;
    const numeroCost   = sel.carnetNumero ? (cp.numbering_cost_per_carnet  ||0)*quantity : 0;
    const perfoCost    = sel.carnetPerfo  ? (cp.perforation_cost_per_carnet||0)*quantity : 0;
    const raw     = ncrCost+printCost+setupCost+plateCost+coverCost+staplingCost+numeroCost+perfoCost;
    const disc    = qtyDisc(quantity, pr.qty_discounts);
    const discAmt = raw*disc;
    const selling = applyMargin(raw-discAmt, pr.profit_margin);
    return {
      baseTotal:selling, perUnit:selling/quantity,
      ncrCost, printCost, setupCost, plateCost, coverCost, staplingCost, numeroCost, perfoCost,
      raw, discAmt, disc, profit:selling-(raw-discAmt),
      pressSheets, totalPrintSheets, totalSets, fit,
      carnetPages, carnetSouches, colorCount, isCarnet:true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 5 — SERVICE (Design / Conception graphique)
  ══════════════════════════════════════════════════════════ */
  function _priceService(sel, db) {
    const { concType, concPages, concFaces, customPrice } = sel;
    if (!concType) return null;
    if (concType==='logo') {
      const base = (curProd.logo_price>0)?curProd.logo_price:1200;
      const raw  = customPrice>0?customPrice:base;
      return _serviceResult(raw,{id:'logo',label:'Design Logo'},customPrice>0);
    }
    const ct = (curProd.conception_types||[]).find(x=>x.id===concType); if (!ct) return null;
    if (customPrice>0) return _serviceResult(customPrice,ct,true);
    let raw=0;
    if      (ct.price)                           raw=ct.price;
    else if (ct.price_base&&ct.price_per_page)   { if(!concPages||concPages<1) return null; raw=ct.price_base+ct.price_per_page*concPages; }
    else if (ct.price_per_face)                  { if(!concFaces||concFaces<1) return null; raw=ct.price_per_face*concFaces; }
    return raw?_serviceResult(raw,ct,false):null;
  }
  function _serviceResult(total,ct,isCustom) {
    return {
      baseTotal:total, perUnit:total, raw:total,
      discAmt:0, disc:0, profit:0,
      addonLines:[], addonCost:0, cutFee:0, sheets:0, unitsPerSheet:1,
      fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0},
      concType:ct, isCustomPrice:isCustom, isService:true,
    };
  }

  /* ── Design service surcharge helper (used by sheet_fit) ── */
  function _calcDesignCost(sel, db) {
    if (sel.designOption!=='service'||!sel.designTier) return 0;
    const entry  = _getComposition(curProd).find(e=>(typeof e==='string'?e:e.type_id)==='design-file');
    const model  = entry?.config?.design_model||'tier';
    const tiers  = entry?.config?.tiers||db.contact?.design_tiers
      ||[{id:'basic',price:200},{id:'pro',price:400},{id:'premium',price:800}];
    const dt = tiers.find(t=>t.id===sel.designTier); if (!dt) return 0;
    if (model==='multipage') { const pages=sel.designPages||1; return (dt.price_base||0)+(dt.price_per_page||0)*pages; }
    return dt.price||0;
  }

  /* ── Cart grand total (subtotal + turnaround surcharge + delivery) ── */
  function cartTotal(items, opts, pr, deliveryCities) {
    const sub    = items.reduce((s, i) => s + i.baseTotal, 0);
    const sur    = (pr.turnaround_sur || {})[opts.turnaround] || 0;
    const surAmt = sub * sur;
    let del = 0;
    if (opts.deliveryCityId) {
      // Exact city fee chosen by user
      const city = (deliveryCities || []).find(c => c.id === opts.deliveryCityId);
      del = city ? (city.fee || 0) : 0;
    } else if (opts.delivery) {
      // Toggle ON but no city chosen yet — show minimum fee as estimate
      const fees = (deliveryCities || []).map(c => c.fee).filter(Boolean);
      del = fees.length ? Math.min(...fees) : (pr.delivery_fee || 0);
    }
    return { sub, surAmt, del, grand: sub + surAmt + del };
  }

  return { sheetFit, price, cartTotal };
})();


/* ════ sections.js ════ */
/* ════════════════════════════════════════════════════════
   SECTIONS  — config form block registry
   Each entry: { html(prod, sel, db, entry) => string,
                 defaults?(prod, sel, db, entry) }
   ════════════════════════════════════════════════════════ */
const SECTIONS = (() => {
  const registry = {};
  const reg = (id, def) => { registry[id] = def; };

  /* ── Shared overflow state helper (used by chipList + pillList) ──
     Returns { visible, rest, selInRest, expanded } for any list > 6 items */
  function _overflowState(items, key, selVal) {
    const expanded  = !!curSel[key];
    const visible   = expanded ? items : items.slice(0, 5);
    const rest      = items.slice(5);
    const selInRest = !expanded && rest.some(it => it.id === selVal);
    return { expanded, visible, rest, selInRest };
  }

  /* Stable key from an onclick string — strips non-alphanum, caps at 12 chars */
  const _ovfKey = onclick => '_ovf_' + onclick.replace(/[^a-z0-9]/gi, '').slice(0, 12);

  /* ── Chip list (label + small dims line) with optional overflow ── */
  const chipList = (items, selVal, onclick, extraClass = '') => {
    const mkChip = it => {
      const dimsDisplay = (it.w && it.h) ? `${it.w}×${it.h} mm` : (it.dims || it.desc || '—');
      return `<div class="opt chip${selVal === it.id ? ' on' : ''} ${extraClass}" onclick="${onclick}('${it.id}')">
        <strong>${it.label}</strong><small>${dimsDisplay}</small>
      </div>`;
    };
    if (items.length <= 6) return `<div class="chips">${items.map(mkChip).join('')}</div>`;
    const key = _ovfKey(onclick);
    const { expanded, visible, rest, selInRest } = _overflowState(items, key, selVal);
    return `<div class="chips">
      ${visible.map(mkChip).join('')}
      ${!expanded ? `<div class="opt chip chip-spec-trigger${selInRest ? ' on' : ''}" onclick="UI.expandList('${key}')">
        <strong>+${rest.length} autres</strong>
      </div>` : ''}
    </div>`;
  };

  /* ── Pill list (label only) with optional overflow ── */
  const pillList = (items, selVal, onclick) => {
    const mkPill = it =>
      `<div class="opt pill${selVal === it.id ? ' on' : ''}" onclick="${onclick}('${it.id}')">${it.label}</div>`;
    if (items.length <= 6) return `<div class="pills">${items.map(mkPill).join('')}</div>`;
    const key = _ovfKey(onclick);
    const { expanded, visible, rest, selInRest } = _overflowState(items, key, selVal);
    return `<div class="pills">
      ${visible.map(mkPill).join('')}
      ${!expanded ? `<div class="opt pill${selInRest ? ' on' : ''}" onclick="UI.expandList('${key}')">+${rest.length} autres</div>` : ''}
    </div>`;
  };

  /* ── Custom size (mm) inputs ── */
  const customSizeInputs = (sel, wLabel = 'Largeur (mm)', hLabel = 'Hauteur (mm)', wPh = 'ex: 85', hPh = 'ex: 55') =>
    `<div class="custom-row">
      <div class="inp-wrap"><label class="inp-lbl">${wLabel}</label>
        <input type="number" class="inp" id="cW" placeholder="${wPh}" oninput="UI.customSizeMM()"
          value="${sel.sizeObj?.id === 'custom' ? sel.sizeObj.w || '' : ''}"></div>
      <div class="inp-wrap"><label class="inp-lbl">${hLabel}</label>
        <input type="number" class="inp" id="cH" placeholder="${hPh}" oninput="UI.customSizeMM()"
          value="${sel.sizeObj?.id === 'custom' ? sel.sizeObj.h || '' : ''}"></div>
    </div>`;

  /* ── Custom quantity slide-in block ── */
  const qtyCustomBlock = (sel, wrapId = 'qtyCustomWrap', inpId = 'qtyInp', onInput = 'UI.qtyCustom(this.value)') =>
    `<div class="disc on" id="${wrapId}" style="max-height:${sel.customQty ? '50px' : '0'};margin-top:.22rem">
      <div class="qty-custom-row">
        <span class="qty-custom-lbl">Quantité :</span>
        <input type="number" class="inp" style="flex:1" id="${inpId}" min="1" placeholder="ex: 750"
          value="${sel.customQty ? sel.quantity : ''}" oninput="${onInput}">
      </div>
    </div>`;

  /* ════════════════════════════════════════════════════════
     SIZE
  ════════════════════════════════════════════════════════ */
  reg('size', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      return `<div>
        <div class="s-lbl">Format</div>
        ${chipList(sizes, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s) : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (!s.size && sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
    }
  });

  /* ════════════════════════════════════════════════════════
     PAPER
  ════════════════════════════════════════════════════════ */
  reg('paper', {
    html: (p, s, db, entry) => {
      const cfg        = entry?.config || {};
      let allowedIds   = cfg.allowed != null ? cfg.allowed : (p.paper_stocks || []);
      let specialIds   = cfg.special != null ? cfg.special : (p.paper_stocks_special || []);

      // No restrictions configured → show all DB papers
      const noRestrictions = !allowedIds.length && !specialIds.length;
      if (noRestrictions) {
        allowedIds = db.paper_stocks.filter(x => !x.special).map(x => x.id);
        specialIds = db.paper_stocks.filter(x => x.special).map(x => x.id);
      }
      // Explicit product overrides: always show all papers for these products
      const showAll = noRestrictions || ['flyer', 'depliant'].includes(p.id);

      if (showAll) {
        const std      = db.paper_stocks.filter(ps => !ps.special);
        const spc      = db.paper_stocks.filter(ps => ps.special);
        const FEATURED = ['135g', '170g', '250g'];
        const featured    = std.filter(ps => FEATURED.some(g => ps.label.startsWith(g)));
        const others      = std.filter(ps => !FEATURED.some(g => ps.label.startsWith(g)));
        const allOthers   = [...others, ...spc];
        const othersOpen  = allOthers.some(ps => ps.id === s.paper) || !!s.specOpen;
        return `<div>
          <div class="s-lbl">Support papier</div>
          <div class="chips">
            ${featured.map(ps => `<div class="opt chip${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
              <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
            <div class="opt chip chip-spec-trigger${othersOpen ? ' on' : ''}" onclick="UI.toggleSpecPaper()">
              <strong>Autres…</strong>
            </div>
          </div>
          <div class="spec-sub${othersOpen ? ' on' : ''}">
            <div class="chips">${allOthers.map(ps =>
              `<div class="opt chip${ps.special ? ' chip-sp' : ''}${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
                <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
            </div>
          </div>
        </div>`;
      }

      const prodStd   = db.paper_stocks.filter(ps => !ps.special && allowedIds.includes(ps.id));
      const prodSpc   = db.paper_stocks.filter(ps => specialIds.includes(ps.id));
      const specOpen  = prodSpc.some(ps => ps.id === s.paper) || !!s.specOpen;

      if (!prodSpc.length) {
        return `<div><div class="s-lbl">Support papier</div>${chipList(prodStd, s.paper, "fSel.bind(null,'paper')")}</div>`;
      }
      return `<div>
        <div class="s-lbl">Support papier</div>
        <div class="chips">
          ${prodStd.map(ps => `<div class="opt chip${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
            <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
          <div class="opt chip chip-spec-trigger${specOpen ? ' on' : ''}" onclick="UI.toggleSpecPaper()" title="Papiers spéciaux">
            <strong>✶ Spéciaux</strong>
          </div>
        </div>
        <div class="spec-sub${specOpen ? ' on' : ''}">
          <div class="chips">${prodSpc.map(ps =>
            `<div class="opt chip chip-sp${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
              <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
          </div>
        </div>
      </div>`;
    }
  });

  // Paper defaults — attached after registration to keep html/defaults adjacent is less confusing
  // than a separate IIFE mutating the registry entry
  registry['paper'].defaults = (p, s, db, entry) => {
    if (s.paper) return;
    const cfg = entry?.config || {};
    let allowedIds = cfg.allowed != null ? cfg.allowed : (p.paper_stocks || []);
    if (!allowedIds.length) allowedIds = db.paper_stocks.filter(x => !x.special).map(x => x.id);
    const first = db.paper_stocks.find(ps => allowedIds.includes(ps.id));
    if (first) s.paper = first.id;
  };

  /* ════════════════════════════════════════════════════════
     SIDES
  ════════════════════════════════════════════════════════ */
  reg('sides', {
    html: (p, s) => {
      // Always show the toggle — never hide choice behind an info tag
      const hasSingle = !p.sides || p.sides.includes('single');
      const hasDouble = !p.sides || p.sides.includes('double');
      return `<div><div class="s-lbl">Impression</div>
        <div class="seg">
          ${hasSingle ? `<button class="seg-btn${s.sides === 'single' ? ' on' : ''}" onclick="fSel('sides','single')">
            <span class="seg-ico"><span class="seg-p"></span></span>Recto
          </button>` : ''}
          ${hasDouble ? `<button class="seg-btn${s.sides === 'double' ? ' on' : ''}" onclick="fSel('sides','double')">
            <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
          </button>` : ''}
        </div></div>`;
    },
    defaults: (p, s) => { s.sides = p.sides?.[0] || 'single'; }
  });

  /* ════════════════════════════════════════════════════════
     LAM
  ════════════════════════════════════════════════════════ */
  reg('lam', {
    html: (p, s, db, entry) => {
      let allowedIds = entry?.config?.allowed ?? (p.finishes_lam || []);
      if (!allowedIds.length) allowedIds = (db.finishes || []).filter(f => f.id !== 'none').map(f => f.id);
      const lamPills = allowedIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
      const _compHasAddonSec = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'addon');
      const hasAddon = !_compHasAddonSec && (entry?.config?.addon ?? (p.finishes_addon || [])).length > 0;
      return `<div>
        <div class="s-lbl">Finition</div>
        <div class="pills">
          ${lamPills.map(it => `<div class="opt pill${s.lam === it.id ? ' on' : ''}" onclick="fSel('lam','${it.id}')">${it.label}</div>`).join('')}
          ${hasAddon ? `<div class="opt pill${s.addonOpen ? ' on' : ''}" onclick="UI.toggleFinition()">Autre finitions</div>` : ''}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      let allowedIds = entry?.config?.allowed ?? (p.finishes_lam || []);
      if (!allowedIds.length) allowedIds = (db.finishes || []).filter(f => f.id !== 'none').map(f => f.id);
      s.lam = allowedIds[0] || 'none';
    }
  });

  /* ════════════════════════════════════════════════════════
     ADDON
  ════════════════════════════════════════════════════════ */
  reg('addon', {
    html: (p, s, db, entry) => {
      const cfgAllowed = entry?.config?.allowed;
      const allowedIds = (cfgAllowed && cfgAllowed.length > 0)
        ? cfgAllowed
        : (p.finishes_addon?.length > 0 ? p.finishes_addon : (db.finishes_addon || []).map(f => f.id));
      const all     = (db.finishes_addon || []).filter(f => allowedIds.includes(f.id));
      const special = all.filter(f => f.group === 'special');
      const fac     = all.filter(f => f.group === 'faconnage');
      if (!all.length) return '';

      const specGrid = special.length ? `
        <div class="sg-lbl">Finitions spéciales</div>
        <div class="fin-grid-v2">${special.map(f => {
          const on = (s.addons || []).includes(f.id);
          const fc = s.addonFaces?.[f.id] || 1;
          return `<div class="opt fin-cell-v2${on ? ' on' : ''}">
            <div class="fin-cell-top" onclick="fSel('addon','${f.id}')">
              <span class="fin-cell-lbl">${f.label}</span>
              <div class="tog${on ? ' on' : ''}"></div>
            </div>
            ${on ? `<div class="fin-cell-faces">
              <div class="face-pill${fc === 1 ? ' on' : ''}" onclick="event.stopPropagation();UI.addonFaces('${f.id}',1)">1 face</div>
              <div class="face-pill${fc === 2 ? ' on' : ''}" onclick="event.stopPropagation();UI.addonFaces('${f.id}',2)">2 faces</div>
            </div>` : ''}
          </div>`;
        }).join('')}</div>` : '';

      const facGrid = fac.length ? `
        <div class="sg-lbl"${special.length ? ' style="margin-top:.45rem"' : ''}>Façonnage</div>
        <div class="fac-grid">${fac.map(f => {
          const on = (s.addons || []).includes(f.id);
          return `<div class="opt fac-cell${on ? ' on' : ''}" onclick="fSel('addon','${f.id}')">
            <span>${f.label}</span><div class="tog${on ? ' on' : ''}"></div></div>`;
        }).join('')}</div>` : '';

      const hasActive = (s.addons || []).some(id => allowedIds.includes(id));
      const open = !!s.addonOpen || hasActive;
      return `<div>
        <div class="notes-acc${open ? ' open' : ''}" id="addonAcc">
          <div class="notes-hdr" onclick="UI.toggleAddon()">
            <div class="notes-hdr-l" style="display:flex;align-items:center;gap:.4rem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;flex-shrink:0;color:var(--t3)"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              Finitions supplémentaires
              ${hasActive ? `<span style="font-size:.58rem;color:var(--bl);font-weight:600">(${(s.addons||[]).filter(id=>allowedIds.includes(id)).length} actif${(s.addons||[]).filter(id=>allowedIds.includes(id)).length>1?'s':''})</span>` : ''}
            </div>
            <div class="notes-chev">${IC['chev-d']}</div>
          </div>
          <div class="notes-body">
            <div class="notes-inner" style="padding-top:.4rem">
              <div class="fin-wrap"><div class="fin-section">${specGrid}${facGrid}</div></div>
            </div>
          </div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     QTY
  ════════════════════════════════════════════════════════ */
  reg('qty', {
    html: (p, s, db, entry) => {
      const all      = entry?.config?.items || p.quantities || [];
      const isCustom = s.customQty;

      // Offset pill — compute sheets to check eligibility
      const offPill = (() => {
        const off = db.offset;
        if (!off || off.enabled === false || !s.sizeObj || !s.quantity) return { inline: '', below: '' };
        const isEnvLocal = p.id === 'enveloppe';
        const fit    = (s.sizeObj.id === 'custom' || isEnvLocal) ? { n: 1 } : CALC.sheetFit(s.sizeObj.w, s.sizeObj.h, db.sheet);
        const sheets = Math.ceil(s.quantity / fit.n);
        if (sheets < (off.min_sheets || 1000)) return { inline: '', below: '' };
        const active = !!s.useOffset;
        const pill   = `<button class="opt qty-btn offset-pill${active ? ' active' : ''}" onclick="UI.toggleOffset()" title="${active ? 'Basculer vers Numérique' : 'Basculer vers Offset'}">Offset</button>`;
        if (!active) return { inline: pill, below: '' };
        const colors      = s.offsetColors || 4;
        const colorPicker = `<div class="offset-colors">
          <div class="offset-colors-lbl">Nombre de couleurs :</div>
          <div class="seg">${[1,2,3,4,5,6].map(n =>
            `<button class="seg-btn${colors === n ? ' on' : ''}" onclick="UI.setOffsetColors(${n})" title="${n} couleur${n > 1 ? 's' : ''}">${n}</button>`
          ).join('')}</div>
        </div>`;
        return { inline: pill, below: colorPicker };
      })();

      const btns = (qtys, expanded, rest) => {
        const selInRest = !expanded && !isCustom && rest.includes(s.quantity);
        return `${qtys.map(q => `<button class="opt qty-btn${s.quantity === q && !isCustom ? ' on' : ''}" onclick="UI.qty(${q})">${fmtN(q)}</button>`).join('')}
          ${!expanded && rest.length ? `<button class="opt qty-btn${selInRest ? ' on' : ''}" onclick="UI.expandList('_qtyExpanded')">+${rest.length} autres</button>` : ''}
          <button class="opt qty-btn${isCustom ? ' on' : ''}" onclick="UI.qtyCustomOpen()">Personnalisé…</button>
          ${offPill.inline}`;
      };

      if (all.length <= 6) {
        return `<div>
          <div class="s-lbl">Quantité</div>
          <div class="qty-row">${btns(all, true, [])}</div>
          ${qtyCustomBlock(s)}
          ${offPill.below}
        </div>`;
      }
      const expanded = !!s._qtyExpanded;
      const visible  = expanded ? all : all.slice(0, 5);
      const rest     = all.slice(5);
      return `<div>
        <div class="s-lbl">Quantité</div>
        <div class="qty-row">${btns(visible, expanded, rest)}</div>
        ${qtyCustomBlock(s)}
        ${offPill.below}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const qtys = entry?.config?.items || p.quantities || [];
      if (!s.quantity && qtys.length) s.quantity = qtys[0];
    }
  });

  /* ════════════════════════════════════════════════════════
     NOTES
  ════════════════════════════════════════════════════════ */
  reg('notes', {
    html: (p, s) => {
      const filled = !!(s.notes && s.notes.trim());
      return `<div>
        <div class="notes-acc${filled ? ' open' : ''}" id="notesAcc">
          <div class="notes-hdr" onclick="UI.toggleNotes()">
            <div class="notes-hdr-l">${IC['file-plus']} Notes &amp; instructions
              ${filled ? `<span style="font-size:.58rem;color:var(--bl);font-weight:600">(rempli)</span>` : ''}
            </div>
            <div class="notes-chev">${IC['chev-d']}</div>
          </div>
          <div class="notes-body"><div class="notes-inner">
            <textarea class="inp notes-ta" placeholder="Instructions, gabarit, Pantone, fichiers…"
              oninput="curSel.notes=this.value">${s.notes || ''}</textarea>
          </div></div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     DEPL-FORMAT
  ════════════════════════════════════════════════════════ */
  reg('depl-format', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      return `<div>
        <div class="s-lbl">Format ouvert</div>
        ${chipList(sizes, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s, 'Largeur ouvert (mm)', 'Hauteur (mm)', '420', '297') : ''}
        ${s.size ? `<div style="margin-top:.45rem">
          <div class="s-lbl">Pliage</div>
          ${chipList(p.fold_options || [], s.fold, "fSel.bind(null,'fold')")}
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
      s.fold = (p.fold_options || [])[0]?.id;
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-PAGES
  ════════════════════════════════════════════════════════ */
  reg('cat-pages', {
    html: (p, s, db, entry) => {
      const all   = entry?.config?.items || p.page_options || [];
      const shown = all.slice(0, 4);
      const rest  = all.slice(4);
      const isC   = s.customPages;
      const showWarn = s.binding === 'pique' && s.pages && s.pages % 4 !== 0;
      return `<div>
        <div class="s-lbl">Nombre de pages <span style="font-weight:400;text-transform:none;font-size:.58rem;color:var(--t3)">(couverture incluse)</span></div>
        <div class="qty-row">
          ${shown.map(n => `<div class="opt qty-btn${s.pages === n && !isC ? ' on' : ''}" onclick="UI.catPages(${n})">${n}</div>`).join('')}
          <select class="opt qty-select${!isC && rest.includes(s.pages) ? ' on' : ''}" onchange="UI.catPagesSelect(this.value)">
            <option value="">Plus…</option>
            ${rest.map(n => `<option value="pg:${n}"${s.pages === n && !isC ? ' selected' : ''}>${n}</option>`).join('')}
            <option value="custom"${isC ? ' selected' : ''}>Personnalisé…</option>
          </select>
        </div>
        <div class="disc on" id="catPagesWrap" style="max-height:${isC ? '50px' : '0'};margin-top:.22rem">
          <div class="qty-custom-row">
            <span class="qty-custom-lbl">Pages :</span>
            <input type="number" class="inp" style="flex:1" min="4" step="4"
              placeholder="multiple de 4" value="${isC ? s.pages : ''}"
              oninput="UI.catPagesCustom(this.value)">
          </div>
        </div>
        ${showWarn ? `<div class="warn">${IC.alert} Piqûre à cheval : le nombre de pages doit être un multiple de 4.</div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      s.pages = (entry?.config?.items || p.page_options || [])[0] || 8;
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-INT
  ════════════════════════════════════════════════════════ */
  reg('cat-int', {
    html: (p, s, db, entry) => {
      const cfg    = entry?.config || {};
      const allowed = cfg.allowed ?? (p.paper_stocks || []);
      const lamIds  = cfg.lam     ?? (p.finishes_lam_int || []);
      const papers  = db.paper_stocks.filter(ps => allowed.includes(ps.id));
      const fins    = lamIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
      const sidesInt = s.sidesInt || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC.layers} Intérieur</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paper, "fSel.bind(null,'paper')")}
        <div style="margin-top:.35rem">
          <div class="s-lbl">Impression intérieur</div>
          <div class="seg">
            <button class="seg-btn${sidesInt==='single'?' on':''}" onclick="fSel('sidesInt','single')">
              <span class="seg-ico"><span class="seg-p"></span></span>Recto
            </button>
            <button class="seg-btn${sidesInt==='double'?' on':''}" onclick="fSel('sidesInt','double')">
              <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
            </button>
          </div>
        </div>
        ${fins.length ? `<div style="margin-top:.35rem">
          <div class="s-lbl">Pelliculage intérieur</div>
          ${pillList(fins, s.lamInterior, "fSel.bind(null,'lamInterior')")}
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allowed = entry?.config?.allowed ?? (p.paper_stocks || []);
      if (!s.paper) s.paper = allowed[0] || null;
      s.lamInterior = 'none';
      if (!s.sidesInt) s.sidesInt = 'double';
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-COV
  ════════════════════════════════════════════════════════ */
  reg('cat-cov', {
    html: (p, s, db, entry) => {
      const cfg      = entry?.config || {};
      const allowed  = cfg.allowed ?? (p.paper_stocks_cover || []);
      const lamIds   = cfg.lam     ?? (p.finishes_lam || []);
      const papers   = db.paper_stocks.filter(ps => allowed.includes(ps.id));
      const finPills = lamIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
      const _catCovHasAddonSec = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'addon');
      const hasAddonCov = !_catCovHasAddonSec && (cfg.addon ?? (p.finishes_addon || [])).length > 0;
      const sidesCov = s.sidesCov || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC['file-plus']} Couverture</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paperCover, "fSel.bind(null,'paperCover')")}
        <div style="margin-top:.35rem">
          <div class="s-lbl">Impression couverture</div>
          <div class="seg">
            <button class="seg-btn${sidesCov==='single'?' on':''}" onclick="fSel('sidesCov','single')">
              <span class="seg-ico"><span class="seg-p"></span></span>Recto
            </button>
            <button class="seg-btn${sidesCov==='double'?' on':''}" onclick="fSel('sidesCov','double')">
              <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
            </button>
          </div>
        </div>
        <div style="margin-top:.35rem">
          <div class="pills">
            ${finPills.map(it => `<div class="opt pill${s.lamCover === it.id ? ' on' : ''}" onclick="fSel('lamCover','${it.id}')">${it.label}</div>`).join('')}
            ${hasAddonCov ? `<div class="opt pill${s.addonOpen ? ' on' : ''}" onclick="UI.toggleFinition()">Autre finitions</div>` : ''}
          </div>
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allowed = entry?.config?.allowed ?? (p.paper_stocks_cover || []);
      if (!s.paperCover) s.paperCover = allowed[0] || null;
      s.lamCover = 'none';
      if (!s.sidesCov) s.sidesCov = 'double';
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-BIND
  ════════════════════════════════════════════════════════ */
  reg('cat-bind', {
    html: (p, s, db) => {
      const showWarn = s.binding === 'pique' && s.pages && s.pages % 4 !== 0;
      return `<div>
        <div class="s-lbl">Reliure</div>
        ${chipList(db.binding_options || [], s.binding, "fSel.bind(null,'binding')")}
        ${showWarn ? `<div class="warn">${IC.alert} Piqûre à cheval requiert un multiple de 4 pages.</div>` : ''}
      </div>`;
    },
    defaults: (p, s, db) => { s.binding = (db.binding_options || [])[0]?.id || 'pique'; }
  });

  /* ════════════════════════════════════════════════════════
     GF-MATERIAL
  ════════════════════════════════════════════════════════ */
  reg('gf-material', {
    html: (p, s) => {
      const COLORS = ['#3B82F6','#10B981','#6366F1','#F59E0B','#EC4899','#8B5CF6','#06B6D4'];
      return `<div>
        <div class="s-lbl">Support</div>
        <div class="gf-mat-grid">${(p.gf_materials || []).map((m, i) =>
          `<div class="opt gf-mat-chip${s.gfMaterial === m.id ? ' on' : ''}" onclick="fSel('gfMaterial','${m.id}')">
            <div class="gf-mat-dot" style="background:${COLORS[i % COLORS.length]}"></div>
            <div style="flex:1;min-width:0">
              <div class="gf-mat-name">${m.label}</div>
              <div class="gf-mat-price">${m.desc}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     GF-DIMS
  ════════════════════════════════════════════════════════ */
  reg('gf-dims', {
    html: (p, s) => {
      const area = s.gfW && s.gfH ? (parseFloat(s.gfW) / 100 * parseFloat(s.gfH) / 100).toFixed(2) : null;
      return `<div>
        <div class="s-lbl">Dimensions</div>
        <div class="gf-dims-box">
          <div class="inp-wrap"><label class="inp-lbl">Larg. (cm)</label>
            <input type="number" class="inp" id="gfW" placeholder="ex: 150" oninput="UI.gfDims()" value="${s.gfW || ''}">
          </div>
          <div class="inp-wrap"><label class="inp-lbl">Haut. (cm)</label>
            <input type="number" class="inp" id="gfH" placeholder="ex: 100" oninput="UI.gfDims()" value="${s.gfH || ''}">
          </div>
          <div class="gf-area-badge">
            ${area
              ? `<div class="gf-area-val">${area}</div><div class="gf-area-lbl">m²</div>`
              : `<div class="gf-area-lbl" style="color:var(--t3)">Surface</div>`}
          </div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     GF-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('gf-options', {
    html: (p, s, db, entry) => {
      const allowedIds = entry?.config?.allowed ?? (p.gf_finish_options || []);
      const mat  = (p.gf_materials || []).find(m => m.id === s.gfMaterial);
      const opts = allowedIds.filter(fid => {
        if (!fid) return false;
        if ((fid === 'lam-mat' || fid === 'lam-gloss') && mat && !mat.laminage) return false;
        return true;
      }).map(fid => (db.gf_finishes || []).find(f => f.id === fid)).filter(Boolean);
      if (!opts.length) return '';
      return `<div>
        <div class="s-lbl">Options</div>
        <div class="pills">${opts.map(fo => {
          const on = (s.gfFinishes || []).includes(fo.id);
          return `<div class="opt pill${on ? ' on' : ''}" onclick="UI.gfFinish('${fo.id}')">${fo.label}</div>`;
        }).join('')}
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     ROLLUP-SIZE
  ════════════════════════════════════════════════════════ */
  reg('rollup-size', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      return `<div>
        <div class="s-lbl">Format</div>
        <div class="ru-cards">${sizes.map(sz =>
          `<div class="opt ru-card${s.size === sz.id ? ' on' : ''}" onclick="fSel('size','${sz.id}')">
            <div style="font-weight:600">${sz.label}</div>
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
    }
  });

  /* ════════════════════════════════════════════════════════
     ROLLUP-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('rollup-options', {
    html: (p, s) => `<div>
      <div class="s-lbl">Options</div>
      <div class="opt gf-opt-row${s.withSupport ? ' on' : ''}" onclick="fSel('withSupport',${!s.withSupport})">
        <div>
          <div class="gf-opt-name">${p.xbanner ? 'Avec support X-Banner' : 'Avec support aluminium'}</div>
        </div>
        <div class="tog${s.withSupport ? ' on' : ''}"></div>
      </div>
    </div>`
  });

  /* ════════════════════════════════════════════════════════
     CHEMISE-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('chemise-options', {
    html: (p, s) => {
      const colCost = p.rabat_colle_cost  ?? 0.8;
      const impCost = p.rabat_imprime_cost ?? 0.5;
      const btn = (label, cost, on, handler) =>
        `<button class="opt qty-btn${on ? ' on' : ''}" onclick="${handler}"
          style="display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 12px;height:auto;line-height:1.2">
          <span style="font-size:.69rem;font-weight:600">${label}</span>
          <span style="font-size:.58rem;opacity:.6">+${cost} DH/u</span>
        </button>`;
      return `<div>
        <div class="s-lbl">Options rabat</div>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap">
          ${btn('Rabat collé',   colCost, !!s.chemiseColle,   `fSel('chemiseColle',${!s.chemiseColle})`)}
          ${btn('Rabat imprimé', impCost, !!s.chemiseImprime, `fSel('chemiseImprime',${!s.chemiseImprime})`)}
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     PANCARTE-SUPPORT
  ════════════════════════════════════════════════════════ */
  reg('pancarte-support', {
    html: (p, s) => {
      const mats = p.pancarte_materials || [];
      return `<div>
        <div class="s-lbl">Support</div>
        <div class="pills">${mats.map(m =>
          `<div class="opt pill${s.pancarteMat === m.id ? ' on' : ''}" onclick="fSel('pancarteMat','${m.id}');UI.renderFooter()">
            ${m.label}${m.desc ? `<span style="opacity:.55;font-size:.6rem;margin-left:4px">${m.desc}</span>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s) => {
      const mats = p.pancarte_materials || [];
      if (!s.pancarteMat && mats.length) s.pancarteMat = mats[0].id;
    }
  });

  /* ════════════════════════════════════════════════════════
     SAC-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('sac-options', {
    html: (p, s) => {
      const souf  = s.sacSoufflet || 0;
      const w = s.sizeObj?.w, h = s.sizeObj?.h;
      const openW = (w && souf) ? 2 * w + 2 * souf : null;
      const openH = (h && souf) ? h + souf : null;
      return `<div>
        <div class="s-lbl">Soufflet latéral</div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <div class="inp-wrap" style="margin:0;flex:0 0 auto">
            <input type="number" class="inp" style="width:80px" min="0" placeholder="ex: 80"
              value="${souf || ''}" oninput="fSel('sacSoufflet',+this.value||0);UI.renderFooter()">
          </div>
          <span style="font-size:.67rem;color:var(--t3)">mm</span>
          ${openW && openH
            ? `<span style="font-size:.63rem;color:var(--bl);font-weight:600">
                 Format ouvert : ${openW}×${openH} mm
                 <span style="font-size:.58rem;font-weight:400;color:var(--t3);margin-left:4px">
                   (2×${w} + 2×${souf}) × (${h} + ${souf})
                 </span>
               </span>`
            : `<span style="font-size:.62rem;color:var(--t3)">Format ouvert calculé automatiquement</span>`}
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     GADGET-QTY
  ════════════════════════════════════════════════════════ */
  reg('gadget-qty', {
    html: (p, s, db, entry) => {
      const all      = entry?.config?.items || p.quantities || [];
      const isCustom = s.quantity && !all.includes(s.quantity);
      const uprice   = p.unit_price   || 0;
      const prcost   = p.print_cost   || 0;
      const total    = uprice + prcost;
      const mkBtn    = q => `<button class="opt qty-btn${s.quantity === q && !isCustom ? ' on' : ''}" onclick="UI.qty(${q})">${fmtN(q)}</button>`;
      const costHint = `<div style="display:flex;gap:.75rem;margin-top:.3rem;font-size:.63rem;color:var(--t3)">
        ${uprice ? `<span>Produit : <strong style="color:var(--t2)">${uprice} DH/u</strong></span>` : ''}
        ${prcost ? `<span>Impression : <strong style="color:var(--t2)">${prcost} DH/u</strong></span>` : ''}
        ${total  ? `<span style="color:var(--bl);font-weight:600">= ${total} DH/u</span>` : ''}
      </div>`;
      const customInp = isCustom || s._qtyCustomOpen
        ? `<div style="margin-top:.35rem;display:flex;align-items:center;gap:.4rem">
             <input type="number" class="inp" style="width:90px" placeholder="Quantité" min="1"
               value="${isCustom ? s.quantity : ''}" oninput="UI.qty(+this.value)">
           </div>`
        : '';
      return `<div>
        <div class="s-lbl">Quantité</div>
        <div class="qty-row">
          ${all.map(mkBtn).join('')}
          <button class="opt qty-btn${isCustom ? ' on' : ''}" onclick="UI.qtyCustomOpen()">Personnalisé…</button>
        </div>
        ${customInp}
        ${costHint}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const items = entry?.config?.items || p.quantities || [];
      if (!s.quantity && items.length) s.quantity = items[0];
    }
  });

  /* ════════════════════════════════════════════════════════
     CONCEPTION-TYPE  — Tier-based design service with WA slot animation
     Uses DB.contact.design_tiers for tier pricing (shared with design-file module).
     Service types from p.conception_types define categories shown as selector pills.
  ════════════════════════════════════════════════════════ */
  reg('conception-type', {
    html: (p, s, db) => {

      const waDesigner = (db.contact?.designer_whatsapp || db.contact?.whatsapp || '').replace(/\D/g,'');
      const icoWA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`;
      const icoCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>`;

      // Tiers: from DB.contact.design_tiers global
      const tiers = db.contact?.design_tiers || [
        { id:'basic',   label:'Basic',   desc:'Mise en page soignée',               price:200 },
        { id:'pro',     label:'Pro',     desc:'Design créatif + retouches',          price:400 },
        { id:'premium', label:'Premium', desc:'Premium · déclinaisons · rush 48h',   price:800 },
      ];

      // Service type categories from product config
      const types = p.conception_types || [];

      // ── Provider custom price block ──
      const customBlock = ROLE === 'provider' ? (() => {
        const cpOpen = !!s.customPriceOpen;
        return `<div class="conc-custom-row${cpOpen?' open':''}" onclick="event.stopPropagation();UI.toggleConcCustom()">
          <span class="conc-custom-lbl">${IC['chev-d']} ${s.customPrice?'Prix personnalisé actif':'Personnaliser le prix'}</span>
          ${s.customPrice?`<span style="font-size:.67rem;font-weight:700;color:var(--pu)">${fmt(s.customPrice)} DH</span>`:''}
        </div>
        <div class="conc-custom-panel${cpOpen?' on':''}">
          <div class="conc-custom-field">
            <div class="inp-wrap">
              <label class="inp-lbl">Prix de vente HT — laisser vide pour auto</label>
              <input type="number" class="inp" min="0" placeholder="Prix libre…"
                value="${s.customPrice||''}" onclick="event.stopPropagation()"
                oninput="event.stopPropagation();curSel.customPrice=this.value?+this.value:null;UI.renderFooter()">
            </div>
          </div>
        </div>`;
      })() : '';

      // ── Tier pill with slot animation (same system as design-file) ──
      const tierPill = (t) => {
        const on = s.designTier === t.id;
        if (on && waDesigner) {
          const waMsg = encodeURIComponent(
            'Bonjour, je voudrais confier ma conception graphique'
            + (s.concType ? ' — ' + (types.find(x=>x.id===s.concType)?.label||s.concType) : '')
            + ' · Niveau ' + t.label + ' (' + t.price + ' DH).'
            + (s.concNote ? ' Brief : ' + s.concNote : '')
          );
          return `<div class="design-tier-pill on design-tier-wa-active">
            <div class="design-tier-slot-wrap">
              <div class="design-tier-slot-out">
                <span class="design-tier-pill-price">${fmt(t.price)} DH</span>
                <span class="design-tier-pill-name">${t.label}</span>
              </div>
              <a class="design-tier-slot-in" href="https://wa.me/${waDesigner}?text=${waMsg}"
                target="_blank" rel="noopener" onclick="event.stopPropagation()">
                ${icoWA}<span>Engagez un graphiste</span>
              </a>
            </div>
            <div class="design-tier-pill-desc">${t.desc}</div>
            <button class="design-tier-desel" onclick="fSel('designTier',null)" title="Changer">✕</button>
          </div>`;
        }
        return `<div class="design-tier-pill${on?' on':''}" onclick="fSel('designTier','${t.id}');UI.renderForm();UI.renderFooter()">
          <div class="design-tier-pill-top">
            <span style="width:10px">${on?icoCheck:''}</span>
            <span class="design-tier-pill-price">${fmt(t.price)} DH</span>
          </div>
          <div class="design-tier-pill-name">${t.label}</div>
          <div class="design-tier-pill-desc">${t.desc}</div>
        </div>`;
      };

      // ── Brief textarea ──
      const briefBlock = `<div class="inp-wrap" style="margin-top:.5rem">
        <label class="inp-lbl">Brief — décrivez votre projet</label>
        <textarea class="inp" rows="3"
          placeholder="Couleurs, style, références, supports à décliner…"
          onclick="event.stopPropagation()"
          oninput="event.stopPropagation();curSel.concNote=this.value;UI.renderFooter()">${s.concNote||''}</textarea>
      </div>`;

      // ── Service type selector (optional, shown if product has types) ──
      const typeSelector = types.length ? `
        <div style="margin-bottom:.65rem">
          <div class="s-lbl" style="margin-bottom:.35rem">Prestation</div>
          <div class="pills">
            ${types.map(ct => `<div class="opt pill${s.concType===ct.id?' on':''}"
              onclick="event.stopPropagation();fSel('concType','${ct.id}');UI.renderForm();UI.renderFooter()">
              ${ct.label}
            </div>`).join('')}
          </div>
        </div>` : '';

      return `<div class="conc-service-wrap">
        ${typeSelector}
        <div class="s-lbl" style="margin-bottom:.4rem">Niveau de conception</div>
        <div class="design-tier-row">${tiers.map(tierPill).join('')}</div>
        ${briefBlock}
        ${customBlock}
      </div>`;
    },
    defaults: (p, s) => {
      if (!s.designTier) s.designTier = null;
      const types = p.conception_types || [];
      if (!s.concType && types.length) s.concType = types[0].id;
    }
  });

  /* ════════════════════════════════════════════════════════
     CARNET NCR SECTIONS
  ════════════════════════════════════════════════════════ */

  /* ── CARNET-FORMAT ── */
  reg('carnet-format', {
    html: (p, s) => {
      const sizes = p.sizes || [];
      return `<div>
        <div class="s-lbl">Format</div>
        ${chipList(sizes, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s, 'Largeur (mm)', 'Hauteur (mm)', '148', '210') : ''}
      </div>`;
    },
    defaults: (p, s) => {
      const first = (p.sizes || [])[0];
      if (first) { s.size = first.id; s.sizeObj = first; }
    }
  });

  /* ── CARNET-PAGES ── */
  reg('carnet-pages', {
    html: (p, s) => {
      const opts = p.carnet_pages_options || [25, 50, 100];
      return `<div>
        <div class="s-lbl">Feuillets par carnet <span style="font-weight:400;text-transform:none;font-size:.58rem;color:var(--t3)">(couverture non comptée)</span></div>
        <div class="qty-row">
          ${opts.map(n =>
            `<button class="opt qty-btn${s.carnetPages === n ? ' on' : ''}"
               onclick="curSel.carnetPages=${n};UI.renderForm();UI.renderFooter()">${n}</button>`
          ).join('')}
        </div>
        <div style="margin-top:.3rem;font-size:.61rem;color:var(--t3)">
          Total impressions : ${s.carnetPages && s.carnetSouches && s.quantity
            ? fmtN(s.carnetPages * s.carnetSouches * s.quantity) + ' feuilles en offset'
            : '—'}
        </div>
      </div>`;
    },
    defaults: (p, s) => { s.carnetPages = (p.carnet_pages_options || [50])[0]; }
  });

  /* ── CARNET-SOUCHES ── */
  reg('carnet-souches', {
    html: (p, s) => {
      const opts   = p.carnet_souches_options || [2, 3, 4, 5];
      const COLORS = [
        { label:'Blanc', hex:'#ffffff', border:'#d1d5db' },
        { label:'Jaune', hex:'#fef08a', border:'#ca8a04' },
        { label:'Rose',  hex:'#fda4af', border:'#e11d48' },
        { label:'Vert',  hex:'#86efac', border:'#16a34a' },
        { label:'Bleu',  hex:'#93c5fd', border:'#2563eb' },
      ];
      const n    = s.carnetSouches || 2;
      const dots = COLORS.slice(0, n).map(c =>
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;
           background:${c.hex};border:1.5px solid ${c.border};flex-shrink:0" title="${c.label}"></span>`
      ).join('');
      return `<div>
        <div class="s-lbl">Nombre de souches</div>
        <div class="chips">
          ${opts.map(nb => {
            const cDots = COLORS.slice(0, nb).map(c =>
              `<span style="width:8px;height:8px;border-radius:50%;background:${c.hex};border:1px solid ${c.border};flex-shrink:0"></span>`
            ).join('');
            return `<div class="opt chip${s.carnetSouches === nb ? ' on' : ''}"
               onclick="curSel.carnetSouches=${nb};UI.renderForm();UI.renderFooter()">
              <strong>${nb} souches</strong>
              <small style="display:flex;gap:3px;align-items:center;margin-top:2px">${cDots}</small>
            </div>`;
          }).join('')}
        </div>
        ${n > 0 ? `<div style="margin-top:.35rem;display:flex;align-items:center;gap:5px;font-size:.63rem;color:var(--t2)">
          <span style="font-weight:600">Composition :</span>
          <span style="display:flex;gap:4px;align-items:center">${dots}</span>
          <span>${COLORS.slice(0, n).map(c => c.label).join(' + ')}</span>
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s) => { s.carnetSouches = (p.carnet_souches_options || [2])[0]; }
  });

  /* ── CARNET-OPTIONS ── */
  reg('carnet-options', {
    html: (p, s) => {
      const colors = s.carnetColors || 4;
      return `<div>
        <div class="s-lbl">Couleurs d'impression offset</div>
        <div class="seg" style="margin-bottom:.55rem">
          ${[1,2,3,4].map(n =>
            `<button class="seg-btn${colors === n ? ' on' : ''}"
               onclick="curSel.carnetColors=${n};UI.renderForm();UI.renderFooter()"
               title="${n} couleur${n > 1 ? 's' : ''}">${n}c</button>`
          ).join('')}
        </div>
        <div class="s-lbl">Options</div>
        <div class="fac-grid">
          <div class="opt fac-cell${s.carnetNumero ? ' on' : ''}"
            onclick="curSel.carnetNumero=!curSel.carnetNumero;UI.renderForm();UI.renderFooter()">
            <span>Numérotation</span><div class="tog${s.carnetNumero ? ' on' : ''}"></div>
          </div>
          <div class="opt fac-cell${s.carnetPerfo ? ' on' : ''}"
            onclick="curSel.carnetPerfo=!curSel.carnetPerfo;UI.renderForm();UI.renderFooter()">
            <span>Perforage</span><div class="tog${s.carnetPerfo ? ' on' : ''}"></div>
          </div>
          <div class="opt fac-cell${s.carnetCover ? ' on' : ''}"
            onclick="curSel.carnetCover=!curSel.carnetCover;UI.renderForm();UI.renderFooter()">
            <span>Couverture imprimée</span><div class="tog${s.carnetCover ? ' on' : ''}"></div>
          </div>
        </div>
        ${s.carnetNumero ? `
        <div style="margin-top:.4rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span class="s-lbl" style="margin:0">N° de départ :</span>
          <input type="number" class="inp" style="width:90px;flex-shrink:0" min="1" step="1" placeholder="001"
            value="${s.carnetNumStart || 1}"
            oninput="curSel.carnetNumStart=+this.value||1;UI.renderFooter()">
          <span style="font-size:.6rem;color:var(--t3)">Chaque batch commence à ce numéro</span>
        </div>` : ''}
        ${s.carnetCover ? `
        <div style="margin-top:.3rem;font-size:.62rem;color:var(--t3)">
          ${IC.info} Couverture imprimée 1 face, sur papier standard — non comptée dans le nb de feuillets
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s) => {
      s.carnetNumero   = false;
      s.carnetPerfo    = false;
      s.carnetCover    = false;
      s.carnetNumStart = 1;
      s.carnetColors   = 4;
    }
  });

  /* ════════════════════════════════════════════════════════
     ENVELOPE SECTIONS
  ════════════════════════════════════════════════════════ */

  /* ── ENV-SIZE — format chips from DB.envelope_formats ── */
  reg('env-size', {
    html: (p, s, db, entry) => {
      const fmts    = db.envelope_formats || [];
      const allowed = entry?.config?.allowed || null;
      const list    = allowed ? fmts.filter(f => allowed.includes(f.id)) : fmts;
      if (!list.length) return `<div><div class="s-lbl">Format</div><span class="info-tag">${IC.info} Aucun format — ajoutez-en dans Papiers → Enveloppes</span></div>`;
      return `<div>
        <div class="s-lbl">Format</div>
        <div class="pills">
          ${list.map(f => `<div class="opt pill${s.envFormatId === f.id ? ' on' : ''}"
            onclick="curSel.envFormatId='${f.id}';curSel.envTypeId=null;UI.renderForm();UI.renderFooter()">
            ${f.name}
            ${f.w && f.h ? `<span style="font-size:.57rem;opacity:.55;margin-left:3px">${f.w}×${f.h} mm</span>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db) => { s.envFormatId = (db.envelope_formats || [])[0]?.id || null; }
  });

  /* ── ENV-SUPPORT — type chips from DB.envelope_types ── */
  reg('env-support', {
    html: (p, s, db, entry) => {
      const types   = db.envelope_types || [];
      const allowed = entry?.config?.allowed || null;
      const list    = allowed ? types.filter(t => allowed.includes(t.id)) : types;
      if (!list.length) return `<div><div class="s-lbl">Type</div><span class="info-tag">${IC.info} Aucun type — ajoutez-en dans Papiers → Enveloppes</span></div>`;
      return `<div>
        <div class="s-lbl">Type</div>
        <div class="pills">
          ${list.map(t => `<div class="opt pill${s.envTypeId === t.id ? ' on' : ''}"
            onclick="curSel.envTypeId='${t.id}';UI.renderForm();UI.renderFooter()">
            ${t.name}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db) => { s.envTypeId = (db.envelope_types || [])[0]?.id || null; }
  });

  /* ── ENV-OFFSET-COLORS — color count for envelope offset print ── */
  reg('env-offset-colors', {
    html: (p, s, db, entry) => {
      const paper    = (db.paper_stocks || []).find(e => e.id === s.paper && e.envelope);
      const thresh   = entry?.config?.threshold ?? paper?.print_threshold ?? 500;
      const qty      = s.quantity || 0;
      const eligible = qty >= thresh;
      const colors   = s.envColors || 1;
      const costPer  = paper?.print_cost_per_color || 0;
      // FIX: removed local `fmt` that was shadowing the global formatter
      const printCost = eligible ? costPer * colors * qty : 0;
      return `<div>
        <div class="s-lbl">Impression offset</div>
        ${!eligible
          ? `<span class="info-tag">${IC.info} Disponible à partir de ${thresh.toLocaleString('fr-FR')} pcs</span>`
          : `<div class="seg">
              ${[1,2,3,4].map(n => `<button class="seg-btn${colors === n ? ' on' : ''}" onclick="curSel.envColors=${n};UI.renderForm();UI.renderFooter()">${n} coul.</button>`).join('')}
            </div>
            ${costPer > 0 ? `<div style="font-size:.62rem;color:var(--bl);margin-top:.3rem">${fmt(costPer)} DH/coul × ${colors} = ${fmt(printCost)} DH</div>` : ''}`
        }
      </div>`;
    },
    defaults: (p, s) => { s.envColors = 1; }
  });

  /* ── ENV-FENETRE — window preference (no price impact) ── */
  reg('env-fenetre', {
    html: (p, s) => `<div>
      <div class="s-lbl">Fenêtre</div>
      <div class="seg">
        <button class="seg-btn${!s.envFenetre ? ' on' : ''}" onclick="curSel.envFenetre=false;UI.renderForm()">Sans fenêtre</button>
        <button class="seg-btn${s.envFenetre  ? ' on' : ''}" onclick="curSel.envFenetre=true;UI.renderForm()">Avec fenêtre</button>
      </div>
    </div>`,
    defaults: (p, s) => { s.envFenetre = false; }
  });

  /* ════════════════════════════════════════════════════════
     DESIGN-FILE  — file upload OR design service selector
     design_model in entry.config: 'tier' | 'multipage' | 'devis'
     curSel fields:
       designOption    : 'file' | 'service' | null
       designFileName  : string
       designFileSize  : string
       designTier      : tier id | null
       designPages     : number (multipage)
  ════════════════════════════════════════════════════════ */
  reg('design-file', {
    html: (p, s, db, entry) => {
      const opt   = s.designOption || null;
      const model = entry?.config?.design_model || 'tier';
      const waDesigner = (db.contact?.designer_whatsapp || db.contact?.whatsapp || '').replace(/\D/g,'');

      // Tiers — from entry.config first, then db.contact fallback
      const defaultTiers = model === 'multipage'
        ? [
            { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price_base:400,  price_per_page:50  },
            { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price_base:700,  price_per_page:80  },
            { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price_base:1200, price_per_page:120 },
          ]
        : (db.contact?.design_tiers) || [
            { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price:200 },
            { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price:400 },
            { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price:800 },
          ];
      const tiers      = entry?.config?.tiers || defaultTiers;
      const chosenTier = tiers.find(t => t.id === s.designTier);

      const icoUpload = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
      const icoPen    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`;
      const icoWA     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`;

      const tabBtn = (id, ico, label) =>
        `<button class="seg-btn${opt===id?' on':''}" onclick="fSel('designOption','${id}')" type="button">${ico} ${label}</button>`;

      const fileHints = [
        { ico:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>', txt:'Résolution minimale <strong>300 dpi</strong>' },
        { ico:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/>', txt:'Format <strong>PDF, AI ou EPS</strong> vectorisé' },
        { ico:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>', txt:'<strong>3 mm</strong> de fond perdu + marges de sécurité' },
        { ico:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', txt:'Couleurs en mode <strong>CMJN</strong> (pas RVB)' },
      ].map(h => `<div class="design-hint-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11" style="flex-shrink:0;color:var(--bl);margin-top:.1rem">${h.ico}</svg>
        <span>${h.txt}</span>
      </div>`).join('');

      // ── Build WA URL from chosen tier ──
      function _waUrl(tier) {
        if (!waDesigner || !tier) return '';
        let msg = '';
        if (model === 'multipage') {
          const pages = s.designPages || 1;
          const cost  = (tier.price_base || 0) + (tier.price_per_page || 0) * pages;
          msg = 'Bonjour, je voudrais confier la conception de mon ' + (curProd?.name || 'imprimé') +
                ' (' + pages + ' pages) — Niveau ' + tier.label + ' (' + fmt(cost) + ' DH).';
        } else {
          msg = 'Bonjour, je confie la conception de mon ' + (curProd?.name || 'imprimé') +
                ' — Niveau ' + tier.label + ' (' + (tier.price || 0) + ' DH).';
        }
        return 'https://wa.me/' + waDesigner + '?text=' + encodeURIComponent(msg);
      }

      // ── Tier pill: single button with animated slot switch when selected ──
      // First click → selects tier (shows price/name)
      // Selected state → button shows WA state with slide animation
      function _tierPill(t) {
        const on  = s.designTier === t.id;
        const url = on ? _waUrl(t) : '';
        let priceStr = '';
        if (model === 'multipage') {
          const pages = s.designPages || 1;
          priceStr = fmt((t.price_base || 0) + (t.price_per_page || 0) * pages) + ' DH';
        } else {
          priceStr = fmt(t.price || 0) + ' DH';
        }

        if (on && url) {
          // Selected + WA available → animated slot button morphing to WA
          return `<div class="design-tier-pill on design-tier-wa-active">
            <div class="design-tier-slot-wrap">
              <div class="design-tier-slot-out">
                <span class="design-tier-pill-price">${priceStr}</span>
                <span class="design-tier-pill-name">${t.label}</span>
              </div>
              <a class="design-tier-slot-in" href="${url}" target="_blank" rel="noopener"
                onclick="event.stopPropagation()">
                ${icoWA}<span>Engagez un graphiste</span>
              </a>
            </div>
            <div class="design-tier-pill-desc">${t.desc}</div>
            <button class="design-tier-desel" onclick="fSel('designTier',null)" title="Changer">✕</button>
          </div>`;
        }

        return `<div class="design-tier-pill${on ? ' on' : ''}"
          onclick="fSel('designTier','${t.id}')">
          <div class="design-tier-pill-top">
            <span style="width:10px"></span>
            <span class="design-tier-pill-price">${priceStr}</span>
          </div>
          <div class="design-tier-pill-name">${t.label}</div>
          <div class="design-tier-pill-desc">${t.desc}</div>
        </div>`;
      }

      let body = '';

      // ── FILE tab ──
      if (opt === 'file') {
        if (s.designFileName) {
          body = `<div class="design-file-chosen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15" style="color:var(--gn);flex-shrink:0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="design-file-name">${s.designFileName}</span>
            ${s.designFileSize ? `<span class="design-file-sz">${s.designFileSize}</span>` : ''}
            <button class="design-file-rm" onclick="DESIGN.clearFile()" type="button">✕</button>
          </div>
          <div class="design-hints" style="margin-top:.5rem">${fileHints}</div>
          <div style="font-size:.6rem;color:var(--t3);margin-top:.4rem">Envoyez votre fichier par WhatsApp ou email après la commande.</div>`;
        } else {
          body = `<div class="design-drop-zone" id="designDropZone"
            onclick="document.getElementById('designFileInput').click()"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="DESIGN.onDrop(event)">
            ${icoUpload}
            <span>Glissez votre fichier ou <strong>cliquez pour parcourir</strong></span>
            <span class="design-drop-hint">PDF · AI · EPS · PSD · PNG — max 50 Mo</span>
          </div>
          <input type="file" id="designFileInput" style="display:none"
            accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.eps,.tiff,.tif"
            onchange="DESIGN.onFileInput(this)">
          <div class="design-hints" style="margin-top:.6rem">${fileHints}</div>`;
        }

      // ── SERVICE tab ──
      } else if (opt === 'service') {

        if (model === 'tier') {
          body = `<div class="design-tier-row">${tiers.map(_tierPill).join('')}</div>
            ${!chosenTier ? `<div class="design-wa-placeholder">Choisissez un niveau ci-dessus</div>` : ''}`;

        } else if (model === 'multipage') {
          const pages = s.designPages || 1;
          const pageInput = `<div class="design-pages-row">
            <span class="design-pages-lbl">Nombre de pages :</span>
            <div class="design-pages-ctrl">
              <button type="button" onclick="DESIGN.setPages(${Math.max(1,pages-1)})">−</button>
              <span class="design-pages-val">${pages}</span>
              <button type="button" onclick="DESIGN.setPages(${pages+1})">+</button>
            </div>
          </div>`;
          body = pageInput + `<div class="design-tier-row">${tiers.map(_tierPill).join('')}</div>
            ${!chosenTier ? `<div class="design-wa-placeholder">Choisissez un niveau ci-dessus</div>` : ''}`;

        } else if (model === 'devis') {
          const devisText = entry?.config?.devis_text ||
            'Conception sur mesure — tarif selon cahier des charges. Contactez-nous pour un devis gratuit.';
          const waDevisMsg = waDesigner
            ? 'https://wa.me/' + waDesigner + '?text=' + encodeURIComponent('Bonjour, je souhaite un devis de conception pour mon ' + (curProd?.name || 'imprimé') + '.')
            : '';
          body = `<div class="design-devis-block">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18" style="color:var(--bl);flex-shrink:0"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            <p class="design-devis-txt">${devisText}</p>
          </div>
          ${waDevisMsg ? `<a class="design-wa-btn design-wa-slide" href="${waDevisMsg}" target="_blank" rel="noopener">
            ${icoWA}<span>Demander un devis</span>
          </a>` : ''}`;
        }
      }

      return `<div class="design-section">
        <div class="s-lbl">Conception & fichier</div>
        <div class="seg" style="margin-bottom:.65rem">
          ${tabBtn('file',    icoUpload, 'J\'ai mon fichier')}
          ${tabBtn('service', icoPen,    'Créer pour moi')}
        </div>
        ${body}
      </div>`;
    },
  });
  return registry;
})();

/* ════════════════════════════════════════════════════════
   DESIGN  — file picker helpers (global, called from inline events)
════════════════════════════════════════════════════════ */
const DESIGN = (() => {
  function _fmtSize(bytes) {
    if (bytes < 1024)       return bytes + ' o';
    if (bytes < 1048576)    return (bytes/1024).toFixed(0) + ' Ko';
    return (bytes/1048576).toFixed(1) + ' Mo';
  }
  function _apply(file) {
    if (!file) return;
    curSel.designOption   = 'file';
    curSel.designFileName = file.name;
    curSel.designFileSize = _fmtSize(file.size);
    curSel.designTier     = null;
    UI.renderForm();
    UI.renderFooter();
  }
  function onFileInput(input) {
    const file = input.files?.[0]; if (!file) return;
    _apply(file);
    input.value = '';
  }
  function onDrop(e) {
    e.preventDefault();
    document.getElementById('designDropZone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0]; if (!file) return;
    _apply(file);
  }
  function clearFile() {
    curSel.designFileName = null;
    curSel.designFileSize = null;
    UI.renderForm();
    UI.renderFooter();
  }
  function setPages(n) {
    curSel.designPages = Math.max(1, n);
    UI.renderForm();
    UI.renderFooter();
  }
  return { onFileInput, onDrop, clearFile, setPages };
})();


/* ════ sel.js ════ */
/* ════════════════════════════════════════════════════════
   SELECTION DISPATCHER  — maps field name → state mutation
   ════════════════════════════════════════════════════════ */
const SEL = {
  size: v => {
    curSel.size = v;
    // Look up from composition config.items first, then p.sizes
    const allSizes = _getComposition(curProd)
      .flatMap(e => e?.config?.items || [])
      .concat(curProd.sizes || []);
    curSel.sizeObj = allSizes.find(s => s.id === v);
  },
  paper:       v => { curSel.paper = v; },
  paperCover:  v => { curSel.paperCover = v; },
  sides:       v => { curSel.sides = String(v); },
  lam:         v => { curSel.lam = v; },
  lamCover:    v => { curSel.lamCover = v; },
  lamInterior: v => { curSel.lamInterior = v; },
  binding:     v => { curSel.binding = v; },
  fold:        v => { curSel.fold = v; },
  gfMaterial:  v => { curSel.gfMaterial = v; },
  withSupport: v => { curSel.withSupport = v === 'true' || v === true; },
  concType:    v => { curSel.concType = v; curSel.concPages = null; curSel.concFaces = null; curSel.customPrice = null; curSel.customPriceOpen = false; curSel.concNote = ''; curSel.logoTier = null; },
  logoTier:    v => { curSel.logoTier = v; curSel.customPrice = null; curSel.customPriceOpen = false; },
  addon:       v => {
    if (!curSel.addons)      curSel.addons = [];
    if (!curSel.addonFaces)  curSel.addonFaces = {};
    const i = curSel.addons.indexOf(v);
    if (i >= 0) { curSel.addons.splice(i, 1); delete curSel.addonFaces[v]; }
    else        { curSel.addons.push(v); curSel.addonFaces[v] = 1; }
  },
};

// Global dispatcher (called from inline event handlers in section HTML)
function fSel(field, val) {
  if (SEL[field]) SEL[field](val);
  else curSel[field] = val;   // generic fallback for custom fields (chemiseColle, pancarteMat, etc.)
  UI.renderForm();
  UI.renderFooter();
}


/* ════ ui.js ════ */
const UI = (() => {

  /* ── View switcher ── */
  const VIEWS = ['vDB', 'vEmpty', 'vDash', 'vCfg', 'vConfirm'];
  function show(id) {
    VIEWS.forEach(v => {
      const el = $(v); if (!el) return;
      el.style.display = v === id ? 'flex' : 'none';
      if (v === id && v === 'vCfg') el.style.flexDirection = 'column';
    });
  }

  /* ── Sidebar ── */
  let _sbTabs = []; // [{h, l}] for one-open-at-a-time accordion

  // Icon map for well-known conception type IDs
  const CONC_ICON_MAP = {
    'logo':'pen-tool', 'carte':'credit-card', 'charte':'layers',
    'catalogue-conc':'book', 'catalogue':'book', 'mockup':'image',
    'flyer':'layout', 'affiche':'image', 'autre':'file-text',
  };

  function _sbItem(id, label, icon, sub, onClick) {
    const el  = document.createElement('div');
    el.className = 'sb-item sb-item-conc';
    el.id        = 'sb-' + id;
    const ico    = IC[icon] || IC['pen-tool'];
    el.innerHTML = `<div class="sb-ico">${ico}</div>
      <div class="sb-lbl-wrap">
        <span class="sb-lbl">${label}</span>
        ${sub ? `<span class="sb-sub">${sub}</span>` : ''}
      </div>`;
    el.onclick = onClick;
    return el;
  }

  function buildSidebar() {
    const sb   = $('sidebar');
    const foot = $('sbFoot');
    sb.querySelectorAll('.sb-sec').forEach(e => e.remove());
    _sbTabs = [];

    const groups = (DB.sidebar_groups || [{ id:'all', label:'Produits', products: DB.products.map(p => p.id) }])
      .filter(grp => grp.id !== 'signalétique' && grp.id !== 'signaletique');

    const _renderedPids = new Set(); // prevent duplicate DOM nodes when a product appears in multiple groups

    groups.forEach(grp => {
      const sec  = document.createElement('div'); sec.className = 'sb-sec';
      const hdr  = document.createElement('div'); hdr.className = 'sb-grp';
      const list = document.createElement('div'); list.className = 'sb-list';

      hdr.innerHTML = `<span class="sb-grp-lbl">${grp.label}</span><span class="sb-chev">${IC['chev-r']}</span>`;
      hdr.onclick = () => {
        const isOpen = hdr.classList.contains('open');
        _sbTabs.forEach(({ h, l }) => { h.classList.remove('open'); l.classList.remove('open'); });
        if (!isOpen) { hdr.classList.add('open'); list.classList.add('open'); }
      };

      grp.products.forEach(pid => {
        const p = DB.products.find(x => x.id === pid); if (!p) return;
        if (_renderedPids.has(pid)) return;
        _renderedPids.add(pid);

        if (p.product_type === 'conception') {
          // All services come from DB — no hardcoded logo
          (p.conception_types || []).forEach(ct => {
            const icon  = ct.icon || CONC_ICON_MAP[ct.id] || 'pen-tool';
            const model = ct.price_model
              || (ct.packages?.length ? 'packages'
                : ct.price_base != null ? 'per_layout_page'
                : ct.price_per_face != null ? 'per_face' : 'flat');
            let sub = '';
            if (model === 'packages') {
              const prices = (ct.packages || []).map(pk => pk.price).filter(Boolean);
              if (prices.length) sub = 'Dès ' + fmt(Math.min(...prices)) + ' DH';
            } else if (model === 'per_face') {
              sub = fmt(ct.price_per_face || 0) + ' DH/face';
            } else if (model === 'per_layout_page') {
              const base = ct.price_per_layout || ct.price_base || 0;
              sub = base ? 'Dès ' + fmt(base) + ' DH' : '';
            } else {
              sub = ct.price ? fmt(ct.price) + ' DH' : '';
            }
            list.appendChild(_sbItem('conc-' + ct.id, ct.label, icon, sub, () => loadConception(ct.id)));
          });
        } else {
          const el  = document.createElement('div');
          el.className = 'sb-item';
          el.id        = 'sb-' + p.id;
          el.innerHTML = `<div class="sb-ico">${IC[p.icon] || IC.layout}</div><span class="sb-lbl">${p.name}</span>`;
          el.onclick   = () => loadProduct(p.id);
          list.appendChild(el);
        }
      });

      _sbTabs.push({ h: hdr, l: list });
      sec.appendChild(hdr);
      sec.appendChild(list);
      sb.insertBefore(sec, foot);
    });

    // Open first group by default
    if (_sbTabs.length) { _sbTabs[0].h.classList.add('open'); _sbTabs[0].l.classList.add('open'); }
    if (ROLE === 'provider' && $('adminBtn'))  $('adminBtn').style.display  = 'flex';
    if (ROLE === 'provider' && $('sbHomeBtn')) $('sbHomeBtn').style.display = 'flex';
  }

  // No-op stub — kept so external callers don't break
  function _refreshGroupActive() {}

  /* ── Product header ── */
  function renderProductHeader() {
    const isCatAdmin = typeof ADMIN !== 'undefined' && !!ADMIN.catalogueMode;
    const backBtn = isCatAdmin
      ? `<button class="adm-cat-back-btn" onclick="ADMIN.openCatSheet()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
           Catalogue
         </button>`
      : '';
    $('cfgHdr').innerHTML = `
      ${backBtn}
      <div class="cfg-hdr-ico">${IC[curProd.icon] || IC.layout}</div>
      <div>
        <div class="cfg-hdr-title">${curProd.name}</div>
        <div class="cfg-hdr-sub">${editId ? 'Modification en cours' : 'Configurez vos spécifications'}</div>
      </div>`;
  }

  /* ── Form render ── */
  function renderForm() {
    $('cfgScroll').innerHTML =
      _getComposition(curProd).map(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        return SECTIONS[tid]?.html(curProd, curSel, DB, entry) || '';
      }).join('');
  }

  /* ── Footer / price panel ── */
  function renderFooter() {
    const footer = $('cfgFooter');
    const res    = CALC.price(curSel, DB);
    const isEdit = !!editId;
    const ctaLbl = isEdit ? 'Mettre à jour' : 'Ajouter au panier';
    const ctaFn  = isEdit
      ? `CART.update(${editId},CALC.price(curSel,DB))`
      : 'CART.add(CALC.price(curSel,DB))';

    if (!res) {
      footer.innerHTML = `
        <div class="q-hint">Complétez toutes les options pour voir le tarif</div>
        <div class="q-row">
          <div class="q-price"><div class="q-lbl">Total HT</div><div class="q-total">— <span class="cur">DH</span></div></div>
          <button class="btn btn-p" disabled>${IC.cart} ${ctaLbl}</button>
        </div>`;
      return;
    }

    if (ROLE === 'provider') {
      const isCatMode = typeof ADMIN !== 'undefined' && !!ADMIN.catalogueMode;
      const open      = isCatMode ? true : detailOpen;
      const toggleBtn = isCatMode ? '' : `
        <button class="btn-ghost${open ? ' open' : ''}" id="dtog" onclick="UI.toggleDetail()">
          ${open ? 'Masquer' : 'Voir le détail'} ${IC['chev-d']}
        </button>`;
      footer.innerHTML = `
        <div class="q-meta">
          <div class="q-lbl">${isEdit ? 'Nouveau sous-total' : 'Total HT estimé'}</div>
          ${toggleBtn}
        </div>
        <div class="dp${open ? ' open' : ''}" id="dp">
          <div class="di"><div class="di-grid">
            <div class="di-left">${_detailLeft(res)}</div>
            <div class="di-right">${_detailRows(res)}</div>
          </div></div>
        </div>
        <div class="q-row">
          <div class="q-price">
            <div class="q-total">${fmt(res.baseTotal)} <span class="cur">DH</span></div>
            <div class="q-unit">${fmt(res.perUnit)} <strong>DH / unité</strong></div>
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>`;
    } else {
      /* CLIENT — price + add-to-cart only, no cost breakdown */
      footer.innerHTML = `
        <div class="q-row">
          <div class="q-price">
            <div class="q-lbl">${isEdit ? 'Nouveau sous-total' : 'Prix estimé'}</div>
            <div class="q-total">${fmt(res.baseTotal)} <span class="cur">DH</span></div>
            <div class="q-unit">${fmt(res.perUnit)} <strong>DH / unité</strong></div>
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>`;
    }
  }

  function _detailRows(res) {
    const type       = curProd?.product_type;
    const isCat      = type === 'catalogue';
    const isGF       = type === 'grand_format';
    const isRU       = type === 'rollup';
    const isConc     = type === 'conception';
    const isGadget   = type === 'gadget';
    const isPancarte = type === 'pancarte';
    const isCarnet   = type === 'carnet';
    const dbl  = curSel.sides === 'double';
    const row  = (k, v, cls = '') => `<div class="sp"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`;
    const sep  = lbl => `<div class="di-sep">${lbl}</div>`;
    let rows = '';

    if (isCat) {
      const intSideLabel = res.sidesInt === 1 ? 'Recto' : 'R/V';
      const covSideLabel = res.sidesCov === 1 ? 'Recto' : 'R/V';
      const intPagesCount = res.interiorPages ?? Math.max(0, (curSel.pages || 0) - 4);
      rows += sep(`Intérieur (${intPagesCount} pages · ${intSideLabel})`);
      rows += row(`Impression ${res.pObj?.label||''} ${intSideLabel} × ${res.intTotal} f.`, fmt(res.intPrint) + ' DH');
      if (res.intLam > 0) rows += row(res.lamIntF?.label||'', fmt(res.intLam) + ' DH');
      rows += sep(`Couverture (4 pages · ${covSideLabel})`);
      rows += row(`Impression ${res.covObj?.label||''} ${covSideLabel} × ${res.covTotal} f.`, fmt(res.covPrint) + ' DH');
      if (res.covLam > 0) rows += row(res.lamCovF?.label||'', fmt(res.covLam) + ' DH');
      rows += sep('Reliure');
      rows += row(res.bindObj?.label||'', fmt(res.bindCost) + ' DH');
      rows += row('Coupe', fmt(res.cutFee) + ' DH');
    } else if (isGF) {
      const area = (parseFloat(curSel.gfW || 0) / 100 * parseFloat(curSel.gfH || 0) / 100).toFixed(2);
      rows += row(`Matière — ${res.mat?.label}`, fmt(res.matCost) + ' DH');
      rows += row(`Surface ${area} m² × ${fmtN(curSel.quantity)} ex`, '');
      res.finLines?.forEach(l => { rows += row(l.label, fmt(l.cost) + ' DH'); });
    } else if (isRU) {
      rows += row(`Impression ${curSel.sizeObj?.label}`, fmt(res.printCost) + ' DH');
      if (res.supportCost > 0) rows += row(`Support ${curProd.xbanner ? 'X-Banner' : 'aluminium'}`, fmt(res.supportCost) + ' DH');
    } else if (isConc) {
      const pkgLabel = res.concPackage ? ` — ${res.concPackage.label}` : '';
      rows += row(`${res.concType?.label}${pkgLabel}`, fmt(res.raw) + ' DH');
      // Show package includes as bullet list
      if (res.concPackage?.includes?.length) {
        rows += `<div class="sp" style="flex-direction:column;align-items:flex-start;gap:2px;padding:.15rem 0">
          ${res.concPackage.includes.map(inc => `<span style="font-size:.6rem;color:var(--t2)">· ${inc}</span>`).join('')}
        </div>`;
      }
      if (res.isCustomPrice) rows += `<div class="sp"><span class="k" style="font-style:italic;color:var(--pu)">Prix personnalisé</span><span class="v" style="color:var(--pu)">✓</span></div>`;
      if (curSel.concNote)   rows += `<div class="sp" style="flex-direction:column;align-items:flex-start;gap:2px"><span class="k">Brief</span><span style="font-size:.61rem;color:var(--t2);font-style:italic">${curSel.concNote}</span></div>`;
      rows += `<div class="hr"></div>${row('Total', fmt(res.baseTotal) + ' DH', 'bl')}`;
    } else if (isGadget) {
      rows += row('Prix unitaire', fmt(res.unitPrice) + ' DH');
      rows += row('Quantité', fmtN(curSel.quantity) + ' unités');
    } else if (isPancarte) {
      const w = curSel.sizeObj?.w, h = curSel.sizeObj?.h;
      const area = w && h ? ((w / 1000) * (h / 1000)).toFixed(4) : '—';
      rows += row(`Support — ${res.mat?.label}`, `${res.mat?.cost_per_sqm} DH/m²`);
      rows += row(`Surface ${area} m² × ${fmtN(curSel.quantity)} ex`, fmt(res.matCost) + ' DH');
    } else if (isCarnet) {
      const SOUCHE_COLORS = ['Blanc','Jaune','Rose','Vert','Bleu'];
      rows += sep(`NCR — ${res.carnetPages} feuillets × ${res.carnetSouches} souches`);
      rows += row(`Papier NCR (${SOUCHE_COLORS.slice(0, res.carnetSouches).join(' + ')})`, fmt(res.ncrCost) + ' DH');
      rows += row(`${res.totalPrintSheets} feuilles → ${res.pressSheets} f. presse`, '');
      rows += row(`Impression offset × ${res.pressSheets} f.`, fmt(res.printCost) + ' DH');
      if (res.setupCost > 0) rows += row('Calage offset', fmt(res.setupCost) + ' DH');
      if (res.plateCost > 0) rows += row(`Plaques offset × ${res.colorCount} couleurs`, fmt(res.plateCost) + ' DH');
      rows += sep('Finition');
      rows += row('Agrafage', fmt(res.staplingCost) + ' DH');
      if (res.coverCost  > 0) rows += row('Couverture imprimée', fmt(res.coverCost) + ' DH');
      if (res.numeroCost > 0) rows += row('Numérotation', fmt(res.numeroCost) + ' DH');
      if (res.perfoCost  > 0) rows += row('Perforage', fmt(res.perfoCost) + ' DH');
    } else {
      // Standard / envelope
      const techLabel = res.isOffset ? 'Offset' : (dbl ? 'R/V' : 'Recto');
      const paperLabel = res.pObj ? ` — ${res.pObj.label}` : '';
      rows += row(`Impression${paperLabel} ${techLabel} × ${res.sheets} f.`, fmt(res.printCost) + ' DH');
      if (res.isOffset && res.setupCost > 0) rows += row('Calage offset', fmt(res.setupCost) + ' DH');
      if (res.isOffset && res.plateCost > 0) rows += row(`Plaques × ${res.colorCount} couleurs`, fmt(res.plateCost) + ' DH');
      if (res.lamCost > 0) rows += row(`${res.lamF.label}${dbl ? ' × 2 faces' : ''}`, fmt(res.lamCost) + ' DH');
      res.addonLines.filter(l => l.cost > 0).forEach(l => {
        let det = '';
        if      (l.model === 'setup_sheet') det = ` — film + ${res.sheets}f × ${l.faces === 1 ? '1 face' : '2 faces'}`;
        else if (l.model === 'per_sheet')   det = ` — ${res.sheets} feuilles`;
        else if (l.model === 'per_unit')    det = ` — ${fmtN(curSel.quantity)} unités`;
        rows += row(l.label + det, fmt(l.cost) + ' DH');
      });
      if (curProd?.id !== 'enveloppe') rows += row('Coupe + conditionnement', fmt(res.cutFee) + ' DH');
      if (res.chemiseCost > 0) {
        const opts = [curSel.chemiseColle ? 'Rabat collé' : '', curSel.chemiseImprime ? 'Rabat imprimé' : ''].filter(Boolean).join(' + ');
        rows += row(opts, fmt(res.chemiseCost) + ' DH');
      }
      if (curProd?.id === 'sac-shopping' && curSel.sacSoufflet > 0 && curSel.sizeObj?.w) {
        const openW = curSel.sizeObj.w + curSel.sacSoufflet * 2;
        rows += `<div class="sp" style="font-size:.63rem;color:var(--bl);font-style:italic"><span>Format ouvert</span><span>${openW}×${curSel.sizeObj.h} mm</span></div>`;
      }
    }

    if (!isConc && !isGadget && !isPancarte) {
      if (res.discAmt > 0) rows += `<div class="hr"></div>${row(`Remise (${Math.round(res.disc * 100)}%)`, '−' + fmt(res.discAmt) + ' DH', 'hi')}`;
      const marginPct = DB.pricing?.profit_margin > 0 ? Math.round(DB.pricing.profit_margin * 100) : '—';
      rows += `<div class="hr"></div>${row(`Marge (${marginPct}%)`, '+' + fmt(res.profit) + ' DH', 'hi')}`;
      rows += `<div class="sp" style="margin-top:.08rem"><span style="font-weight:600">Sous-total</span><span class="v bl">${fmt(res.baseTotal)} DH</span></div>`;
      rows += `<div class="sp" style="margin-top:.02rem"><span style="font-size:.63rem;color:var(--t3)">Délai &amp; livraison dans le panier</span></div>`;
    }
    return rows;
  }

  function _detailLeft(res) {
    const type       = curProd?.product_type;
    const isGadget   = type === 'gadget';
    const isPancarte = type === 'pancarte';
    const isCarnet   = type === 'carnet';
    const isCat      = type === 'catalogue';
    const isGF       = type === 'grand_format';
    const isRU       = type === 'rollup';
    const isConc     = type === 'conception';
    const sh         = DB.sheet;
    const iconBox = (icon, bg = 'var(--s2)', color = '') =>
      `<div style="width:98px;height:62px;background:${bg};${color ? '' : 'border:1.5px solid var(--bd);'}border-radius:5px;display:flex;align-items:center;justify-content:center${color ? ';color:' + color : ''}">${icon}</div>`;
    const legend = (bold, line2) =>
      `<div class="di-legend"><b>${bold}</b>${line2}</div>`;

    if (isCat) {
      const w = curSel.sizeObj?.w || 148, h = curSel.sizeObj?.h || 210;
      const cf  = CALC.sheetFit(w, h, sh);
      const totalPages = curSel.pages || 0;
      const totalSheets = res.intTotal + res.covTotal;
      const ppp = totalPages > 0 ? fmt(res.baseTotal / totalPages) : '—';
      const sidesLabel = res.sidesInt === 1 ? 'Recto' : 'R/V';
      return sheetSVG(cf, w, h, sh) + legend(
        `${sidesLabel} · ${res.ppsInt||4}p./f.`,
        `Int: ${res.intTotal}f + Couv: ${res.covTotal}f<br>= ${totalSheets} f. · ${ppp} DH/p.`
      );
    }
    if (isGF)   return iconBox(IC.image)  + legend(`${curSel.gfW || '—'}×${curSel.gfH || '—'} cm`, `Grand format<br>${fmtN(curSel.quantity || 0)} ex`);
    if (isRU)   return iconBox(IC.scroll) + legend(curSel.sizeObj?.label || '—', `${curProd.xbanner ? 'X-Banner' : 'Roll-up'}<br>${fmtN(curSel.quantity || 0)} ex`);
    if (isConc) {
      const concIcon = IC[res.concType?.icon || 'pen-tool'] || IC['pen-tool'];
      const concSub  = res.concPackage ? res.concPackage.label : (res.concType?.label || '');
      return iconBox(`<span style="transform:scale(.5);display:flex">${concIcon}</span>`, 'var(--pu-lt)', 'var(--pu)')
        + legend(res.concType?.label || 'Conception', concSub);
    }
    if (isGadget) {
      const gIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:24px;height:24px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      return iconBox(gIco, '#fdf4ff', '#a855f7') + legend(fmtN(curSel.quantity || 0) + ' unités', `${fmt(res.unitPrice || 0)} DH/u`);
    }
    if (isPancarte) {
      const w = curSel.sizeObj?.w, h = curSel.sizeObj?.h;
      const area = w && h ? ((w / 1000) * (h / 1000)).toFixed(3) : '—';
      return iconBox(IC.layout || '', '#fff7ed', '#f97316') + legend(curSel.sizeObj?.label || '—', `${area} m² · ${res.mat?.label || ''}`);
    }
    if (isCarnet) {
      const carnetSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:26px;height:26px"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="12" y1="8" x2="16" y2="8"/><line x1="12" y1="12" x2="16" y2="12"/></svg>`;
      const n = curSel.carnetSouches || 2;
      return iconBox(carnetSvg, '#f0fdf4', '#16a34a')
        + legend(`${fmtN(curSel.quantity || 0)} carnets × ${n}s`, `${curSel.carnetPages || 0} f. · ${fmtN(res.totalPrintSheets || 0)} imp.`);
    }
    if (curSel.sizeObj?.w && curSel.sizeObj?.h) {
      if (curProd?.id === 'enveloppe') {
        const envSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:var(--bl)"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>`;
        return iconBox(envSvg, 'var(--bl-lt)') + legend(`${fmtN(res.sheets)} env.`, `Impression individuelle<br>${res.pObj?.label || ''}`);
      }
      const foldMap = { '2volets':2, '3volets':3, '4volets':4 };
      const nFolds  = curSel.fold ? foldMap[curSel.fold] || 1 : 1;
      const svg     = sheetSVG(res.fit, curSel.sizeObj.w, curSel.sizeObj.h, sh, nFolds > 1 ? { folds: nFolds } : {});
      const grid    = `${res.fit.cols}×${res.fit.rows}${res.fit.rotated ? ' ↻' : ''}`;
      return svg + legend(`${res.unitsPerSheet}×/feuille`, `${grid}<br>${res.sheets} feuilles`);
    }
    return '';
  }

  function toggleDetail() {
    detailOpen = !detailOpen;
    $('dp')?.classList.toggle('open', detailOpen);
    const b = $('dtog');
    if (b) { b.classList.toggle('open', detailOpen); b.innerHTML = `${detailOpen ? 'Masquer' : 'Voir le détail'} ${IC['chev-d']}`; }
  }

  /* ── Edit / cancel ── */
  function cancelEdit() {
    editId = null;
    $('editBanner').classList.remove('on');
    const sub = $('cfgHdr')?.querySelector('.cfg-hdr-sub');
    if (sub) sub.textContent = 'Configurez vos spécifications';
    renderFooter();
  }

  /* ── Input handlers ── */
  function customSizeMM() {
    const w = parseFloat($('cW')?.value), h = parseFloat($('cH')?.value);
    if (w > 0 && h > 0) { curSel.sizeObj = { id:'custom', label:'Sur mesure', dims:`${w}×${h} mm`, w, h }; renderFooter(); }
  }
  function gfDims() {
    curSel.gfW = $('gfW')?.value;
    curSel.gfH = $('gfH')?.value;
    renderForm(); renderFooter();
  }
  function gfFinish(id) {
    if (!curSel.gfFinishes) curSel.gfFinishes = [];
    const i = curSel.gfFinishes.indexOf(id);
    if (i >= 0) curSel.gfFinishes.splice(i, 1); else curSel.gfFinishes.push(id);
    renderForm(); renderFooter();
  }
  function qty(v) {
    curSel.quantity  = v;
    curSel.customQty = false;
    curSel.useOffset = false; // reset offset toggle; pill reappears if still eligible
    renderForm(); renderFooter();
  }
  function qtyCustomOpen() { curSel.customQty = true; renderForm(); renderFooter(); setTimeout(() => $('qtyInp')?.focus(), 0); }
  function qtySelect(v) {
    if (!v) return;
    if (v === 'custom') { curSel.customQty = true; renderForm(); renderFooter(); setTimeout(() => $('qtyInp')?.focus(), 0); }
    else if (v.startsWith('qty:')) { curSel.quantity = +v.slice(4); curSel.customQty = false; renderForm(); renderFooter(); }
  }
  function qtyCustom(v) {
    const n = parseInt(v);
    if (n >= 1) { curSel.quantity = n; curSel.customQty = true; renderFooter(); }
  }
  function catPages(n) { curSel.pages = n; curSel.customPages = false; renderForm(); renderFooter(); }
  function catPagesSelect(v) {
    if (!v) return;
    if (v === 'custom') { curSel.customPages = true; renderForm(); setTimeout(() => $('catPagesWrap')?.querySelector('input')?.focus(), 0); return; }
    if (v.startsWith('pg:')) { curSel.pages = +v.slice(3); curSel.customPages = false; renderForm(); renderFooter(); }
  }
  // FIX: was setting curSel.customQty instead of curSel.customPages — caused custom-pages input to never collapse
  function catPagesCustom(v) {
    const n = parseInt(v);
    if (n >= 4) { curSel.pages = n; curSel.customPages = true; renderFooter(); }
  }
  function addonFaces(id, n) {
    if (!curSel.addonFaces) curSel.addonFaces = {};
    curSel.addonFaces[id] = n;
    renderForm(); renderFooter();
  }
  function toggleAddon()      { curSel.addonOpen = !curSel.addonOpen; renderForm(); }
  function toggleFinition()   { curSel.addonOpen = !curSel.addonOpen; renderForm(); } // alias kept for lam/cat-cov pills
  function toggleSpecPaper()  { curSel.specOpen          = !curSel.specOpen;          renderForm(); }
  function toggleConcCustom() { curSel.customPriceOpen   = !curSel.customPriceOpen;   renderForm(); }
  function toggleNotes()      { $('notesAcc')?.classList.toggle('open'); }
  function expandList(key)    { curSel[key] = true; renderForm(); }
  function toggleOffset() {
    curSel.useOffset = !curSel.useOffset;
    if (curSel.useOffset && !curSel.offsetColors) curSel.offsetColors = 4;
    renderForm(); renderFooter();
  }
  function setOffsetColors(n) { curSel.offsetColors = n; renderForm(); renderFooter(); }

  function toggleMobileMenu() {
    const sb   = $('sidebar');
    const ov   = $('mobSbOverlay');
    const open = sb?.classList.toggle('mob-open');
    ov?.classList.toggle('open', open);
  }

  /* ── Swipe-right to open sidebar (mobile) ── */
  (function _initSwipe() {
    let _tx = 0, _ty = 0, _tracking = false;
    const EDGE  = 28;  // px from left edge to start swipe zone
    const MIN   = 52;  // minimum horizontal distance to trigger
    const MAX_V = 60;  // maximum vertical drift allowed

    document.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      if (t.clientX > EDGE) { _tracking = false; return; }
      _tx = t.clientX; _ty = t.clientY; _tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!_tracking) return;
      _tracking = false;
      const t  = e.changedTouches[0];
      const dx = t.clientX - _tx;
      const dy = Math.abs(t.clientY - _ty);
      if (dx > MIN && dy < MAX_V) {
        const sb = $('sidebar');
        if (sb && !sb.classList.contains('mob-open')) toggleMobileMenu();
      }
    }, { passive: true });
  })();

  /* ── Dashboard home shortcut ── */
  function showDash() {
    document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('on'));
    _refreshGroupActive();
    $('sbHomeBtn')?.classList.add('on');
    show('vDash');
    if (typeof DASHBOARD !== 'undefined') DASHBOARD.refresh();
    $('sidebar')?.classList.remove('mob-open');
    $('mobSbOverlay')?.classList.remove('open');
  }

  /* ── Landing page helpers ── */
  function openFirstProduct() {
    if (!DB?.products?.length) return;
    const first = DB.products.find(p => p.product_type !== 'conception') || DB.products[0];
    if (!first) return;
    if (first.product_type === 'conception') {
      const ct = (first.conception_types || [])[0];
      ct ? loadConception(ct.id) : loadProduct(first.id);
    } else {
      loadProduct(first.id);
    }
  }

  function openProductByType(typeHint) {
    if (!DB?.products?.length) return;
    const p = DB.products.find(x => x.id === typeHint)
           || DB.products.find(x => x.product_type === typeHint)
           || DB.products.find(x => x.name?.toLowerCase().includes(typeHint))
           || DB.products.find(x => x.id?.toLowerCase().includes(typeHint));
    if (p) {
      if (p.product_type === 'conception') {
        const first = (p.conception_types || [])[0];
        first ? loadConception(first.id) : loadProduct(p.id);
      } else {
        loadProduct(p.id);
      }
    } else {
      openFirstProduct();
    }
  }

  return {
    show, buildSidebar, renderProductHeader, renderForm, renderFooter,
    toggleDetail, cancelEdit, showDash,
    customSizeMM, gfDims, gfFinish,
    qty, qtySelect, qtyCustom, qtyCustomOpen,
    catPages, catPagesSelect, catPagesCustom,
    addonFaces, toggleFinition, toggleAddon, toggleSpecPaper, toggleConcCustom, toggleNotes, expandList, toggleOffset, setOffsetColors,
    refreshGroupActive: _refreshGroupActive,
    toggleMobileMenu,
    openFirstProduct, openProductByType,
  };
})();


/* ════ loader.js ════ */
/* ════════════════════════════════════════════════════════
   PRODUCT LOADER  — orchestrates loading a product into the configurator
   ════════════════════════════════════════════════════════ */

/* Load a product by id, optionally with a pre-built selection state (cart edit / conception shortcut) */
function loadProduct(id, presel = null) {
  // Deactivate all sidebar items and dashboard home button
  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('on'));
  $('sbHomeBtn')?.classList.remove('on');

  // Highlight the correct sidebar entry
  if (presel?.concType) {
    $('sb-conc-' + presel.concType)?.classList.add('on');
  } else {
    $('sb-' + id)?.classList.add('on');
  }
  UI.refreshGroupActive();

  curProd = DB.products.find(p => p.id === id);
  if (!curProd) return;

  if (presel) {
    // Restore a previous selection (cart edit) — deep-copy mutable arrays/objects
    curSel = {
      ...presel,
      addons:     [...(presel.addons     || [])],
      addonFaces: { ...(presel.addonFaces || {}) },
      gfFinishes: [...(presel.gfFinishes  || [])],
    };
    if (curSel.addons.length > 0) curSel.addonOpen = true;
  } else {
    // Fresh selection — start with structural base
    curSel = { sides: curProd.sides?.[0] || 'single', addons: [], addonFaces: {}, gfFinishes: [] };

    const _specialTypes = ['grand_format', 'rollup', 'pancarte', 'catalogue', 'carnet', 'gadget', 'conception'];
    const isStandard = !_specialTypes.includes(curProd.product_type);

    if (!isStandard) {
      _getComposition(curProd).forEach(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        SECTIONS[tid]?.defaults?.(curProd, curSel, DB, entry);
      });
      (curProd.default_addons || []).forEach(aid => {
        if (!curSel.addons.includes(aid)) { curSel.addons.push(aid); curSel.addonFaces[aid] = 1; }
      });
      if (!curSel.quantity && curProd.quantities?.length) curSel.quantity = curProd.quantities[0];
    } else {
      // Standard products: no pre-selected size/paper/lam/qty — user picks himself
      (curProd.default_addons || []).forEach(aid => {
        if (!curSel.addons.includes(aid)) { curSel.addons.push(aid); curSel.addonFaces[aid] = 1; }
      });
    }

    detailOpen = false;
  }

  UI.renderProductHeader();
  UI.renderForm();
  UI.renderFooter();
  UI.show('vCfg');

  // Close mobile nav if open
  $('sidebar')?.classList.remove('mob-open');
  $('mobSbOverlay')?.classList.remove('open');
}

/* Load the conception product with a specific service pre-selected (called from sidebar) */
function loadConception(concTypeId) {
  const concProd = DB.products.find(p => p.product_type === 'conception');
  if (!concProd) return;
  const ct = (concProd.conception_types || []).find(x => x.id === concTypeId);
  // For packages model, pre-select first package
  const concPackage = ct?.price_model === 'packages' || ct?.packages?.length
    ? (ct.packages?.[0]?.id || null)
    : null;
  loadProduct(concProd.id, {
    concType:    concTypeId,
    concPackage: concPackage,
    concFaces:   ct?.price_model === 'per_face' ? 1 : null,
    concPages:   ct?.min_pages || null,
    addons:      [],
    addonFaces:  {},
    gfFinishes:  [],
    quantity:    concProd.quantities?.[0] || 1,
  });
}

/* Reset cart and reload current product (or empty state) after a completed order */
function afterCheckout() {
  CART.clear();
  curProd ? loadProduct(curProd.id) : UI.show('vEmpty');
}


/* ════ quotes.js ════ */
const QUOTES = (() => {

  let _abortCtrl = null;   // tracks in-flight fetch so we can cancel on close
  let _isOpen    = false;  // explicit open state — prevents duplicate opens

  /* ── Supabase helper (with abort + 12s timeout) ── */
  async function _req(method, path, body, signal) {
    const timeout = new AbortController();
    const timer   = setTimeout(() => timeout.abort(), 12000);
    const combined = signal
      ? { signal: AbortSignal.any
            ? AbortSignal.any([signal, timeout.signal])
            : signal }               // fallback: prefer caller signal
      : { signal: timeout.signal };
    try {
      return await fetch(`${window.SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          'apikey':        window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        method === 'POST' ? 'return=minimal' : '',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        ...combined,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Save to kote_quotes with full payload (fire-and-forget) ── */
  async function save(ref, items, cartOpts, totals, ta) {
    const d = new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'});
    const tva = Math.round((totals.grand||0)*0.20*100)/100;
    const ttc = Math.round(((totals.grand||0)+tva)*100)/100;
    const payload = {
      ref, date: d,
      items: items.map(i=>({prodName:i.prodName,specs:i.specs||'',notes:i.notes||'',
        quantity:i.quantity,perUnit:i.perUnit,baseTotal:i.baseTotal})),
      totals: {sub:totals.sub,surAmt:totals.surAmt,del:totals.del,grand:totals.grand,tva,ttc},
      ta: ta||{}, shop: (typeof DB!=='undefined'&&DB?.shop)||{},
      waUrl: null, client: null, docType: 'devis',
    };
    try {
      await _req('POST', 'kote_quotes', {
        ref, status:'devis', client_nom:'', client_ice:'',
        total_ht: totals.grand||0, total_ttc: ttc, payload,
      });
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('QUOTES.save failed:', e);
    }
  }

  /* ── Load last 80 quotes — Supabase or embedded JSON fallback ── */
  async function _load() {
    // Cancel any previous in-flight request
    if (_abortCtrl) _abortCtrl.abort();
    _abortCtrl = new AbortController();
    const signal = _abortCtrl.signal;

    const body = $('histBody');
    body.innerHTML = `<div class="hist-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        style="width:20px;height:20px;opacity:.4;animation:spin 1s linear infinite">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
      Chargement…
    </div>`;

    /* JSON mode — use embedded _quotes if available */
    if (DB_MOD.getSource() !== 'supabase') {
      if (window._jsonQuotes?.length) {
        _render(window._jsonQuotes);
      } else {
        body.innerHTML = `<div class="hist-state">Aucun devis dans ce fichier JSON.<br>
          <small style="font-weight:400;margin-top:.2rem;display:block;color:var(--t3)">
            Exportez depuis le mode Supabase pour inclure l'historique.</small></div>`;
      }
      return;
    }

    try {
      const res = await _req('GET', 'kote_quotes?select=*&order=created_at.desc&limit=80', null, signal);
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const quotes = await res.json();
      if (!_isOpen) return;   // panel was closed while loading — discard
      _render(quotes);
    } catch(e) {
      if (e.name === 'AbortError') return;   // clean cancel — do nothing
      if (!_isOpen) return;
      body.innerHTML = `<div class="hist-state hist-err">
        ${IC.alert} Impossible de charger l'historique.<br>
        <small style="font-weight:400;margin-top:.25rem;display:block">${e.message}</small>
        <button class="btn btn-outline" style="margin-top:.6rem;font-size:.65rem;height:28px"
          onclick="QUOTES._reload()">Réessayer</button>
      </div>`;
    }
  }

  /* ── Render the quotes list ── */
  function _render(quotes) {
    const body = $('histBody');
    if (!quotes.length) {
      body.innerHTML = `<div class="hist-state">Aucun devis enregistré.</div>`;
      return;
    }
    body.innerHTML = quotes.map(q => {
      const payload = q.payload || {};
      const items   = Array.isArray(payload.items) ? payload.items
                    : Array.isArray(q.items)        ? q.items : [];
      const d = new Date(q.created_at).toLocaleDateString('fr-MA',
        {day:'2-digit', month:'2-digit', year:'numeric'});
      const t = new Date(q.created_at).toLocaleTimeString('fr-MA',
        {hour:'2-digit', minute:'2-digit'});
      const ttc = q.total_ttc || (q.total_ht * 1.20);
      const statusColor = q.status==='facture' ? 'var(--bl)' : 'var(--t3)';
      const itemsHtml = items.map(i => `
        <div class="hq-item">
          <span class="hq-item-name">
            <span class="hq-item-qty">${fmtN(i.quantity)}</span> ${i.prodName}
          </span>
          <span class="hq-item-price">${fmt(i.baseTotal)} DH</span>
        </div>`).join('');
      const clientLine = q.client_nom
        ? `<span class="hq-meta" style="color:var(--t2);font-weight:600">${q.client_nom}${q.client_ice?' · ICE '+q.client_ice:''}</span>`
        : '';
      const payloadEnc = encodeURIComponent(JSON.stringify({...payload, _dbId: q.id}));
      return `
        <div class="hq-card" id="hqc-${q.id}">
          <div class="hq-top" onclick="document.getElementById('hqc-${q.id}').classList.toggle('open')">
            <div class="hq-left">
              <span class="hq-ref">${q.ref}
                <span style="font-size:.58rem;font-weight:600;color:${statusColor};margin-left:4px;text-transform:capitalize">${q.status||'devis'}</span>
              </span>
              ${clientLine}
              <span class="hq-meta">${d} · ${t}</span>
            </div>
            <div class="hq-right">
              <span class="hq-ht">${fmt(q.total_ht)} DH HT</span>
              <span class="hq-ttc">${fmt(ttc)} DH TTC</span>
            </div>
          </div>
          <div class="hq-items" onclick="event.stopPropagation()">
            ${itemsHtml}
            <div style="display:flex;justify-content:flex-end;padding-top:.3rem;margin-top:.15rem;border-top:1px solid var(--bd)">
              <button onclick="QUOTES.openDoc('${q.id}')" style="background:var(--bl);color:#fff;border:none;border-radius:6px;
                padding:5px 12px;font-size:.65rem;font-weight:700;cursor:pointer;
                display:flex;align-items:center;gap:4px;font-family:inherit">
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'
                  width='11' height='11' stroke-linecap='round' stroke-linejoin='round'>
                  <path d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z'/>
                  <polyline points='14 2 14 8 20 8'/>
                </svg>
                Ouvrir dans l'aperçu
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Open a saved quote in the Invoice previewer ── */
  function openDoc(dbId) {
    QUOTES.close();
    // Find the row we already have in memory (rendered list) — re-fetch if not
    _req('GET', `kote_quotes?id=eq.${dbId}&select=*&limit=1`)
      .then(r=>r.json())
      .then(rows=>{
        const row = rows[0]; if(!row) return;
        const p = row.payload||{};
        const opts = { dbId: row.id, docType: row.status||'devis' };
        if(p.client && (p.client.nom||p.client.id)) opts.client = p.client;
        INVOICE.open(p, opts);
      })
      .catch(e=>console.error('[QUOTES.openDoc]',e));
  }

  /* ── Open ── */
  function open() {
    if (_isOpen) return;   // already open — ignore duplicate calls
    _isOpen = true;
    $('histOverlay').classList.add('open');
    $('histDrawer').classList.add('open');
    _load();
  }

  /* ── Close ── */
  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    // Cancel any pending fetch immediately
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    $('histOverlay').classList.remove('open');
    $('histDrawer').classList.remove('open');
  }

  /* ── Reload (retry button) ── */
  function _reload() { _load(); }

  /* ── Escape key to close ── */
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _isOpen) close(); });

  /* ── Stop clicks inside the drawer from hitting the overlay ── */
  document.addEventListener('DOMContentLoaded', () => {
    const drawer = $('histDrawer');
    if (drawer) drawer.addEventListener('click', e => e.stopPropagation());
  });

  return { save, open, close, openDoc, _reload };
})();


/* ════ cart.js ════ */
/* ════════════════════════════════════════════════════════
   BUILD_ORDER_DF  — shared DF builder (used by CART + DASHBOARD)
   ════════════════════════════════════════════════════════ */
function buildOrderDF(items, totals, taLabel, taDays, ref, date, deliveryCityLabel) {
  const { sub=0, surAmt=0, del=0, grand=0, tva=0, ttc=0 } = totals || {};
  const lines = [
    `╔══════════════════════════════════════════╗`,
    `  DOSSIER DE FABRICATION — ${ref}`,
    `  ${date}${taLabel?' · '+taLabel:''}${taDays?' ('+taDays+')':''}`,
    `╚══════════════════════════════════════════╝`,
    '',
  ];
  (items||[]).forEach((item, idx) => {
    const s = item.snap || {};
    const paperObj  = (DB?.paper_stocks||[]).find(p=>p.id===s.paper);
    const lamObj    = s.lam && s.lam!=='none'          ? (DB?.finishes||[]).find(f=>f.id===s.lam)           : null;
    const lamCovObj = s.lamCover && s.lamCover!=='none' ? (DB?.finishes||[]).find(f=>f.id===s.lamCover)      : null;
    const lamIntObj = s.lamInterior && s.lamInterior!=='none' ? (DB?.finishes||[]).find(f=>f.id===s.lamInterior) : null;
    const bindObj   = s.binding && s.binding!=='none'   ? (DB?.binding_options||[]).find(b=>b.id===s.binding) : null;
    const addonLabels = (s.addons||[]).map(aid => {
      const f = (DB?.finishes_addon||[]).find(x=>x.id===aid);
      return f ? `${f.label}${(s.addonFaces||{})[aid]===2?' (2 faces)':''}` : aid;
    });
    lines.push(`── Produit ${idx+1} : ${item.prodName} ──`);
    if (s.sizeObj?.label)   lines.push(`   Format        : ${s.sizeObj.label}${s.sizeObj.w&&s.sizeObj.h?' ('+s.sizeObj.w+'×'+s.sizeObj.h+' mm)':''}`);
    if (s.gfW && s.gfH)    lines.push(`   Dimensions    : ${s.gfW}×${s.gfH} cm`);
    if (paperObj)           lines.push(`   Support       : ${paperObj.label}`);
    if (s.sides)            lines.push(`   Impression    : ${s.sides==='double'?'Recto-Verso':'Recto'}`);
    if (lamObj)             lines.push(`   Pelliculage   : ${lamObj.label}`);
    if (lamCovObj)          lines.push(`   Pellic. couv. : ${lamCovObj.label}`);
    if (lamIntObj)          lines.push(`   Pellic. int.  : ${lamIntObj.label}`);
    if (bindObj)            lines.push(`   Reliure       : ${bindObj.label}`);
    if (s.pages)            lines.push(`   Pages         : ${s.pages}`);
    if (s.fold)             lines.push(`   Pliage        : ${s.fold}`);
    if (s.carnetPages)      lines.push(`   Feuillets     : ${s.carnetPages} · ${s.carnetSouches||2} souches`);
    if (s.carnetNumero)     lines.push(`   Numérotation  : oui (dès ${s.carnetNumStart||1})`);
    if (s.carnetPerfo)      lines.push(`   Perforage     : oui`);
    if (s.carnetCover)      lines.push(`   Couverture    : imprimée`);
    if (addonLabels.length) lines.push(`   Finitions     : ${addonLabels.join(', ')}`);
    if (s.chemiseColle)     lines.push(`   Rabat collé   : oui`);
    if (s.chemiseImprime)   lines.push(`   Rabat imprimé : oui`);
    if (s.sacSoufflet>0)    lines.push(`   Soufflet      : ${s.sacSoufflet} mm`);
    if (s.designOption==='service'&&s.designTier) {
      const tl = {basic:'Basic',pro:'Pro',premium:'Premium'}[s.designTier]||s.designTier;
      lines.push(`   Conception    : Niveau ${tl} (${fmt(item.snap?.designCost||0)} DH)`);
    }
    if (s.designOption==='file'&&s.designFileName) lines.push(`   Fichier BAT   : ${s.designFileName}`);
    if (item.notes)         lines.push(`   Note          : "${item.notes}"`);
    lines.push(`   Quantité      : ${fmtN(item.quantity)} ex.`);
    lines.push(`   PU HT         : ${fmt(item.perUnit)} DH`);
    lines.push(`   Total HT      : ${fmt(item.baseTotal)} DH`);
    lines.push('');
  });
  lines.push(`── Récapitulatif ──`);
  lines.push(`   Sous-total HT : ${fmt(sub)} DH`);
  if (surAmt>0) lines.push(`   Délai express : +${fmt(surAmt)} DH`);
  if (del>0)    lines.push(`   Livraison${deliveryCityLabel?' ('+deliveryCityLabel+')':''}  : +${fmt(del)} DH`);
  lines.push(`   Total HT      : ${fmt(grand)} DH`);
  lines.push(`   TVA 20%       : ${fmt(tva)} DH`);
  lines.push(`   Total TTC     : ${fmt(ttc)} DH`);
  if (taLabel)              lines.push(`   Délai         : ${taLabel}${taDays?' ('+taDays+')':''}`);
  if (deliveryCityLabel)    lines.push(`   Livraison → ${deliveryCityLabel}`);
  lines.push('');
  lines.push(`══════════════════════════════════════════`);
  return lines.join('\n');
}

function buildOrderDFHtml(items) {
  return (items||[]).map(item => {
    const s = item.snap || {};
    const paperObj  = (DB?.paper_stocks||[]).find(p=>p.id===s.paper);
    const lamObj    = s.lam && s.lam!=='none' ? (DB?.finishes||[]).find(f=>f.id===s.lam) : null;
    const bindObj   = s.binding && s.binding!=='none' ? (DB?.binding_options||[]).find(b=>b.id===s.binding) : null;
    const addonLabels = (s.addons||[]).map(aid=>{
      const f=(DB?.finishes_addon||[]).find(x=>x.id===aid);
      return f ? `${f.label}${(s.addonFaces||{})[aid]===2?' ×2':''}` : aid;
    });
    const specs = [
      s.sizeObj?.label||(s.sizeObj?.w?`${s.sizeObj.w}×${s.sizeObj.h} mm`:null),
      s.gfW&&s.gfH?`${s.gfW}×${s.gfH} cm`:null,
      paperObj?.label,
      s.sides==='double'?'R/V':s.sides==='single'?'Recto':null,
      lamObj?.label,
      bindObj?.label,
      s.pages?`${s.pages}p.`:null,
      s.fold||null,
      ...addonLabels,
      s.designOption==='service'&&s.designTier?`Conception ${{basic:'Basic',pro:'Pro',premium:'Premium'}[s.designTier]||s.designTier}`:null,
      s.designOption==='file'&&s.designFileName?`BAT: ${s.designFileName}`:null,
    ].filter(Boolean);
    return `<li style="padding:.3rem 0;border-bottom:1px solid var(--bd)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem">
        <strong style="font-size:.7rem">${fmtN(item.quantity)} × ${item.prodName}</strong>
        <span style="font-size:.68rem;font-weight:700;color:var(--bl);white-space:nowrap">${fmt(item.baseTotal)} DH</span>
      </div>
      ${specs.length?`<div style="font-size:.62rem;color:var(--t2);margin-top:2px">${specs.join(' · ')}</div>`:''}
      ${item.notes?`<div style="font-size:.61rem;color:var(--am);font-style:italic;margin-top:1px">"${item.notes}"</div>`:''}
    </li>`;
  }).join('');
}

const CART = (() => {
  let items = [];
  let opts  = { turnaround: 'standard', delivery: false, deliveryCityId: null };
  let _lastCheckoutText = '';

  /* ── Badge update ── */
  function _badge() {
    const n = items.length;
    const el = $('cartBadge');
    el.textContent = n;
    el.classList.toggle('on', n > 0);
    $('cartCount').textContent = n;
  }

  /* ── Build specs summary string from a selection state ── */
  function _specs(s) {
    const parts = [];
    const pObj  = DB.paper_stocks.find(p => p.id === s.paper);
    if (s.sizeObj)    parts.push(s.sizeObj.dims || s.sizeObj.label);
    if (s.fold)       parts.push(s.fold.replace('-', ' '));
    if (pObj)         parts.push(pObj.label);
    if (s.paperCover) { const c = DB.paper_stocks.find(p => p.id === s.paperCover); if (c) parts.push('Couv.' + c.label); }
    if (s.lam && s.lam !== 'none') { const lf = DB.finishes.find(f => f.id === s.lam); if (lf) parts.push(lf.label); }
    if (s.lamCover && s.lamCover !== 'none') { const lf = DB.finishes.find(f => f.id === s.lamCover); if (lf) parts.push(lf.label + ' cov.'); }
    (s.addons || []).forEach(id => { const f = (DB.finishes_addon || []).find(x => x.id === id); if (f) parts.push(f.label); });
    if (s.sides === 'double') parts.push('R/V');
    if (s.pages)      parts.push(s.pages + 'p.');
    if (s.binding)    { const b = (DB.binding_options || []).find(x => x.id === s.binding); if (b) parts.push(b.label); }
    if (s.gfMaterial) { const m = (curProd?.gf_materials || []).find(x => x.id === s.gfMaterial); if (m) parts.push(m.label); }
    if (s.gfW && s.gfH) parts.push(s.gfW + '×' + s.gfH + ' cm');
    if (s.concType) {
      if (s.concType === 'logo') {
        parts.push('Design Logo');
      } else {
        const ct = (curProd?.conception_types || []).find(x => x.id === s.concType); if (ct) parts.push(ct.label);
      }
    }
    if (s.withSupport)    parts.push('avec support');
    if (s.gfFinishes?.length) s.gfFinishes.forEach(id => { const f = (DB.gf_finishes || []).find(x => x.id === id); if (f) parts.push(f.label); });
    if (s.pancarteMat)    { const pm = (curProd?.pancarte_materials || []).find(x => x.id === s.pancarteMat); if (pm) parts.push(pm.label); }
    if (s.chemiseColle)   parts.push('Rabat collé');
    if (s.chemiseImprime) parts.push('Rabat imprimé');
    if (s.sacSoufflet > 0) parts.push('Soufflet ' + s.sacSoufflet + ' mm');
    if (s.carnetPages && s.carnetSouches) {
      parts.push(`${s.carnetPages} f. × ${s.carnetSouches} souches`);
      if (s.carnetNumero) parts.push('Numéroté');
      if (s.carnetPerfo)  parts.push('Perforé');
      if (s.carnetCover)  parts.push('Couv. imprimée');
    }
    if (s.designOption === 'file' && s.designFileName) parts.push('Fichier : ' + s.designFileName);
    if (s.designOption === 'service' && s.designTier) {
      const tierLabel = { basic:'Basic', pro:'Pro', premium:'Premium' }[s.designTier] || s.designTier;
      parts.push('Conception ' + tierLabel);
    }
    return parts.join(' · ');
  }

  /* ── Shared clipboard helper — writes text, falls back to execCommand ──
     onSuccess called in both the async success and the fallback path. */
  function _copy(text, onSuccess) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      onSuccess();
    });
  }

  /* ── Build shared quote payload (used by both checkout paths) ──
     Returns everything both checkout() and checkoutInvoice() need so
     the ~20 duplicated lines don't drift apart. */
  function _buildPayload() {
    const ref  = 'KTE-' + Date.now().toString(36).toUpperCase().slice(-6);
    const { sub, surAmt, del, grand } = CALC.cartTotal(items, opts, DB.pricing, DB.delivery_cities);
    const ta   = DB.turnaround_options.find(t => t.id === opts.turnaround);
    const tva  = Math.round(grand * 0.20 * 100) / 100;
    const ttc  = Math.round((grand + tva) * 100) / 100;
    const d    = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' });
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    const waLines = [`*Devis KOTE — ${ref}*`, `Date : ${d}`, ''];
    items.forEach(i => waLines.push(`• ${fmtN(i.quantity)} × ${i.prodName} — ${fmt(i.baseTotal)} DH`));
    waLines.push('', `*Total TTC : ${fmt(ttc)} DH*`, `Délai : ${ta?.days || ta?.label || ''}`);
    const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines.join('\n'))}` : null;
    const itemsSnap = items.map(i => ({
      prodName: i.prodName, specs: i.specs || '', notes: i.notes || '',
      quantity: i.quantity, perUnit: i.perUnit, baseTotal: i.baseTotal,
      snap: {
        designOption:   i.snap?.designOption   || null,
        designTier:     i.snap?.designTier     || null,
        designFileName: i.snap?.designFileName || null,
        designCost:     i.snap?.designCost     || null,
      },
    }));
    // Snapshot the selected delivery city so it's readable in orders
    const deliveryCity = (DB.delivery_cities || []).find(c => c.id === opts.deliveryCityId) || null;
    return { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, itemsSnap, deliveryCity };
  }

  /* ── CRUD ── */
  function add(res) {
    if (!res) return;
    items.push({
      id: Date.now(), prodId: curProd.id, prodName: curProd.name, prodIcon: curProd.icon,
      specs: _specs(curSel), notes: curSel.notes || '',
      baseTotal: res.baseTotal, perUnit: res.perUnit, quantity: curSel.quantity,
      snap: { ...JSON.parse(JSON.stringify(curSel)), designCost: res.designCost || 0 },
    });
    _badge();
    // Option A: green button flash + flying dot → badge pop
    const btn = document.querySelector('#cfgFooter .btn-p');
    if (btn && !btn._flashing) {
      btn._flashing = true;
      if (!btn.querySelector('.btn-slot')) btn.innerHTML = `<span class="btn-slot">${btn.innerHTML}</span>`;
      const slot     = btn.querySelector('.btn-slot');
      const origHTML = slot.innerHTML;
      const succ     = document.createElement('span');
      succ.className = 'btn-slot-success';
      succ.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a5c00" stroke-width="2.5" width="13" height="13" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Ajouté !`;
      btn.appendChild(succ);
      btn.disabled = true;
      requestAnimationFrame(() => {
        slot.classList.add('slide-out');
        btn.classList.add('success-state');
        setTimeout(() => {
          succ.classList.add('slide-in');
          // Launch flying dot toward the cart badge in the header
          _flyToBadge(btn);
          setTimeout(() => {
            succ.classList.remove('slide-in'); succ.classList.add('slide-out');
            btn.classList.remove('success-state');
            setTimeout(() => {
              slot.innerHTML = origHTML; slot.classList.remove('slide-out');
              succ.remove(); btn.disabled = false; btn._flashing = false;
            }, 300);
          }, 800);
        }, 30);
      });
    }
  }

  let _undoItem = null, _undoIdx = -1, _undoTimer = null;

  function _showUndo(item, idx) {
    _undoItem = item; _undoIdx = idx;
    clearTimeout(_undoTimer);
    document.querySelector('.cart-undo-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'cart-undo-toast';
    toast.innerHTML = `<span>${item.prodName} supprimé</span><button onclick="CART.undoRemove()">Annuler</button>`;
    $('cartDrawer').appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    _undoTimer = setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 280); _undoItem = null; }, 4000);
  }

  function undoRemove() {
    if (!_undoItem) return;
    clearTimeout(_undoTimer);
    items.splice(_undoIdx, 0, _undoItem);
    _undoItem = null; _undoIdx = -1;
    document.querySelector('.cart-undo-toast')?.remove();
    _badge(); _renderDrawer();
  }

  function remove(id) {
    const idx = items.findIndex(i => i.id === id); if (idx < 0) return;
    const [item] = items.splice(idx, 1);
    _badge(); _renderDrawer(); _showUndo(item, idx);
  }
  function clear()   { items = []; _badge(); _renderDrawer(); }
  function edit(id) {
    const item = items.find(i => i.id === id); if (!item) return;
    editId = id; close(); loadProduct(item.prodId, item.snap);
    $('editBanner').classList.add('on');
  }
  function update(id, res) {
    if (!res) return;
    const idx = items.findIndex(i => i.id === id); if (idx < 0) return;
    items[idx] = { ...items[idx], specs: _specs(curSel), notes: curSel.notes || '',
      baseTotal: res.baseTotal, perUnit: res.perUnit, quantity: curSel.quantity,
      snap: JSON.parse(JSON.stringify(curSel)) };
    editId = null;
    $('editBanner').classList.remove('on');
    _badge(); UI.renderFooter(); open();
  }

  /* ── Drawer ── */
  function open()   { $('cartOverlay').classList.add('open');    $('cartDrawer').classList.add('open');    _renderDrawer(); }
  function close()  { $('cartOverlay').classList.remove('open'); $('cartDrawer').classList.remove('open'); }
  function resume() { close(); UI.show(curProd ? 'vCfg' : 'vEmpty'); }

  function _renderDrawer() {
    const body   = $('cartBody');
    const optsEl = $('cartOpts');
    const footer = $('cartFooter');

    if (!items.length) {
      body.innerHTML = `<div class="cart-empty">${IC.cart}<span class="cart-empty-txt">Panier vide</span></div>`;
      optsEl.style.display = 'none';
      footer.innerHTML = `<button class="btn-resume" onclick="CART.resume()">${IC['arrow-l']} Continuer</button>`;
      return;
    }

    body.innerHTML = items.map(item => `
      <div class="ci">
        <div class="ci-ico">${IC[item.prodIcon] || IC.layout}</div>
        <div class="ci-body">
          <div class="ci-name"><span class="ci-qty">${fmtN(item.quantity)}</span> ${item.prodName}</div>
          <div class="ci-specs">${item.specs}</div>
          ${item.notes ? `<div class="ci-notes">"${item.notes}"</div>` : ''}
          <div class="ci-price">${fmt(item.baseTotal)} DH</div>
          <div class="ci-unit">${fmt(item.perUnit)} DH / unité</div>
        </div>
        <div class="ci-acts">
          <button class="ci-btn ed" title="Modifier" onclick="CART.edit(${item.id})">${IC.edit}</button>
          <button class="ci-btn rm" title="Supprimer" onclick="CART.remove(${item.id})">${IC.trash}</button>
        </div>
      </div>`).join('');

    optsEl.style.display = 'flex';
    _renderOpts();
    _renderFooter();
  }

  function _renderOpts() {
    const cities = DB.delivery_cities || [];
    const minFee = cities.length ? Math.min(...cities.map(c => c.fee)) : (DB.pricing?.delivery_fee || 25);

    $('cartOpts').innerHTML = `
      <div>
        <div class="s-lbl">Délai de production</div>
        <div class="ta-pills">${DB.turnaround_options.map(t => {
          const cls = t.sur === 0 ? 's0' : t.id === 'same-day' ? 'sh' : 'sp-';
          const lbl = t.sur === 0 ? 'Inclus' : `+${Math.round(t.sur * 100)}%`;
          return `<div class="opt ta-p${opts.turnaround === t.id ? ' on' : ''}" onclick="CART.selTA('${t.id}')">
            <div class="ta-p-name">${t.label}</div>
            <div class="ta-p-days">${t.days}</div>
            <div class="ta-p-sur ${cls}">${lbl}</div>
          </div>`;
        }).join('')}</div>
      </div>
      <div class="opt del-row${opts.delivery ? ' on' : ''}" onclick="CART.toggleDel()">
        <div class="del-l">
          <span style="width:15px;height:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--t2)">${IC.truck.replace('<svg ', '<svg width="15" height="15" ')}</span>
          <div>
            <div class="del-name">Livraison en ville</div>
            <div class="del-sub">Domicile ou bureau</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.35rem">
          <span class="del-price">À partir de ${minFee} DH</span>
          <div class="tog${opts.delivery ? ' on' : ''}"></div>
        </div>
      </div>`;
  }
  function _renderFooter() {
    const footer = $('cartFooter');
    const { sub, surAmt, del, grand } = CALC.cartTotal(items, opts, DB.pricing, DB.delivery_cities);
    const ta = DB.turnaround_options.find(t => t.id === opts.turnaround);
    footer.innerHTML = `
      ${surAmt > 0 ? `<div class="sp"><span class="k">${ta.label} (+${Math.round(ta.sur * 100)}%)</span><span class="v wa">+${fmt(surAmt)} DH</span></div>` : ''}
      ${del > 0 ? (() => {
        const cities = DB.delivery_cities || [];
        const city   = cities.find(c => c.id === opts.deliveryCityId);
        const lbl    = city ? ' — ' + city.label : opts.delivery ? ' (estimation)' : '';
        const cls    = city ? '' : ' mu';
        return `<div class="sp"><span class="k">Livraison${lbl}</span><span class="v${cls}">+${fmt(del)} DH</span></div>`;
      })() : ''}
      <div class="grand-row">
        <span class="grand-lbl">Total HT</span>
        <span class="grand-val">${fmt(grand)} <span class="cur">DH</span></span>
      </div>
      ${ROLE === 'provider'
        ? `<div style="display:flex;gap:.4rem">
             <button class="btn btn-outline btn-h" style="flex:1;justify-content:center" onclick="CART.checkout()">${IC['file-text']} Résumé</button>
             <button class="btn btn-p btn-h" style="flex:1;justify-content:center" onclick="CART.checkoutInvoice()">${IC.printer} Devis PDF</button>
           </div>`
        : `<button class="btn btn-p btn-h" style="width:100%;justify-content:center" onclick="CART.checkout()">${IC['file-text']} Envoyer ma demande</button>`
      }
      <button class="btn-resume" onclick="CART.resume()">${IC['arrow-l']} Continuer mes achats</button>
      <button class="btn-xs" onclick="CART.clear()">Vider le panier</button>`;
  }

  /* ── Checkout — résumé screen + save to Supabase ── */
  function checkout() {
    close();

    /* CLIENT: hand off to order form — skip provider quote flow */
    if (ROLE === 'client') {
      const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, itemsSnap } = _buildPayload();
      ORDERS.open({ ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc }, ta, shop: DB.shop || {} });
      return;
    }

    /* PROVIDER: save + show on-screen résumé */
    const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, itemsSnap } = _buildPayload();
    QUOTES.save(ref, items, opts, { sub, surAmt, del, grand }, ta);

    /* Plain-text summary for clipboard */
    const lines = ['=== DEVIS KOTE ===', `Réf : ${ref}`, `Date : ${d}`, '', '── PRODUITS ──'];
    items.forEach((item, i) => {
      lines.push(`${i + 1}. ${fmtN(item.quantity)} × ${item.prodName}`);
      lines.push(`   ${item.specs}`);
      if (item.notes) lines.push(`   Note : ${item.notes}`);
      lines.push(`   Sous-total : ${fmt(item.baseTotal)} DH  (${fmt(item.perUnit)} DH/u)`);
    });
    lines.push('', '── TOTAUX ──');
    if (surAmt > 0) lines.push(`${ta.label} (+${Math.round(ta.sur * 100)}%) : +${fmt(surAmt)} DH`);
    if (del > 0)    lines.push(`Livraison : +${fmt(del)} DH`);
    lines.push(`Total HT  : ${fmt(grand)} DH`, `TVA 20%   : ${fmt(tva)} DH`, `Total TTC : ${fmt(ttc)} DH`);
    lines.push('', `Délai : ${ta.days || ta.label}`, '======================');
    _lastCheckoutText = lines.join('\n');

    /* ── Rich DF using global helpers ── */
    const deliveryCity = (DB.delivery_cities||[]).find(c=>c.id===opts.deliveryCityId);
    const dfText  = buildOrderDF(items, { sub, surAmt, del, grand, tva, ttc }, ta?.label, ta?.days, ref, d, deliveryCity?.label);
    const dfLines = buildOrderDFHtml(items);

    $('confirmBox').innerHTML = `
      <div class="cf-ico">${IC.check}</div>
      <h2 class="cf-title">Devis validé !</h2>
      <p class="cf-sub">Référence enregistrée · Notre équipe vous contacte sous 24h.</p>
      <div class="ref-box">
        <div class="ref-lbl">Référence</div>
        <div class="ref-val">${ref}</div>
        <table class="cf-table">
          <thead><tr>
            <th>Désignation</th><th class="cf-td-num">Qté</th><th class="cf-td-num">PU HT</th><th class="cf-td-num">Total HT</th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>
                  <strong>${item.prodName}</strong>
                  ${item.specs ? `<br><span style="font-size:.59rem;color:var(--t2);font-weight:400">${item.specs}</span>` : ''}
                  ${item.notes ? `<br><em style="font-size:.57rem;color:var(--t3)">"${item.notes}"</em>` : ''}
                </td>
                <td class="cf-td-num">${fmtN(item.quantity)}</td>
                <td class="cf-td-num" style="color:var(--t2)">${fmt(item.perUnit)}</td>
                <td class="cf-td-num" style="color:var(--bl);font-weight:700">${fmt(item.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${surAmt > 0 ? `<tr><td style="text-align:right;color:var(--t2)" colspan="3">${ta.label} (+${Math.round(ta.sur * 100)}%)</td><td class="cf-td-num" style="color:var(--am)">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0    ? `<tr><td style="text-align:right;color:var(--t2)" colspan="3">Livraison</td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td style="text-align:right;color:var(--t2)" colspan="3">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td style="text-align:right;color:var(--t2)" colspan="3">TVA 20%</td>
              <td class="cf-td-num" style="color:var(--t2)">${fmt(tva)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td style="text-align:right" colspan="3">Total TTC</td>
              <td class="cf-td-num">${fmt(ttc)} DH</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="cf-btns">
        <button class="cf-ico-btn" id="cfCopyBtn" onclick="CART.copyText()" title="Copier le résumé">
          ${IC['file-text']}<span>Copier</span>
        </button>
        ${waUrl
          ? `<a class="cf-ico-btn cf-wa-btn" href="${waUrl}" target="_blank" rel="noopener" title="Envoyer par WhatsApp">${IC.whatsapp}<span>WhatsApp</span></a>`
          : `<button class="cf-ico-btn cf-wa-btn" onclick="ADMIN.open();ADMIN.selectTab('contact')" title="Configurer WhatsApp">${IC.whatsapp}<span>WhatsApp</span></button>`
        }
        ${ROLE === 'provider' ? `
        <button class="cf-ico-btn cf-pdf-btn" onclick="INVOICE.open(window._koteLastQuote)" title="Créer le devis PDF">
          ${IC.printer}<span>Devis PDF</span>
        </button>
        <button class="cf-ico-btn" id="cfDfBtn" onclick="CART.toggleCfDF()" title="Dossier de fabrication">
          ${IC['scroll']}<span>DF</span>
        </button>` : ''}
      </div>
      <div class="df-panel" id="cfDfPanel" style="margin-top:.5rem;text-align:left">
        <div class="df-hdr">
          <span class="df-ttl">Dossier de fabrication</span>
          <button class="btn-ghost" style="font-size:.6rem" onclick="CART.copyDF('${encodeURIComponent(dfText)}',this)">Copier ↗</button>
        </div>
        <ul class="df-list">${dfLines}</ul>
      </div>
      <div style="margin-top:.55rem">
        <button class="btn-xs" onclick="afterCheckout()">← Nouveau devis</button>
      </div>`;

    window._koteLastQuote = {
      ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc },
      ta, shop: DB.shop || {}, waUrl,
    };
    UI.show('vConfirm');
  }

  /* ── Direct-to-Invoice checkout (skips résumé screen) ── */
  function checkoutInvoice() {
    close();
    const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, itemsSnap } = _buildPayload();
    QUOTES.save(ref, items, opts, { sub, surAmt, del, grand }, ta);
    window._koteLastQuote = {
      ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc },
      ta, shop: DB.shop || {}, waUrl,
    };
    INVOICE.open(window._koteLastQuote);
  }

  /* ── Clipboard helpers ── */
  function copyText() {
    const btn   = $('cfCopyBtn');
    const reset = () => { if (btn) { btn.innerHTML = `${IC['file-text']}<span>Copier</span>`; btn.style.background = ''; } };
    _copy(_lastCheckoutText, () => {
      if (btn) { btn.textContent = '✓ Copié !'; btn.style.background = 'var(--gn)'; setTimeout(reset, 2200); }
    });
  }

  function copyDF(encoded, triggerEl) {
    const reset = () => { if (triggerEl) triggerEl.textContent = 'Copier ↗'; };
    _copy(decodeURIComponent(encoded), () => {
      if (triggerEl) { triggerEl.textContent = '✓ Copié !'; setTimeout(reset, 2000); }
    });
  }

  function toggleCfDF() {
    const panel = $('cfDfPanel'), btn = $('cfDfBtn');
    const on = panel.classList.toggle('on');
    if (btn) btn.classList.toggle('on', on);
  }

  let _delOpen = false;      // kept for compat
  let _delDropOpen = false;  // city search dropdown state
  function selTA(id)         { opts.turnaround = id;        _renderOpts(); _renderFooter(); }
  function toggleDel() {
    opts.delivery = !opts.delivery;
    if (!opts.delivery) opts.deliveryCityId = null; // clear city when toggling off
    _renderOpts(); _renderFooter();
  }
  function selCity(id) {
    opts.deliveryCityId = id;
    opts.delivery = true;
    _delDropOpen = false;
    _renderOpts(); _renderFooter();
  }
  function clearCity() {
    opts.deliveryCityId = null;
    _delDropOpen = false;
    _renderOpts(); _renderFooter();
  }
  function toggleDelSection() { _delDropOpen = !_delDropOpen; _renderOpts(); }
  function openCityDrop() {
    _delDropOpen = true;
    _renderDrop('');
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!e.target.closest('.del-search-wrap')) {
          _delDropOpen = false;
          document.removeEventListener('click', _close);
          _renderOpts();
        }
      });
    }, 0);
  }
  function filterCities(q) {
    _delDropOpen = true;
    _renderDrop(q);
  }
  function _renderDrop(q) {
    const drop = $('delCityDrop');
    if (!drop) return;
    const cities = DB.delivery_cities || [];
    const sq = (q||'').toLowerCase().trim();
    const results = sq
      ? cities.filter(c => c.label.toLowerCase().includes(sq)).slice(0, 30)
      : cities.slice(0, 30);
    if (!results.length) {
      drop.innerHTML = `<div class="del-drop-empty">Aucune ville trouvée</div>`;
      return;
    }
    drop.innerHTML = results.map(c => `
      <div class="del-drop-item${opts.deliveryCityId===c.id?' on':''}" onclick="CART.selCity('${c.id}')">
        <span class="del-drop-name">${c.label}</span>
        <span class="del-drop-fee">${fmt(c.fee)} DH</span>
      </div>`).join('');
  }


  /* ── Option A: fly dot from add-button to cart badge ── */
  function _flyToBadge(btn) {
    const badge = $('cartBadge');
    if (!badge || !btn) return;
    const bR = btn.getBoundingClientRect();
    const baBadge = badge.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.style.cssText = [
      'position:fixed',
      `left:${bR.left + bR.width / 2 - 5}px`,
      `top:${bR.top + bR.height / 2 - 5}px`,
      'width:10px', 'height:10px',
      'border-radius:50%',
      'background:#2563eb',
      'pointer-events:none',
      'z-index:9999',
      'transition:none',
    ].join(';');
    document.body.appendChild(dot);
    const dx = (baBadge.left + baBadge.width / 2) - (bR.left + bR.width / 2);
    const dy = (baBadge.top  + baBadge.height / 2) - (bR.top  + bR.height / 2);
    requestAnimationFrame(() => {
      dot.style.transition = 'transform .48s cubic-bezier(.4,0,.2,1), opacity .48s ease';
      dot.style.transform  = `translate(${dx}px,${dy}px) scale(.35)`;
      dot.style.opacity    = '0';
    });
    setTimeout(() => {
      dot.remove();
      // Badge pop
      badge.classList.remove('badge-pop');
      void badge.offsetWidth;
      badge.classList.add('badge-pop');
      setTimeout(() => badge.classList.remove('badge-pop'), 400);
    }, 460);
  }

  return { add, remove, undoRemove, edit, update, clear, open, close, resume, checkout, checkoutInvoice, copyText, toggleCfDF, copyDF, selTA, toggleDel, selCity, clearCity, toggleDelSection, filterCities, openCityDrop, _renderDrop };
})();

