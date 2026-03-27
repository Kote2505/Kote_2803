'use strict';

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
/* ── HTML builder helpers (use only IC global) ── */
const _delBtn = onclick => `<button class="adm-del-btn" onclick="${onclick}" title="Supprimer">${IC.trash}</button>`;
const _addBtn = (label, onclick) => `<button class="adm-add-btn" onclick="${onclick}">${IC.plus} ${label}</button>`;

/* ═══════════════════════════════════════════════════════
   _sbInlineConfig — section builder config panels
   Hoisted outside ADMIN. Uses DB, IC, _delBtn, _addBtn (all global).
   ═══════════════════════════════════════════════════════ */
function _sbInlineConfig(p, pi, entry, ei) {
  const tid = entry.type_id;
  const cfg = entry.config || {};
  const mk  = (field, val, label) => `<label class="adm-chk-lbl" style="font-size:.66rem">
    <input type="checkbox" ${val?'checked':''} onchange="ADMIN.sbToggleCfg(${pi},${ei},'${field}','${label}',this.checked)"> ${label}</label>`;

  switch(tid) {
    case 'size':
    case 'depl-format':
    case 'rollup-size': {
      const items = cfg.items || p.sizes || [];
      const cid   = `sz-list-${pi}-${ei}`;
      const rows  = items.map((s,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <input class="adm-inp-lbl" style="width:70px" value="${s.label||''}" placeholder="Label"
            oninput="ADMIN.sbSizeLabel(${pi},${ei},${i},this.value)">
          <input type="number" class="adm-inp" style="width:44px" value="${s.w||''}" placeholder="W mm"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'w',+this.value)">
          <span style="font-size:.58rem;color:var(--t3)">×</span>
          <input type="number" class="adm-inp" style="width:44px" value="${s.h||''}" placeholder="H mm"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'h',+this.value)">
          <input type="number" class="adm-inp" style="width:44px" value="${s.cost_base||0}" placeholder="DH"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'cost_base',+this.value)">
          ${_delBtn(`ADMIN.sbRemoveSize(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Formats disponibles (label, L×H mm, coût base)</div>
        <div id="${cid}">${rows}</div>
        ${_addBtn('Ajouter format',`ADMIN.sbAddSize(${pi},${ei})`)}
      </div>`;
    }

    case 'qty': {
      const items = cfg.items || p.quantities || [];
      const rows = items.map((q,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <input type="number" class="adm-inp" value="${q}" min="1"
            oninput="ADMIN.sbQtyVal(${pi},${ei},${i},+this.value)">
          <span style="font-size:.62rem;color:var(--t3)">ex.</span>
          ${_delBtn(`ADMIN.sbRemoveQty(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Paliers de quantité</div>
        ${rows}
        ${_addBtn('Ajouter quantité',`ADMIN.sbAddQty(${pi},${ei})`)}
      </div>`;
    }

    case 'cat-pages': {
      const items = cfg.items || p.page_options || [];
      const rows = items.map((n,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <input type="number" class="adm-inp" value="${n}" min="4" step="4"
            oninput="ADMIN.sbQtyVal(${pi},${ei},${i},+this.value)">
          <span style="font-size:.62rem;color:var(--t3)">pages</span>
          ${_delBtn(`ADMIN.sbRemoveQty(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Options de pages</div>
        ${rows}
        ${_addBtn('Ajouter option',`ADMIN.sbAddQty(${pi},${ei})`)}
      </div>`;
    }

    case 'paper': {
      const allowed  = cfg.allowed  || [];
      const special  = cfg.special  || [];
      const rows = (DB.paper_stocks||[]).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'papers',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${ps.label}${ps.special?' <span style="color:var(--pu);font-size:.55rem">★</span>':''}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Std</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${special.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'special','${ps.id}',this.checked)"> Spé</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner"><div class="adm-checks">${rows}</div></div>`;
    }

    case 'cat-int': {
      const allowed = cfg.allowed || [];
      const lam     = cfg.lam || [];
      const paperRows = (DB.paper_stocks||[]).filter(ps=>!ps.special).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${ps.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Intérieur</label>
        </div>`).join('');
      const lamRows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'lam',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${lam.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'lam','${f.id}',this.checked)"> Pelliculage</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.3rem">Papiers intérieur</div>
        <div class="adm-checks">${paperRows}</div>
        <div class="adm-row-sub" style="margin:.4rem 0 .3rem">Pelliculages intérieur</div>
        <div class="adm-checks">${lamRows}</div>
      </div>`;
    }

    case 'cat-cov': {
      const allowed = cfg.allowed || [];
      const lam     = cfg.lam || [];
      const paperRows = (DB.paper_stocks||[]).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${ps.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Couverture</label>
        </div>`).join('');
      const lamRows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'lam',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${lam.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'lam','${f.id}',this.checked)"> Pelliculage</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.3rem">Papiers couverture</div>
        <div class="adm-checks">${paperRows}</div>
        <div class="adm-row-sub" style="margin:.4rem 0 .3rem">Pelliculages couverture</div>
        <div class="adm-checks">${lamRows}</div>
      </div>`;
    }

    case 'lam': {
      const allowed = cfg.allowed || [];
      const rows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner"><div class="adm-checks">${rows}</div></div>`;
    }

    case 'addon': {
      const allowed = cfg.allowed || [];
      const rows = (DB.finishes_addon||[]).map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${f.label} <span style="color:var(--t3);font-size:.58rem">${f.group}</span></label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner"><div class="adm-checks">${rows}</div></div>`;
    }

    case 'gf-options': {
      const allowed = cfg.allowed || [];
      const rows = (DB.gf_finishes||[]).map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
              <circle cx="2.5" cy="2"  r="1.5"/><circle cx="7.5" cy="2"  r="1.5"/>
              <circle cx="2.5" cy="8"  r="1.5"/><circle cx="7.5" cy="8"  r="1.5"/>
              <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
            </svg>
          </span>
          <label style="flex:1;font-size:.67rem">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner"><div class="adm-checks">${rows}</div></div>`;
    }

    /* ── ENV-SIZE: which formats to show ── */
    case 'env-size': {
      const fmts = DB.envelope_formats || [];
      if (!fmts.length) return `<div class="sb-cfg-inner" style="color:var(--t3);font-size:.67rem;padding:.4rem .75rem">Aucun format — ajoutez-en dans Papiers → Enveloppes.</div>`;
      const allowed = cfg.allowed || fmts.map(f=>f.id);
      const rows = fmts.map(f=>`
        <label class="adm-chk-lbl" style="font-size:.66rem">
          <input type="checkbox" ${allowed.includes(f.id)?'checked':''}
            onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)">
          ${f.name}${f.w&&f.h?` <span style="color:var(--t3);font-size:.6rem">${f.w}×${f.h} mm</span>`:''}
        </label>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Formats visibles par le client</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    /* ── ENV-SUPPORT: which types to show ── */
    case 'env-support': {
      const types = DB.envelope_types || [];
      if (!types.length) return `<div class="sb-cfg-inner" style="color:var(--t3);font-size:.67rem;padding:.4rem .75rem">Aucun type — ajoutez-en dans Papiers → Enveloppes.</div>`;
      const allowed = cfg.allowed || types.map(t=>t.id);
      const rows = types.map(t=>`
        <label class="adm-chk-lbl" style="font-size:.66rem">
          <input type="checkbox" ${allowed.includes(t.id)?'checked':''}
            onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${t.id}',this.checked)">
          ${t.name}
        </label>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Types disponibles</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    /* ── ENV-OFFSET-COLORS: threshold override ── */
    case 'env-offset-colors': {
      const thresh = cfg.threshold ?? 500;
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub" style="margin-bottom:.35rem">Seuil minimum pour l'offset (pcs)</div>
        <div style="display:flex;align-items:center;gap:.4rem">
          <input type="number" class="adm-inp" style="width:80px" value="${thresh}" min="1" step="1"
            oninput="ADMIN.sbSetCfg(${pi},${ei},'threshold',+this.value)">
          <span style="font-size:.65rem;color:var(--t3)">pcs minimum</span>
        </div>
      </div>`;
    }

    case 'design-file': {
      const model = cfg.design_model || 'tier';
      const modelBtn = (id, lbl) =>
        `<button type="button" onclick="ADMIN.sbSetCfg(${pi},${ei},'design_model','${id}');ADMIN.sbToggle(${ei})" 
          style="padding:3px 10px;border-radius:5px;font-size:.65rem;font-weight:600;cursor:pointer;font-family:inherit;
          border:1.5px solid ${model===id?'var(--bl)':'var(--bd)'};
          background:${model===id?'var(--bl-lt)':'var(--sf)'};
          color:${model===id?'var(--bl)':'var(--t2)'}">${lbl}</button>`;

      let modelCfg = '';

      if (model === 'tier') {
        const tiers = cfg.tiers || [
          { id:'basic',   label:'Basic',   desc:'Mise en page soignée',         price:200 },
          { id:'pro',     label:'Pro',     desc:'Design créatif + retouches',   price:400 },
          { id:'premium', label:'Premium', desc:'Premium · déclinaisons',       price:800 },
        ];
        modelCfg = tiers.map((t,i) =>
          `<div class="adm-size-row" style="flex-wrap:wrap;gap:.3rem;padding:.3rem 0">
            <input class="adm-inp-lbl" style="width:72px" value="${(t.label||'').replace(/"/g,'&quot;')}"
              placeholder="Label" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'label',this.value)">
            <input class="adm-inp-lbl" style="flex:1;min-width:100px" value="${(t.desc||'').replace(/"/g,'&quot;')}"
              placeholder="Description" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'desc',this.value)">
            <div class="adm-num-wrap" style="flex-shrink:0">
              <input type="number" class="adm-inp" style="width:60px" min="0" step="50" value="${t.price||0}"
                oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'price',+this.value)">
              <span class="adm-num-unit">DH</span>
            </div>
          </div>`
        ).join('');
      } else if (model === 'multipage') {
        const base = cfg.price_base || 0;
        const ppp  = cfg.price_per_page || 0;
        const tiers = cfg.tiers || [
          { id:'basic',   label:'Basic',   desc:'Mise en page soignée',         price_base:400,  price_per_page:50  },
          { id:'pro',     label:'Pro',     desc:'Design créatif + retouches',   price_base:700,  price_per_page:80  },
          { id:'premium', label:'Premium', desc:'Premium · déclinaisons',       price_base:1200, price_per_page:120 },
        ];
        modelCfg = `<div style="font-size:.64rem;color:var(--t3);margin:.2rem 0 .4rem">Prix par niveau : base mise en page + supplément par page</div>` +
          tiers.map((t,i) =>
            `<div class="adm-size-row" style="flex-wrap:wrap;gap:.3rem;padding:.3rem 0">
              <input class="adm-inp-lbl" style="width:72px" value="${(t.label||'').replace(/"/g,'&quot;')}"
                placeholder="Label" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'label',this.value)">
              <input class="adm-inp-lbl" style="flex:1;min-width:80px" value="${(t.desc||'').replace(/"/g,'&quot;')}"
                placeholder="Description" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'desc',this.value)">
              <div class="adm-num-wrap" style="flex-shrink:0">
                <input type="number" class="adm-inp" style="width:60px" min="0" step="50" value="${t.price_base||0}"
                  oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'price_base',+this.value)">
                <span class="adm-num-unit">DH base</span>
              </div>
              <div class="adm-num-wrap" style="flex-shrink:0">
                <input type="number" class="adm-inp" style="width:50px" min="0" step="10" value="${t.price_per_page||0}"
                  oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'price_per_page',+this.value)">
                <span class="adm-num-unit">DH/p.</span>
              </div>
            </div>`
          ).join('');
      } else if (model === 'devis') {
        const txt = cfg.devis_text || 'Conception sur mesure — tarif selon cahier des charges. Contactez-nous pour un devis gratuit.';
        modelCfg = `<div style="display:flex;flex-direction:column;gap:.3rem;padding:.2rem 0">
          <div class="adm-row-sub">Texte affiché au client</div>
          <textarea class="adm-inp-lbl" rows="3" style="width:100%;resize:vertical;padding:.35rem .5rem;font-size:.67rem;line-height:1.45"
            oninput="ADMIN.sbSetCfg(${pi},${ei},'devis_text',this.value)">${txt.replace(/</g,'&lt;')}</textarea>
        </div>`;
      }

      return `<div class="sb-cfg-inner">
        <div style="display:flex;gap:.3rem;margin-bottom:.55rem;flex-wrap:wrap">
          ${modelBtn('tier',       'Forfaits')}
          ${modelBtn('multipage',  'Multipage')}
          ${modelBtn('devis',      'Devis sur mesure')}
        </div>
        ${modelCfg}
      </div>`;
    }

    default:
      return `<div class="sb-cfg-inner" style="color:var(--t3);font-size:.67rem;padding:.4rem .75rem">Pas de configuration pour ce module.</div>`;
  }
}
const ADMIN = (() => {
  const PASS = 'mkbaich';
  const TABS = [
    { id:'pricing',    label:'Tarification' },
    { id:'turnaround', label:'Délais'       },
    { id:'livraison',  label:'Livraison'    },
    { id:'papers',     label:'Papiers'      },
    { id:'finishes',   label:'Pelliculage'  },
    { id:'addons',     label:'Façonnage'    },
    { id:'gf',         label:'Grand Format' },
    { id:'binding',    label:'Reliure'      },
    { id:'carnet',     label:'Carnet NCR'   },
    { id:'conception', label:'Conception'   },
    { id:'products',   label:'Produits'     },
    { id:'sidebar',    label:'Sidebar'      },
    { id:'contact',    label:'Contact'      },
    { id:'auth',       label:'Auth'         },
    { id:'design',     label:'Design'       },
    { id:'images',     label:'Images Doc'   },
  ];
  let activeTab = 'pricing';
  let authed    = false;
  let activeProd = null;
  let activeSec  = null;   // index of currently expanded section card
  let activeGroup = null;  // index of currently expanded sidebar group card
  let _newProdMode = false;
  let _newProdDraft = {};

  /* ── admin.html IS the admin — open/close are stubs ── */
  function open() { if (DB) _showContent(); }

  /* ── Toolbar nav ── */
  /* ── Mode: Dashboard ── */
  function goToDash() {
    _exitCatalogueMode();
    _hideSettings();
    closeNav();
    _setToolbarActive('admBtnDash');
    _setTitle('Tableau de bord');
    _hideAll();
    _hideSplit();
    const vDash = $('vDash');
    if (vDash) { vDash.style.display = 'flex'; vDash.style.flex = '1'; }
    DASHBOARD.refresh?.();
  }

  /* ── Mode: Paramètres ── */
  function toggleNav() {
    const isMobile = window.innerWidth <= 640;
    if (isMobile) {
      // On mobile: use the slide-in drawer (desktop sidebar is hidden via CSS)
      const drawer = $('admNavDrawer');
      const ov     = $('admNavOv');
      const isOpen = drawer?.classList.contains('open');
      if (isOpen) {
        closeNav();
      } else {
        _buildNav();
        drawer?.classList.add('open');
        ov?.classList.add('open');
        // Make sure settings content is visible behind the drawer
        if ($('admBody') && $('admBody').style.display === 'none') _openSettings();
      }
      return;
    }
    const sidebar = $('admSettingsSidebar');
    const isOpen  = sidebar && sidebar.style.display !== 'none';
    if (isOpen) {
      _hideSettings();
    } else {
      _openSettings();
    }
  }

  function _openSettings() {
    _exitCatalogueMode();
    _hideAll();
    _hideSplit();
    const sidebar = $('admSettingsSidebar');
    const body    = $('admBody');
    if (sidebar) sidebar.style.display = 'flex';
    if (body)    body.style.display    = 'block';
    $('admBtnSettings')?.classList.add('on');
    $('admBtnDash')?.classList.remove('on');
    $('admBtnCat')?.classList.remove('on');
    _buildSettingsNav();
    _renderTab(activeTab);
    _setTitle('Paramètres');
  }

  function _hideSettings() {
    const sidebar = $('admSettingsSidebar');
    const body    = $('admBody');
    if (sidebar) sidebar.style.display = 'none';
    if (body)    body.style.display    = 'none';
    $('admBtnSettings')?.classList.remove('on');
  }

  function closeNav() {
    $('admNavOv')?.classList.remove('open');
    $('admNavDrawer')?.classList.remove('open');
  }

  /* ── Mode: Catalogue ── */
  function goToProducts() {
    _hideAll();
    _hideSettings();
    _hideSplit();
    closeNav();
    _setToolbarActive('admBtnCat');
    _setTitle('Catalogue');
    _enterCatalogueMode();
  }

  let _catalogueMode = false;
  function _enterCatalogueMode() {
    _catalogueMode = true;
    const wrap = $('admCatWrap');
    if (wrap) wrap.style.display = 'flex';
    UI.buildSidebar();
    const vEmpty = $('vEmpty');
    if (vEmpty) { vEmpty.style.display = 'flex'; }
    document.body.classList.add('adm-cat-mode');
    detailOpen = true;
  }

  /* ── Mobile: product picker sheet ── */
  let _sheetOpen = false;

  function toggleCatSheet() {
    _sheetOpen ? closeCatSheet() : openCatSheet();
  }

  function openCatSheet() {
    _sheetOpen = true;
    _buildCatSheet();
    $('admCatSheetOv')?.classList.add('open');
    $('admCatSheet')?.classList.add('open');
    // Update banner chevron
    const chev = $('admCatBannerChev');
    if (chev) chev.style.transform = 'rotate(180deg)';
  }

  function closeCatSheet() {
    _sheetOpen = false;
    $('admCatSheetOv')?.classList.remove('open');
    $('admCatSheet')?.classList.remove('open');
    const chev = $('admCatBannerChev');
    if (chev) chev.style.transform = '';
  }

  function _buildCatSheet() {
    const body = $('admCatSheetBody');
    if (!body) return;
    body.innerHTML = '';
    let openGroup = null; // track which group list is open

    (DB.sidebar_groups || []).forEach(grp => {
      if (!grp.products?.length) return;
      const sec = document.createElement('div');
      sec.className = 'sb-sec';

      // Header row
      const hdr = document.createElement('div');
      hdr.className = 'sb-grp';
      hdr.innerHTML = `<span class="sb-grp-lbl">${grp.label}</span><span class="sb-chev">${IC['chev-r']}</span>`;

      // Product list
      const list = document.createElement('div');
      list.className = 'sb-list';

      grp.products.forEach(pid => {
        const p = (DB.products || []).find(x => x.id === pid);
        if (!p) return;
        const el = document.createElement('div');
        el.className = 'sb-item';
        el.id = 'sheet-sb-' + p.id;
        el.innerHTML = `<div class="sb-ico">${IC[p.icon] || IC.layout}</div><span class="sb-lbl">${p.name}</span>`;
        el.onclick = () => {
          loadProduct(p.id);
          closeCatSheet();
          // Update banner label
          const lbl = $('admCatBannerLabel');
          if (lbl) lbl.textContent = p.name;
        };
        list.appendChild(el);
      });

      // Toggle accordion
      hdr.onclick = () => {
        const isOpen = hdr.classList.contains('open');
        // Close all
        body.querySelectorAll('.sb-grp').forEach(h => h.classList.remove('open'));
        body.querySelectorAll('.sb-list').forEach(l => l.classList.remove('open'));
        if (!isOpen) { hdr.classList.add('open'); list.classList.add('open'); }
      };

      sec.appendChild(hdr);
      sec.appendChild(list);
      body.appendChild(sec);
    });

    // Open first group by default
    const firstHdr  = body.querySelector('.sb-grp');
    const firstList = body.querySelector('.sb-list');
    if (firstHdr)  firstHdr.classList.add('open');
    if (firstList) firstList.classList.add('open');
  }

  function _exitCatalogueMode() {
    if (!_catalogueMode) return;
    _catalogueMode = false;
    const wrap = $('admCatWrap');
    if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('adm-cat-mode');
    detailOpen = false;
  }

  /* ── Settings nav (persistent sidebar) ── */
  function _buildSettingsNav() {
    const nav = $('admSettingsNav'); if (!nav) return;
    nav.innerHTML = NAV_GROUPS.map(g => `
      <div class="adm-nav-group">
        <span class="adm-nav-group-lbl">${g.label}</span>
        ${g.items.map(it => `
          <button class="adm-nav-item${activeTab===it.id?' on':''}" onclick="ADMIN._settingsSelectTab('${it.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
            <span>${it.label}</span>
          </button>`).join('')}
      </div>
    `).join('<div class="adm-nav-divider"></div>');
  }

  /* ── Tab builder dispatch — shared by _settingsSelectTab + _renderTab ── */
  const _TAB_BUILDERS = () => ({
    pricing:_bPricing, turnaround:_bTurnaround, livraison:_bLivraison, papers:_bPapers,
    gf_mat:_bGFMat, gadgets_mat:_bGadgetsMat,
    finishes:_bFinishes, addons:_bAddons, gf:_bGF, binding:_bBinding, carnet:_bCarnet, conception:_bConception,
    products:_bProducts, sidebar:_bSidebar, contact:_bContact, auth:_bAuth, design:_bDesign,
    images:_bImages, export:_bExport,
  });

  function _settingsSelectTab(id) {
    // If section builder is open, exit it cleanly first
    if (activeProd) {
      if (_prodUnsaved && !confirm('Modifications non sauvegardées — quitter quand même ?')) return;
      activeProd = null; activeSec = null; _prodUnsaved = false;
      _hideSplit();
    }
    activeTab = id;
    _buildSettingsNav();
    const body = $('admBody');
    if (body) { body.style.display = 'block'; body.innerHTML = _TAB_BUILDERS()[id]?.() || ''; }
    if (id === 'export') _initExportTab();
    _setTitle(NAV_GROUPS.flatMap(g => g.items).find(it => it.id === id)?.label || id);
  }

  /* ── Hide all main views ── */
  function _hideAll() {
    ['vDB','vDash','admBody','admSplit','admCatWrap'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
  }

  /* ── Show admin content tab (legacy / internal) ── */
  function _showContent(id) {
    if (id) activeTab = id;
    _openSettings();
  }

  /* ── Save + feedback (replaces close() sync logic) ── */
  function close() {
    if (DB_MOD.getSource() === 'supabase') {
      const st = $('supaSyncSt');
      if (st) { st.style.display='block'; st.style.color='var(--t3)'; st.textContent='⏳ Syncing…'; }
      DB_MOD.pushToSupabase().then(res => {
        if (!st) return;
        if (res.ok)                   { st.style.color='#22c55e'; st.textContent='✓ Saved'; setTimeout(()=>{st.style.display='none';},3000); }
        else if (res.reason==='permission') { st.style.color='#f59e0b'; st.textContent='⚠ Missing write policy'; }
        else if (res.reason==='no_rows')    { st.style.color='#f59e0b'; st.textContent='⚠ Write blocked — check RLS'; }
        else                               { st.style.color='#ef4444'; st.textContent=`✗ Sync failed (${res.reason})`; }
      });
    }
    // Legacy: close modal stubs
    $('admOverlay')?.classList.remove('open');
    $('admPanel')?.classList.remove('open');
  }

  /* ── Split view helpers ── */
  function _hideSplit() {
    const s = $('admSplit'); if (s) s.style.display = 'none';
    _pvOpen = false;
    const bot = $('admSplitBottom'); if (bot) bot.style.display = 'none';
    _updatePvChev();
  }

  let _pvOpen = false;
  function togglePreview() {
    _pvOpen = !_pvOpen;
    const bot = $('admSplitBottom');
    if (bot) bot.style.display = _pvOpen ? 'flex' : 'none';
    _updatePvChev();
    if (_pvOpen) _renderPreview();
  }
  function _updatePvChev() {
    const chev = $('admPvChev');
    if (chev) chev.style.transform = _pvOpen ? 'rotate(180deg)' : '';
  }

  /* ── Live preview (mini configurator + sheetSVG) ── */
  let _pvSel = {};
  let _pvProdId = null;

  function _renderPreview() {
    const bot = $('admSplitBottom'); if (!bot) return;
    const selEl = $('admPvSelectors'), resEl = $('admPvResult');
    if (!selEl || !resEl) return;

    const p = DB?.products?.find(x => x.id === activeProd);
    if (!p) { selEl.innerHTML = '<div class="adm-pv-loading">Aucun produit sélectionné</div>'; resEl.innerHTML=''; return; }

    // Reset pv state if product changed
    if (_pvProdId !== activeProd) {
      _pvProdId = activeProd;
      _pvSel = {
        sizeId:       p.sizes?.[0]?.id || null,
        paperStockId: null,
        quantity:     p.quantities?.[0] || 100,
        sides:        p.sides?.[0] || 'single',
      };
    }

    const sizes  = p.sizes || [];
    const papers = (DB.paper_stocks||[]).filter(ps => !ps.special && !ps.envelope);
    const qtys   = p.quantities || [100,250,500,1000];
    // fmt comes from globals.js — no local shadow needed
    selEl.innerHTML = `
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Format</div>
        <div class="adm-pv-chips">
          ${sizes.map(sz=>`<button class="adm-pv-chip${_pvSel.sizeId===sz.id?' on':''}" onclick="ADMIN._pvSet('sizeId','${sz.id}')">${sz.label}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Papier</div>
        <div class="adm-pv-chips">
          ${papers.slice(0,8).map(ps=>`<button class="adm-pv-chip${_pvSel.paperStockId===ps.id?' on':''}" onclick="ADMIN._pvSet('paperStockId','${ps.id}')">${ps.label}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Quantité</div>
        <div class="adm-pv-chips">
          ${qtys.map(q=>`<button class="adm-pv-chip${_pvSel.quantity===q?' on':''}" onclick="ADMIN._pvSet('quantity',${q})">${q.toLocaleString('fr-FR')}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Impression</div>
        <div class="adm-pv-chips">
          <button class="adm-pv-chip${_pvSel.sides==='single'?' on':''}" onclick="ADMIN._pvSet('sides','single')">Recto</button>
          <button class="adm-pv-chip${_pvSel.sides==='double'?' on':''}" onclick="ADMIN._pvSet('sides','double')">R/V</button>
        </div>
      </div>`;

    // Compute result
    const sizeObj = sizes.find(s => s.id === _pvSel.sizeId);
    const paper   = (DB.paper_stocks||[]).find(ps => ps.id === _pvSel.paperStockId) || papers[0];
    const qty     = _pvSel.quantity;
    const sh      = DB.sheet || { w:700, h:1000, margin:10, bleed:3 };

    if (!sizeObj || !paper) {
      resEl.innerHTML = '<div class="adm-pv-loading">Sélectionnez un format et un papier</div>';
      return;
    }

    const fit    = CALC.sheetFit(sizeObj.w, sizeObj.h, sh);
    const sheets = Math.ceil(qty / fit.n);
    const dbl    = _pvSel.sides === 'double';
    const printCost = (() => {
      const disc    = CALC.qtyDisc(qty, (DB.pricing||{}).qty_discounts || []);
      const sheetR  = paper.print_recto != null ? paper.print_recto : ((DB.pricing||{}).print_single || 2);
      const sheetRV = paper.print_rv    != null ? paper.print_rv    : ((DB.pricing||{}).print_double || 3);
      return sheets * (dbl ? sheetRV : sheetR) * (1 - disc);
    })();
    const rawCost  = printCost;
    const margin   = DB.pricing?.profit_margin || 0.4;
    const selling  = rawCost / (1 - margin);

    const svg = sheetSVG(fit, sizeObj.w, sizeObj.h, sh);
    resEl.innerHTML = `
      <div class="adm-pv-sheet">${svg}</div>
      <div class="adm-pv-breakdown">
        <div class="adm-pv-bd-row"><span>${fit.cols}×${fit.rows} = ${fit.n} pièces/feuille</span><span>${sheets.toLocaleString('fr-FR')} feuilles</span></div>
        <div class="adm-pv-bd-row"><span>Impression ${paper.label} (${dbl?'R/V':'Recto'})</span><span>${fmt(printCost)} DH</span></div>
        <div class="adm-pv-bd-row adm-pv-bd-total"><span>Total HT (marge ${Math.round(margin*100)}%)</span><span>${fmt(selling)} DH</span></div>
        <div class="adm-pv-bd-row adm-pv-bd-unit"><span>Prix unitaire</span><span>${fmt(selling/qty)} DH/pce</span></div>
      </div>`;
  }

  function _pvSet(key, val) {
    _pvSel[key] = val;
    _renderPreview();
  }

  /* ── Toolbar state helpers ── */
  function _setToolbarActive(btnId) {
    ['admBtnDash','admBtnCat','admBtnSettings'].forEach(id => $(id)?.classList.remove('on'));
    if (btnId) $(btnId)?.classList.add('on');
    const map = { admBtnDash:'admBotDash', admBtnSettings:'admBotSettings', admBtnCat:'admBotCat' };
    ['admBotDash','admBotSettings','admBotCat'].forEach(id => $(id)?.classList.remove('on'));
    if (btnId && map[btnId]) $(map[btnId])?.classList.add('on');
  }

  /* ── Sync mobile dot indicator with real DB status dot ── */
  function syncDbDot() {
    const dot = $('dbDot'), ind = $('admDbDotIndicator');
    if (!dot || !ind) return;
    ind.className = 'adm-tb-dot-indicator';
    if      (dot.classList.contains('connected')) ind.classList.add('connected');
    else if (dot.classList.contains('error'))     ind.classList.add('error');
    else                                          ind.classList.add('pending');
  }

  /* ── Mobile DB dot dropdown ── */
  function toggleDbOverflow() {
    const dd = $('admDbDropdown');
    if (!dd) return;
    dd.classList.toggle('open');
    // Sync mobile status text
    const st = $('dbStatus');
    const stMob = $('dbStatusMob');
    if (st && stMob) stMob.textContent = st.textContent;
    // Sync mobile dot
    const dot = $('dbDot'), dotMob = $('dbDotMob');
    if (dot && dotMob) dotMob.className = dot.className;
    // Close on outside click
    if (dd.classList.contains('open')) {
      setTimeout(() => {
        const close = e => { if (!dd.contains(e.target) && e.target.id !== 'admDbDotBtn') { dd.classList.remove('open'); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 10);
    }
  }
  function closeDbOverflow() {
    $('admDbDropdown')?.classList.remove('open');
  }

  function _setTitle(t) {
    const el = $('admTbTitle'); if (el) el.textContent = t;
  }

  /* ── openPanel: called from db.js _apply after DB loads ── */
  function _openPanel() {
    _buildNav();
    _renderTab(activeTab);
    const tag = $('admSourceTag');
    if (tag) tag.textContent = DB_MOD.getSource() === 'supabase' ? 'Supabase' : 'JSON local';
    $('admOverlay')?.classList.add('open');
    $('admPanel')?.classList.add('open');
  }

  /* ── Nav ── */
  const NAV_GROUPS = [
    { label: 'Tarification', items: [
      { id:'pricing',    label:'Tarifs & Marges',  icon:'<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>' },
    ]},
    { label: 'Matières & Finitions', items: [
      { id:'papers',      label:'Papiers',           icon:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
      { id:'gf_mat',      label:'Grand Format',      icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>' },
      { id:'gadgets_mat', label:'Gadgets',           icon:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
    ]},
    { label: 'Services', items: [
      { id:'turnaround', label:'Délais',             icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { id:'livraison',  label:'Livraison',          icon:'<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
      { id:'conception', label:'Conception',         icon:'<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>' },
      { id:'design',     label:'Design fichiers',    icon:'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>' },
    ]},
    { label: 'Catalogue', items: [
      { id:'products',   label:'Produits',          icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
      { id:'sidebar',    label:'Sidebar',           icon:'<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' },
    ]},
    { label: 'Boutique', items: [
      { id:'contact',    label:'Contact & Shop',    icon:'<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.15 1.18 2 2 0 012.13 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>' },
      { id:'auth',       label:'Authentification',  icon:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' },
    ]},
    { label: 'Système', items: [
      { id:'images',     label:'Images Doc',        icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>' },
      { id:'export',     label:'Export & Backup',   icon:'<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>' },
    ]},
  ];

  function _buildNav() {
    const nav = $('admNav'); if (!nav) return;
    nav.innerHTML = NAV_GROUPS.map(g => `
      <div class="adm-nav-group">
        <span class="adm-nav-group-lbl">${g.label}</span>
        ${g.items.map(it => `
          <button class="adm-nav-item${activeTab===it.id?' on':''}" onclick="ADMIN.selectTab('${it.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
            <span>${it.label}</span>
          </button>`).join('')}
      </div>
    `).join('<div class="adm-nav-divider"></div>');
  }

  function selectTab(id) {
    // If section builder is open, exit it cleanly first
    if (activeProd) {
      if (_prodUnsaved && !confirm('Modifications non sauvegardées — quitter quand même ?')) return;
      activeProd = null; activeSec = null; _prodUnsaved = false;
      _hideSplit();
    }
    activeTab = id;
    _openSettings();
    _settingsSelectTab(id);
    if (id === 'export') _initExportTab();
  }

  function _renderTab(id) {
    const body = $('admBody'); if (!body) return;
    body.innerHTML = _TAB_BUILDERS()[id]?.() || '';
  }

  /* ── Re-render product editor into whichever container is active ── */
  function _renderProd() {
    // In split view: render into admSplitContent
    const split = $('admSplit');
    if (split && split.style.display !== 'none') {
      const content = $('admSplitContent');
      if (content) { content.innerHTML = _bProducts(); return; }
    }
    // In settings mode: render into admBody
    const body = $('admBody');
    if (body) body.innerHTML = _bProducts();
  }

  /* ══ BUILDER HELPERS ══ */
  const _svg = (d,sw=1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" style="width:12px;height:12px">${d}</svg>`;

  // Card with new header design
  const _card = (title, iconPath, content, full=false) => `
    <div class="adm-card${full?' adm-card-full':''}">
      <div class="adm-card-hdr">
        <div class="adm-card-hdr-l">
          <div class="adm-card-hdr-ico">${_svg(iconPath)}</div>
          <div><div class="adm-card-title">${title}</div></div>
        </div>
      </div>
      <div class="adm-rows">${content}</div>
    </div>`;

  // Card with right-side action
  const _cardAct = (title, iconPath, action, content, full=false) => `
    <div class="adm-card${full?' adm-card-full':''}">
      <div class="adm-card-hdr">
        <div class="adm-card-hdr-l">
          <div class="adm-card-hdr-ico">${_svg(iconPath)}</div>
          <div><div class="adm-card-title">${title}</div></div>
        </div>
        ${action}
      </div>
      <div class="adm-rows">${content}</div>
    </div>`;

  const _row = (label, sub, inp) => `
    <div class="adm-row">
      <div><div class="adm-row-label">${label}</div>${sub?`<div class="adm-row-sub">${sub}</div>`:''}</div>
      ${inp}
    </div>`;

  const _row3 = (a,b,c) => `<div class="adm-row-3">${a}${b}${c}</div>`;

  const _numInp = (path, val, unit='DH', step='0.01') =>
    `<div class="adm-num-wrap"><input type="number" class="adm-inp" step="${step}" min="0" value="${+val||0}" oninput="ADMIN.set('${path}',+this.value)"><span class="adm-num-unit">${unit}</span></div>`;

  const _pctInp = (path, val) =>
    `<div class="adm-num-wrap"><input type="number" class="adm-inp" step="1" min="0" max="100" value="${Math.round((+val||0)*100)}" oninput="ADMIN.set('${path}',+this.value/100)"><span class="adm-num-unit">%</span></div>`;

  const _txtInp = (path, val, w='130px') =>
    `<input class="adm-inp-lbl" style="width:${w}" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="Label" oninput="ADMIN.set('${path}',this.value)">`;

  const _sec = (title, content) => `
    <div class="adm-sec-title">${title}</div>${content}`;

  // Page header helper
  const _pageHdr = (title, sub, action='') => `
    <div class="adm-page-hdr">
      <div><div class="adm-page-title">${title}</div>${sub?`<div class="adm-page-sub">${sub}</div>`:''}</div>
      ${action}
    </div>`;

  /* ══ TAB BUILDERS ══ */

  function _bPricing() {
    const p   = DB.pricing  || {};
    const off = DB.offset   || {};
    const sh  = DB.sheet    || {};
    const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
    const lams      = (DB.finishes     ||[]).filter(f=>f.id!=='none');
    const addons    =  DB.finishes_addon||[];
    const gfFins    =  DB.gf_finishes  ||[];
    const bindings  =  DB.binding_options||[];
    const gfMats    =  DB.gf_materials ||[];
    const ruSups    =  DB.rollup_supports||[];
    const carnetProd= (DB.products||[]).find(p=>(p.calc_engine==='carnet')||p.product_type==='carnet');
    const carnetPi  = carnetProd ? DB.products.indexOf(carnetProd) : -1;
    const cp        = carnetProd?.carnet_pricing||{};

    /* ── mode toggles persisted in DB.pricing ── */
    const numMode = p._print_mode  || 'detailed';
    const offMode = p._offset_mode || 'detailed';

    const modeBtns = (current, pathKey) => ['detailed','planche'].map(m =>
      `<button style="padding:3px 10px;font-size:.63rem;font-weight:600;border:none;cursor:pointer;
        background:${current===m?'var(--bl)':'transparent'};color:${current===m?'#fff':'var(--t2)'}"
        onclick="ADMIN.set('${pathKey}','${m}');ADMIN._renderTab('pricing')">${m==='detailed'?'Détaillé':'Planche'}</button>`
    ).join('');

    const togRow = (val,path,lbl,sub) => `<div class="adm-toggle-row">
      <div class="adm-toggle-lbl-wrap"><div class="adm-toggle-lbl">${lbl}</div>${sub?`<div class="adm-toggle-sub">${sub}</div>`:''}
      </div><label class="tog${val?' on':''}" onclick="this.classList.toggle('on');ADMIN.set('${path}',this.classList.contains('on'));ADMIN._renderTab('pricing')"></label>
    </div>`;

    return `
      ${_pageHdr('Tarifs & Marges','Tous les coûts de production, finitions et marges')}

      <!-- MARGE GLOBALE -->
      <div class="adm-hero-card">
        <div>
          <div class="adm-hero-lbl">Marge bénéficiaire globale</div>
          <div class="adm-hero-val" id="heroMarginVal">${Math.round((+p.profit_margin||0)*100)}%</div>
          <div class="adm-hero-sub">Appliquée à tous les produits du catalogue</div>
        </div>
        <div class="adm-hero-inp-wrap">
          <input type="number" class="adm-hero-inp" id="heroMarginInp" step="1" min="0" max="100"
            value="${Math.round((+p.profit_margin||0)*100)}"
            oninput="ADMIN.set('pricing.profit_margin',+this.value/100);document.getElementById('heroMarginVal').textContent=this.value+'%'">
          <span class="adm-hero-unit">%</span>
        </div>
      </div>

      <!-- ROW 1: INFO + OFFSET -->
      <div class="adm-grid">
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M6 2v6l-2 2v6h16v-6l-2-2V2"/><line x1="10" y1="12" x2="14" y2="12"/>')}</div>
              <div>
                <div class="adm-card-title">Impression numérique</div>
                <div class="adm-card-sub">Prix consolidé par papier</div>
              </div>
            </div>
          </div>
          <div class="adm-rows">
            <div style="display:flex;align-items:flex-start;gap:.5rem;padding:.6rem .85rem;font-size:.68rem;color:var(--t2);line-height:1.65;background:var(--bl-lt);border-radius:0 0 var(--r) var(--r)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;flex-shrink:0;margin-top:2px;color:var(--bl)"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Les prix d'impression sont désormais définis <strong>par papier</strong> dans l'onglet
              <button onclick="ADMIN._settingsSelectTab('papers')" style="background:none;border:none;color:var(--bl);font-weight:700;cursor:pointer;font-family:inherit;font-size:.68rem;text-decoration:underline;padding:0">Papiers →</button>
              <br>Chaque papier a son coût <strong>Recto</strong> et <strong>R/V</strong> par feuille A3+.</span>
            </div>
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>')}</div>
              <div class="adm-card-title">Impression offset</div></div>
            <div style="display:flex;gap:2px;border:1px solid var(--bd);border-radius:6px;overflow:hidden">
              ${modeBtns(offMode,'pricing._offset_mode')}
            </div>
          </div>
          <div class="adm-rows">
            ${togRow(off.enabled!==false,'offset.enabled','Activer l\'offset','Proposer l\'offset pour les gros volumes')}
            ${_row('Seuil feuilles','déclenchement suggestion',_numInp('offset.min_sheets',off.min_sheets||1000,'f.','1'))}
            ${offMode==='detailed' ? `
              ${_row('Calage','frais fixes par job',_numInp('offset.setup_cost',off.setup_cost||0,'DH','1'))}
              ${_row('Plaques','coût × nb couleurs',_numInp('offset.cost_per_plate',off.cost_per_plate||0,'DH','1'))}
              ${_row('Recto','DH par feuille',_numInp('offset.print_single',off.print_single||1.5))}
              ${_row('Recto-Verso','DH par feuille',_numInp('offset.print_double',off.print_double||2))}
            ` : `
              ${_row('Recto','DH par planche',_numInp('offset.planche_recto',off.planche_recto||6))}
              ${_row('Recto-Verso','DH par planche',_numInp('offset.planche_rv',off.planche_rv||7))}
            `}
          </div>
        </div>
      </div>

      <!-- ROW 2: PLANCHES + PRESSE -->
      <div class="adm-grid" style="margin-top:.85rem">
        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>')}</div>
              <div class="adm-card-title">Formats de planche & Feuille de presse</div></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
            <div style="padding:.5rem .85rem;border-right:1px solid var(--bd)">
              <div style="font-size:.62rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem">Formats disponibles</div>
              ${planches.map((pl,i)=>`
                <div style="display:flex;align-items:center;gap:.4rem;padding:.2rem 0">
                  <span style="font-size:.7rem;font-weight:700;color:var(--t1);width:32px">${pl.id}</span>
                  ${_numInp(`planches.${i}.w`,pl.w,'mm L')}
                  <span style="font-size:.6rem;color:var(--t3)">×</span>
                  ${_numInp(`planches.${i}.h`,pl.h,'mm H')}
                </div>`).join('')}
              <div style="padding:.4rem 0"><button class="adm-action-btn" onclick="ADMIN.addPlanche()">${IC.plus} Ajouter format</button></div>
            </div>
            <div style="padding:.5rem .85rem">
              <div style="font-size:.62rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.4rem">Paramètres globaux</div>
              ${_row('Marge presse','mm — tous formats',_numInp('sheet.margin',sh.margin,'mm','0.5'))}
              ${_row('Fond perdu','mm — tous formats',_numInp('sheet.bleed',sh.bleed,'mm','0.5'))}
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 3: GRAND FORMAT + CARNET NCR -->
      <div class="adm-grid" style="margin-top:.85rem">
        <!-- MATIÈRES GRAND FORMAT -->
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>')}</div>
              <div><div class="adm-card-title">Grand Format — matières</div>
              <div class="adm-card-sub">Bâche, vinyle, oneway, papier, duratrans, regulus…</div></div></div>
            <button class="adm-action-btn" onclick="ADMIN.addGfMat()">${IC.plus} Ajouter</button>
          </div>
          <div class="adm-rows">
            ${gfMats.length ? gfMats.map((m,i)=>_row3(
              `<div>${_txtInp(`gf_materials.${i}.label`,m.label)}<div class="adm-row-sub">${m.id}</div></div>`,
              `<div style="display:flex;gap:.3rem">${_numInp(`gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm||0,'DH/m²')}${_numInp(`gf_materials.${i}.laize`,m.laize||1,'m laize','0.1')}</div>`,
              _delBtn(`ADMIN.removeGfMat(${i})`)
            )).join('') : `<div class="adm-empty" style="padding:1rem">Aucune matière — ajoutez-en une</div>`}
          </div>
          <div class="adm-rows" style="border-top:1px solid var(--bd)">
            <div style="font-size:.62rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;padding:.35rem .85rem .1rem">Finitions GF (oeillets, lam, contrecollage…)</div>
            ${gfFins.map((f,i)=>`
              <div style="display:flex;align-items:center;gap:.5rem;padding:.25rem .85rem;border-bottom:1px solid var(--bd)">
                <div style="flex:1;font-size:.7rem;color:var(--t1)">${f.label}</div>
                ${f.cost_per_sqm!=null?_numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²'):_numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1')}
                ${_delBtn(`ADMIN.removeGfFinish(${i})`)}
              </div>`).join('')}
            <div style="padding:.35rem .85rem"><button class="adm-action-btn" onclick="ADMIN.addGfFinish()">${IC.plus} Finition GF</button></div>
          </div>
        </div>

        <!-- SUPPORTS ROLL-UP / X-BANNER + CARNET -->
        <div style="display:flex;flex-direction:column;gap:.85rem">
          <div class="adm-card">
            <div class="adm-card-hdr">
              <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M12 2v20M2 12h20"/>')}</div>
                <div><div class="adm-card-title">Supports Roll-up / X-banner</div>
                <div class="adm-card-sub">Mécanismes — prix par unité</div></div></div>
              <button class="adm-action-btn" onclick="ADMIN.addRuSupport()">${IC.plus} Ajouter</button>
            </div>
            <div class="adm-rows">
              ${ruSups.length ? ruSups.map((s,i)=>_row3(
                `<div>${_txtInp(`rollup_supports.${i}.label`,s.label)}<div class="adm-row-sub">${s.id}</div></div>`,
                _numInp(`rollup_supports.${i}.cost`,s.cost||0,'DH'),
                _delBtn(`ADMIN.removeRuSupport(${i})`)
              )).join('') : `<div class="adm-empty" style="padding:.75rem">Aucun support</div>`}
            </div>
          </div>

          ${carnetProd ? `
          <div class="adm-card">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>')}</div>
              <div class="adm-card-title">Carnet NCR</div></div></div>
            <div class="adm-rows">
              ${[2,3,4,5].map(n=>{const labels={2:'2s (B+J)',3:'3s (B+J+R)',4:'4s (B+J+R+V)',5:'5 souches'};return _row(labels[n],'DH/set',_numInp(`products.${carnetPi}.carnet_pricing.ncr_cost_per_set.${n}`,(cp.ncr_cost_per_set||{})[String(n)]||0,'DH'));}).join('')}
              <div style="height:1px;background:var(--bd);margin:.2rem 0"></div>
              ${_row('Couverture','DH/f. presse',_numInp(`products.${carnetPi}.carnet_pricing.cover_print_cost_per_sheet`,cp.cover_print_cost_per_sheet||0))}
              ${_row('Agrafage','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.stapling_cost_per_carnet`,cp.stapling_cost_per_carnet||0))}
              ${_row('Numérotation','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.numbering_cost_per_carnet`,cp.numbering_cost_per_carnet||0))}
              ${_row('Perforage','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.perforation_cost_per_carnet`,cp.perforation_cost_per_carnet||0))}
            </div>
          </div>` : ''}
        </div>
      </div>

      <!-- ROW 4: FAÇONNAGE & FINITIONS -->
      <div class="adm-grid" style="margin-top:.85rem">
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>')}</div>
              <div class="adm-card-title">Pelliculage</div></div>
            <button class="adm-action-btn" onclick="ADMIN.addLam()">${IC.plus} Ajouter</button>
          </div>
          <div class="adm-rows">
            ${lams.map(f=>{const i=DB.finishes.indexOf(f);return _row3(
              `<div>${_txtInp(`finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}${f.per_side?' · par face':''}</div></div>`,
              _numInp(`finishes.${i}.cost_ps`,f.cost_ps,'DH/f'),
              _delBtn(`ADMIN.removeLam(${i})`)
            );}).join('')||`<div class="adm-empty" style="padding:1rem">Aucun pelliculage</div>`}
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>')}</div>
              <div class="adm-card-title">Finitions spéciales</div></div>
            <button class="adm-action-btn" onclick="ADMIN.addAddon()">${IC.plus} Ajouter</button>
          </div>
          <div class="adm-rows">
            ${addons.map((f,i)=>{
              let inp='';
              if      (f.pricing_model==='setup_sheet') inp=`<div style="display:flex;gap:.3rem">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup,'DH fix')}${_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f')}</div>`;
              else if (f.pricing_model==='per_sheet')   inp=_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f');
              else if (f.pricing_model==='per_unit')    inp=`<div style="display:flex;gap:.3rem">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup||0,'DH fix')}${_numInp(`finishes_addon.${i}.cost_pu`,f.cost_pu||0,'DH/u','0.01')}</div>`;
              return _row3(`<div>${_txtInp(`finishes_addon.${i}.label`,f.label)}<div class="adm-row-sub">${f.pricing_model} · ${f.group||''}</div></div>`,inp,_delBtn(`ADMIN.removeAddon(${i})`));
            }).join('')||`<div class="adm-empty" style="padding:1rem">Aucune finition</div>`}
            <div style="height:1px;background:var(--bd);margin:.3rem 0"></div>
            ${_row('Frais de coupe','par commande numérique',_numInp('pricing.cutting_fee',p.cutting_fee||60,'DH','1'))}
          </div>
        </div>

        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>')}</div>
              <div class="adm-card-title">Reliures</div></div>
            <button class="adm-action-btn" onclick="ADMIN.addBinding()">${IC.plus} Ajouter</button>
          </div>
          <div class="adm-rows">
            ${bindings.map((b,i)=>_row3(
              `<div>${_txtInp(`binding_options.${i}.label`,b.label)}<div class="adm-row-sub">${b.id}</div></div>`,
              `<div style="display:flex;gap:.3rem">${_numInp(`binding_options.${i}.cost_flat`,b.cost_flat,'DH fix','1')}${_numInp(`binding_options.${i}.cost_per_copy`,b.cost_per_copy,'DH/ex')}</div>`,
              _delBtn(`ADMIN.removeBinding(${i})`)
            )).join('')||`<div class="adm-empty" style="padding:1rem">Aucune reliure</div>`}
          </div>
        </div>
      </div>

      <!-- ROW 5: REMISES VOLUME -->
      <div class="adm-grid" style="margin-top:.85rem">
        ${_card('Remises volume','<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>',
          (p.qty_discounts||[]).map((d,i)=>i===0?'':
            _row(`Remise ≥ ${fmtN(d.min)} ex.`,'',_pctInp(`pricing.qty_discounts.${i}.disc`,d.disc))
          ).join('')||`<div class="adm-empty" style="padding:1rem">Aucune remise configurée</div>`)}
      </div>`;
  }

  /* ── Delivery admin state ── */
  let _dcSearch = '', _dcFeeFilter = null, _dcPage = 1;
  const _DC_PER_PAGE = 40;

  function _bTurnaround() {
    const taIco = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
    const taRows = (DB.turnaround_options||[]).map((t,i)=>
      _row(`${t.label}`,`${t.days} · surcoût`,_pctInp(`turnaround_options.${i}.sur`,t.sur))
    ).join('');
    return `
      ${_pageHdr('Délais de production','Options de délai — surcoût appliqué au sous-total')}
      <div class="adm-grid adm-grid-1">
        ${_card('Délais & surcoûts', taIco,
          taRows || '<div class="adm-empty" style="padding:1rem">Aucune option</div>')}
      </div>`;
  }

  /* ── Livraison tab (zones + villes Maroc) ── */
  function _bLivraison() {
    const livIco = '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';
    /* Auto-seed cities from defaults if empty */
    if (!DB.delivery_cities || DB.delivery_cities.length === 0) {
      DB.delivery_cities = _getDefaultCities();
      _markUnsaved();
    }
    const allCities = DB.delivery_cities;
    const feeCounts = {};
    allCities.forEach(c => { feeCounts[c.fee] = (feeCounts[c.fee]||0)+1; });
    const tiers = Object.keys(feeCounts).map(Number).sort((a,b)=>a-b);
    let filtered = allCities.filter(c => {
      const mFee  = _dcFeeFilter === null || c.fee === _dcFeeFilter;
      const mSrch = !_dcSearch   || (c.label||'').toLowerCase().includes(_dcSearch.toLowerCase());
      return mFee && mSrch;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / _DC_PER_PAGE));
    if (_dcPage > totalPages) _dcPage = 1;
    const pageSlice = filtered.slice((_dcPage-1)*_DC_PER_PAGE, _dcPage*_DC_PER_PAGE);
    const feeBadge = fee => {
      const colors = {20:'#dbeafe:#1d4ed8',29:'#e0e7ff:#4338ca',35:'#d1fae5:#065f46',
        39:'#fef9c3:#854d0e',40:'#ffedd5:#9a3412',45:'#fee2e2:#991b1b',47:'#fae8ff:#6b21a8'};
      const [bg, color] = (colors[fee]||'var(--s2):var(--t2)').split(':');
      return `<span style="display:inline-flex;padding:2px 8px;border-radius:12px;font-size:.62rem;font-weight:700;background:${bg};color:${color}">${fee} DH</span>`;
    };
    const pills = `<div class="adm-dc-pills">
        <button class="adm-action-btn${_dcFeeFilter===null?' adm-dc-pill-on':''}" onclick="ADMIN.dcFilter(null)">
          Toutes <span style="font-size:.58rem;opacity:.7">${allCities.length}</span>
        </button>
        ${tiers.map(f=>`
          <button class="adm-action-btn${_dcFeeFilter===f?' adm-dc-pill-on':''}" onclick="ADMIN.dcFilter(${f})">
            ${f} DH <span style="font-size:.58rem;opacity:.7">${feeCounts[f]}</span>
          </button>`).join('')}
      </div>`;
    const avg = allCities.length ? Math.round(allCities.reduce((s,c)=>s+c.fee,0)/allCities.length) : 0;
    const stats = `<div class="adm-dc-stats">
        <div class="adm-dc-stat"><span class="adm-dc-stat-val">${allCities.length}</span><span class="adm-dc-stat-lbl">Villes</span></div>
        <div class="adm-dc-stat"><span class="adm-dc-stat-val">${Math.min(...allCities.map(c=>c.fee))||0}</span><span class="adm-dc-stat-lbl">Min DH</span></div>
        <div class="adm-dc-stat"><span class="adm-dc-stat-val">${avg}</span><span class="adm-dc-stat-lbl">Moy DH</span></div>
        <div class="adm-dc-stat"><span class="adm-dc-stat-val">${tiers.length}</span><span class="adm-dc-stat-lbl">Zones</span></div>
      </div>`;
    const cityRows = pageSlice.map(c => {
      const i = allCities.indexOf(c);
      return `<div class="adm-dc-row" id="adm-dc-row-${i}">
        <input class="adm-inp-lbl adm-dc-name" style="flex:1;min-width:0"
          value="${(c.label||'').replace(/"/g,'&quot;')}" placeholder="Ville"
          oninput="ADMIN.set('delivery_cities.${i}.label',this.value)">
        ${feeBadge(c.fee)}
        <div class="adm-num-wrap">
          <input type="number" class="adm-inp" min="0" step="1" value="${c.fee||0}"
            oninput="ADMIN.dcSetFee(${i},+this.value)">
          <span class="adm-num-unit">DH</span>
        </div>
        <input class="adm-inp-lbl" style="width:70px"
          value="${(c.days||'').replace(/"/g,'&quot;')}" placeholder="Délai"
          oninput="ADMIN.set('delivery_cities.${i}.days',this.value)">
        <button class="adm-del-btn" onclick="ADMIN.removeCityRow(${i})" title="Supprimer">${IC.trash}</button>
      </div>`;
    }).join('');
    const pgBtns = totalPages <= 1 ? '' : (() => {
      let btns = '';
      for (let p=1;p<=totalPages;p++) {
        if (p===1||p===totalPages||Math.abs(p-_dcPage)<=1)
          btns += `<button class="adm-action-btn${p===_dcPage?' adm-dc-pill-on':''}" style="min-width:28px;padding:0 6px" onclick="ADMIN.dcPage(${p})">${p}</button>`;
        else if (Math.abs(p-_dcPage)===2)
          btns += `<span style="font-size:.65rem;color:var(--t3);padding:0 2px">…</span>`;
      }
      const start = (_dcPage-1)*_DC_PER_PAGE+1;
      const end   = Math.min(_dcPage*_DC_PER_PAGE, filtered.length);
      return `<div class="adm-dc-pg">
        <span style="font-size:.62rem;color:var(--t3)">${start}–${end} / ${filtered.length}</span>
        <div style="display:flex;gap:.2rem;align-items:center;flex-wrap:wrap">${btns}</div>
      </div>`;
    })();
    const ioBlock = `<div class="adm-dc-io">
        <div style="flex:1">
          <div style="font-size:.65rem;font-weight:600;color:var(--t2);margin-bottom:.3rem">Import JSON</div>
          <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap">
            <textarea id="dcImportArea" class="adm-dc-textarea" rows="2"
              placeholder='[{"id":"city-1","label":"Casablanca","fee":20,"days":"24-48h"},…]'></textarea>
            <button class="adm-action-btn" onclick="ADMIN.dcImport()">Importer</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-start">
          <div style="font-size:.65rem;font-weight:600;color:var(--t2);margin-bottom:.15rem">Export</div>
          <button class="adm-action-btn" onclick="ADMIN.dcExport()">${IC['file-text']} Copier JSON</button>
          <button class="adm-action-btn" onclick="ADMIN.dcReset()" style="color:var(--rd)">${IC.alert} Reset défaut</button>
        </div>
      </div>`;
    return `
      ${_pageHdr('Livraison','Zones et tarifs de livraison — Maroc')}
      <div class="adm-grid adm-grid-1">
        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(livIco)}</div>
              <div>
                <div class="adm-card-title">Zones de livraison</div>
                <div class="adm-card-sub">Maroc — ${allCities.length} villes · tarifs ajustables</div>
              </div>
            </div>
            <button class="adm-action-btn" onclick="ADMIN.addCityRow()">${IC.plus} Ville</button>
          </div>
          <div style="padding:.6rem .85rem .4rem;border-bottom:1px solid var(--bd)">
            ${stats}
            <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;flex-wrap:wrap">
              <div style="position:relative;flex:1;min-width:140px;max-width:260px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  style="position:absolute;left:.5rem;top:50%;transform:translateY(-50%);width:11px;height:11px;color:var(--t3);pointer-events:none">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input class="adm-inp-lbl" style="width:100%;padding-left:1.6rem"
                  placeholder="Rechercher une ville…" value="${(_dcSearch||'').replace(/"/g,'&quot;')}"
                  oninput="ADMIN.dcSearch(this.value)">
              </div>
              ${pills}
            </div>
          </div>
          <div class="adm-dc-list" id="adm-dc-list">
            <div class="adm-dc-list-hdr">
              <span style="flex:1">Ville</span>
              <span style="width:70px">Tarif</span>
              <span style="width:80px">DH</span>
              <span style="width:70px">Délai</span>
              <span style="width:24px"></span>
            </div>
            ${cityRows || '<div class="adm-empty" style="padding:1rem">Aucune ville trouvée</div>'}
          </div>
          ${pgBtns}
          ${ioBlock}
        </div>
      </div>`;
  }

  /* ── Delivery city CRUD + controls ── */
  function addCityRow() {
    if (!DB.delivery_cities || DB.delivery_cities.length===0) DB.delivery_cities = _getDefaultCities();
    DB.delivery_cities.unshift({ id:'city-'+Date.now(), label:'', fee:35, days:'24-48h' });
    _dcPage=1; _markUnsaved(); _flash(); _renderTab(activeTab);
  }
  function removeCityRow(i) {
    DB.delivery_cities.splice(i,1);
    _markUnsaved(); _flash(); _renderTab(activeTab);
  }
  function dcSetFee(i, val) {
    if (DB.delivery_cities[i]) DB.delivery_cities[i].fee = val;
    _markUnsaved();
    // Refresh badge in DOM without full re-render
    const row = document.getElementById('adm-dc-row-'+i);
    if (row) {
      const badge = row.querySelector('span[style*="border-radius:12px"]');
      if (badge) {
        const colors = {20:'#dbeafe:#1d4ed8',29:'#e0e7ff:#4338ca',35:'#d1fae5:#065f46',
          39:'#fef9c3:#854d0e',40:'#ffedd5:#9a3412',45:'#fee2e2:#991b1b',47:'#fae8ff:#6b21a8'};
        const [bg,color] = (colors[val]||'var(--s2):var(--t2)').split(':');
        badge.style.background=bg; badge.style.color=color;
        badge.textContent=val+' DH';
      }
    }
  }
  function dcSearch(q) {
    _dcSearch=q; _dcPage=1; _renderTab(activeTab);
  }
  function dcFilter(fee) {
    _dcFeeFilter=fee; _dcPage=1; _renderTab(activeTab);
  }
  function dcPage(p) {
    _dcPage=p; _renderTab(activeTab);
    document.getElementById('adm-dc-list')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function dcExport() {
    const json = JSON.stringify(DB.delivery_cities||[], null, 2);
    navigator.clipboard.writeText(json).then(()=>_flash('✓ JSON copié')).catch(()=>{
      const ta = document.createElement('textarea');
      ta.value=json; ta.style='position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); _flash('✓ JSON copié');
    });
  }
  function dcImport() {
    const ta = document.getElementById('dcImportArea');
    if (!ta||!ta.value.trim()) return;
    let parsed;
    try { parsed = JSON.parse(ta.value.trim()); } catch(e) { alert('JSON invalide: '+e.message); return; }
    if (!Array.isArray(parsed)) { alert('Le JSON doit être un tableau [ ]'); return; }
    DB.delivery_cities = parsed.map((c,i)=>({
      id: c.id || 'city-'+Date.now()+'-'+i,
      label: c.label||c.city||c.name||'',
      fee: +c.fee||+c.price||0,
      days: c.days||c.delai||'24-48h'
    }));
    ta.value=''; _dcPage=1; _dcSearch=''; _dcFeeFilter=null;
    _markUnsaved(); _flash('✓ '+DB.delivery_cities.length+' villes importées'); _renderTab(activeTab);
  }
  function dcReset() {
    if (!confirm('Réinitialiser avec les 442 villes par défaut ?')) return;
    DB.delivery_cities = _getDefaultCities();
    _dcPage=1; _dcSearch=''; _dcFeeFilter=null;
    _markUnsaved(); _flash(); _renderTab(activeTab);
  }

  function _bPapers() {
    const std  = (DB.paper_stocks||[]).filter(p=>!p.special && !p.envelope);
    const spe  = (DB.paper_stocks||[]).filter(p=> p.special && !p.envelope);
    const fmts = DB.envelope_formats || [];
    const types= DB.envelope_types   || [];
    const isSupa    = typeof DB_MOD!=='undefined' && DB_MOD.getSource()==='supabase';
    const colsMissing = isSupa && !DB.envelope_formats && !DB.envelope_types;

    /* ── Column-header bar helper ── */
    const colHdr = (...cols) => `
      <div style="display:flex;align-items:center;gap:.35rem;padding:.18rem .85rem;
        background:var(--s2);border-bottom:1px solid var(--bd)">
        ${cols.map(([label, w, align='left'])=>`
          <span style="font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;
            letter-spacing:.6px;${w?'width:'+w+';flex-shrink:0':'flex:1'};text-align:${align}">${label}</span>`
        ).join('')}
        <span style="width:28px;flex-shrink:0"></span>
      </div>`;

    /* ── Inline add-row helper ── */
    const addRow = content => `
      <div style="display:flex;align-items:center;gap:.35rem;padding:.4rem .85rem;
        border-bottom:1px solid var(--bd);background:var(--s2)">${content}</div>`;

    /* ── Paper rows ── */
    const paperRow = ps => {
      const i = DB.paper_stocks.indexOf(ps);
      // Show print_recto/print_rv if present, else show legacy cost_per_sheet in both fields
      const recto = ps.print_recto != null ? ps.print_recto : (ps.cost_per_sheet || 0);
      const rv    = ps.print_rv    != null ? ps.print_rv    : (ps.cost_per_sheet || 0);
      return `<div style="display:flex;align-items:center;gap:.35rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd)">
        <div style="flex:1;min-width:0">
          ${_txtInp(`paper_stocks.${i}.label`,ps.label)}
          <div class="adm-row-sub" style="margin-top:2px">${ps.id}</div>
        </div>
        <div class="adm-num-wrap" style="flex-shrink:0" title="Coût impression recto (1 face) par feuille A3+">
          <input type="number" class="adm-inp" step="0.01" min="0" style="width:58px" value="${recto}"
            oninput="ADMIN.set('paper_stocks.${i}.print_recto',+this.value)">
          <span class="adm-num-unit">DH R°</span>
        </div>
        <div class="adm-num-wrap" style="flex-shrink:0" title="Coût impression recto-verso (2 faces) par feuille A3+">
          <input type="number" class="adm-inp" step="0.01" min="0" style="width:58px" value="${rv}"
            oninput="ADMIN.set('paper_stocks.${i}.print_rv',+this.value)">
          <span class="adm-num-unit">DH R/V</span>
        </div>
        ${_delBtn(`ADMIN.removePaper(${i})`)}
      </div>`;
    };

    /* ── Envelope format rows ── */
    const fmtRows = fmts.map((f,i)=>`
      <div style="display:flex;align-items:center;gap:.35rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd)">
        <input class="adm-inp-lbl" style="width:52px" value="${(f.name||'').replace(/"/g,'&quot;')}"
          placeholder="DL" oninput="ADMIN.set('envelope_formats.${i}.name',this.value)">
        <input class="adm-inp" type="number" style="width:50px" value="${f.w||''}" placeholder="220"
          oninput="ADMIN.set('envelope_formats.${i}.w',+this.value)">
        <span style="font-size:.6rem;color:var(--t3);flex-shrink:0">×</span>
        <input class="adm-inp" type="number" style="width:50px" value="${f.h||''}" placeholder="110"
          oninput="ADMIN.set('envelope_formats.${i}.h',+this.value)">
        <span style="font-size:.6rem;color:var(--t3);flex-shrink:0;width:18px">mm</span>
        <div style="flex:1"></div>
        <div class="adm-num-wrap">
          <input class="adm-inp" type="number" min="0" step="0.01" style="width:64px" value="${f.cost||0}"
            oninput="ADMIN.set('envelope_formats.${i}.cost',+this.value)">
          <span class="adm-num-unit">DH</span>
        </div>
        ${_delBtn(`ADMIN.removeEnvFormat(${i})`)}
      </div>`).join('');

    /* ── Envelope type rows ── */
    const typeRows = types.map((t,i)=>`
      <div style="display:flex;align-items:center;gap:.35rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd)">
        <input class="adm-inp-lbl" style="width:90px" value="${(t.name||'').replace(/"/g,'&quot;')}"
          placeholder="Autodex" oninput="ADMIN.set('envelope_types.${i}.name',this.value)">
        <div style="flex:1"></div>
        <div class="adm-num-wrap">
          <input class="adm-inp" type="number" min="0" step="0.01" style="width:58px" value="${t.cost_per_piece||0}"
            oninput="ADMIN.set('envelope_types.${i}.cost_per_piece',+this.value)">
          <span class="adm-num-unit">DH/pce</span>
        </div>
        <div class="adm-num-wrap">
          <input class="adm-inp" type="number" min="0" step="0.01" style="width:58px" value="${t.cost_per_color||0}"
            oninput="ADMIN.set('envelope_types.${i}.cost_per_color',+this.value)">
          <span class="adm-num-unit">DH/coul</span>
        </div>
        ${_delBtn(`ADMIN.removeEnvType(${i})`)}
      </div>`).join('');

    /* ── Presets ── */
    const envPresets = [['DL',220,110],['C6',162,114],['C5',229,162],['C4',324,229],['B5',250,176]];
    const typPresets = ['Autodex','Normal','Spécial'];

    const paperColHdr = `<div style="display:flex;align-items:center;gap:.35rem;padding:.18rem .85rem;background:var(--s2);border-bottom:1px solid var(--bd)">
      <span style="flex:1;font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px">Papier / Support</span>
      <span style="width:80px;flex-shrink:0;font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;text-align:center">Recto</span>
      <span style="width:80px;flex-shrink:0;font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;text-align:center">R/V</span>
      <span style="width:28px;flex-shrink:0"></span>
    </div>`;
    const icoEnv = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';

    return `
      ${_pageHdr('Papiers','Grammages, coûts et formats d\'enveloppes')}

      <!-- Row 1: Standard + Spéciaux -->
      <div class="adm-grid">
        ${_cardAct('Papiers standards',icoStd,
          `<button class="adm-action-btn" onclick="ADMIN.addPaper(false)">${IC.plus} Ajouter</button>`,
          paperColHdr + (std.map(paperRow).join('') || `<div class="adm-empty" style="padding:1rem">Aucun papier standard</div>`))}
        ${_cardAct('Papiers spéciaux','<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
          `<button class="adm-action-btn" onclick="ADMIN.addPaper(true)">${IC.plus} Ajouter</button>`,
          paperColHdr + (spe.map(paperRow).join('') || `<div class="adm-empty" style="padding:1rem">Aucun papier spécial</div>`))}
      </div>

      <!-- Row 2: Enveloppes -->
      ${colsMissing ? `
        <div style="margin:.85rem 0;padding:.6rem .85rem;background:#fef3c7;border:1px solid #fcd34d;border-radius:7px;font-size:.67rem;line-height:1.6">
          <strong>⚠ Colonnes manquantes.</strong> Exécutez dans Supabase → SQL Editor :
          <code style="display:block;margin-top:.3rem;background:#1e293b;color:#86efac;padding:.35rem .6rem;border-radius:5px;font-size:.63rem">
            ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_formats jsonb;<br>
            ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_types   jsonb;
          </code>
        </div>` : ''}
      <div class="adm-grid" style="margin-top:.85rem">

        <!-- Formats enveloppes -->
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(icoEnv)}</div>
              <div><div class="adm-card-title">Formats enveloppes</div>
              <div class="adm-card-sub">Nom · L×H mm · Coût unitaire</div></div>
            </div>
          </div>
          ${addRow(`
            <input class="adm-inp-lbl" id="efName" placeholder="DL…" style="width:52px">
            <input class="adm-inp" id="efW" type="number" placeholder="220" style="width:50px">
            <span style="font-size:.6rem;color:var(--t3);flex-shrink:0">×</span>
            <input class="adm-inp" id="efH" type="number" placeholder="110" style="width:50px">
            <span style="font-size:.6rem;color:var(--t3);flex-shrink:0;width:18px">mm</span>
            <div style="flex:1"></div>
            <div class="adm-num-wrap">
              <input class="adm-inp" id="efCost" type="number" value="0" step="0.01" style="width:60px">
              <span class="adm-num-unit">DH</span>
            </div>
            <button class="adm-primary-btn" style="height:28px;padding:0 10px;font-size:.67rem" onclick="ADMIN.addEnvFormat2()">${IC.plus} Ajouter</button>
          `)}
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd)">
            <span class="adm-row-sub" style="display:flex;align-items:center;margin-right:.2rem">Rapide :</span>
            ${envPresets.map(([n,w,h])=>`<button class="adm-action-btn" style="padding:1px 7px;font-size:.6rem"
              onclick="ADMIN.addEnvFormatPreset('${n}',${w},${h})">${n}</button>`).join('')}
          </div>
          ${colHdr(['Nom','52px'],['L × H'],'',['Coût','64px','right'])}
          <div>${fmtRows || `<div class="adm-empty" style="padding:.75rem">Aucun format</div>`}</div>
        </div>

        <!-- Types d'enveloppes -->
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg('<path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>')}</div>
              <div><div class="adm-card-title">Types d'enveloppes</div>
              <div class="adm-card-sub">Coût impression par pièce + par couleur</div></div>
            </div>
          </div>
          ${addRow(`
            <input class="adm-inp-lbl" id="etName" placeholder="Autodex…" style="width:100px">
            <div style="flex:1"></div>
            <div class="adm-num-wrap">
              <input class="adm-inp" id="etCostPce" type="number" value="0" step="0.01" style="width:58px">
              <span class="adm-num-unit">DH/pce</span>
            </div>
            <div class="adm-num-wrap">
              <input class="adm-inp" id="etCost" type="number" value="0" step="0.01" style="width:58px">
              <span class="adm-num-unit">DH/coul</span>
            </div>
            <button class="adm-primary-btn" style="height:28px;padding:0 10px;font-size:.67rem" onclick="ADMIN.addEnvType()">${IC.plus} Ajouter</button>
          `)}
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd)">
            <span class="adm-row-sub" style="display:flex;align-items:center;margin-right:.2rem">Rapide :</span>
            ${typPresets.map(n=>`<button class="adm-action-btn" style="padding:1px 7px;font-size:.6rem"
              onclick="$('etName').value='${n}'">${n}</button>`).join('')}
          </div>
          ${colHdr(['Nom','90px'],[''],['DH/pce','58px','right'],['DH/coul','58px','right'])}
          <div>${typeRows || `<div class="adm-empty" style="padding:.75rem">Aucun type</div>`}</div>
          <div style="padding:.4rem .85rem;border-top:1px solid var(--bd);font-size:.61rem;color:var(--t3)">
            Prix = (format + DH/pce + DH/coul × nb couleurs) × quantité
          </div>
        </div>
      </div>`;
  }

  /* ── Grand Format tab (Matières nav) ── */
  function _bGFMat() {
    const gfMaterials = DB.gf_materials    || [];
    const supports    = DB.rollup_supports || [];
    const gfFins      = DB.gf_finishes     || [];
    const icoGF  = '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>';
    const icoSup = '<path d="M12 2v20M2 12h20"/>';
    const matRows = gfMaterials.map((m,i) => _row3(
      `<div>${_txtInp(`gf_materials.${i}.label`,m.label)}<div class="adm-row-sub">${m.id} · laize ${m.laize||1}m</div></div>`,
      `<div style="display:flex;gap:.3rem">
        ${_numInp(`gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm||0,'DH/m²')}
        ${_numInp(`gf_materials.${i}.laize`,m.laize||1,'m laize','0.1')}
      </div>`,
      _delBtn(`ADMIN.removeGfMat(${i})`)
    )).join('') || `<div class="adm-empty" style="padding:1rem">Aucune matière</div>`;
    const supRows = supports.map((s,i) => _row3(
      `<div>${_txtInp(`rollup_supports.${i}.label`,s.label)}<div class="adm-row-sub">${s.id}</div></div>`,
      _numInp(`rollup_supports.${i}.cost`,s.cost||0,'DH'),
      _delBtn(`ADMIN.removeRuSupport(${i})`)
    )).join('') || `<div class="adm-empty" style="padding:1rem">Aucun support</div>`;
    const finRows = gfFins.map((f,i) => _row3(
      `<div>${_txtInp(`gf_finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}</div></div>`,
      f.cost_per_sqm!=null ? _numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²') : _numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1'),
      _delBtn(`ADMIN.removeGfFinish(${i})`)
    )).join('') || `<div class="adm-empty" style="padding:1rem">Aucune finition GF</div>`;
    return `
      ${_pageHdr('Grand Format','Matières imprimables, supports mécaniques et finitions')}
      <div class="adm-grid">
        ${_cardAct('Matières imprimables',icoGF,
          `<button class="adm-action-btn" onclick="ADMIN.addGfMat()">${IC.plus} Ajouter</button>`,
          matRows, true)}
        ${_cardAct('Supports — Roll-up / X-banner',icoSup,
          `<button class="adm-action-btn" onclick="ADMIN.addRuSupport()">${IC.plus} Ajouter</button>`,
          supRows, true)}
        ${_cardAct('Finitions Grand Format',icoGF,
          `<button class="adm-action-btn" onclick="ADMIN.addGfFinish()">${IC.plus} Ajouter</button>`,
          finRows, true)}
      </div>`;
  }

  /* ── Gadgets tab (Matières nav) ── */
  function _bGadgetsMat() {
    const gadgetProds = (DB.products||[]).filter(p => (p.calc_engine==='gadget') || p.product_type==='gadget');
    const icoGad = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
    const rows = gadgetProds.map(prod => {
      const pi = DB.products.indexOf(prod);
      return _row3(
        `<div>
          ${_txtInp(`products.${pi}.name`, prod.name)}
          <div class="adm-row-sub">${prod.id}${prod.print_technique ? ' · ' + prod.print_technique : ''}</div>
        </div>`,
        `<div style="display:flex;gap:.3rem;align-items:center">
          ${_numInp(`products.${pi}.unit_price`,prod.unit_price||0,'DH/u')}
          ${_numInp(`products.${pi}.print_cost`,prod.print_cost||0,'DH imp.')}
          <input class="adm-inp-lbl" style="width:90px;font-size:.67rem" placeholder="Technique…"
            value="${(prod.print_technique||'').replace(/"/g,'&quot;')}"
            oninput="ADMIN.set('products.${pi}.print_technique',this.value)">
        </div>`,
        _delBtn(`ADMIN.deleteGadget('${prod.id}')`)
      );
    }).join('');
    return `
      ${_pageHdr('Gadgets & Objets pub','Prix unitaire, coût impression et technique par produit')}
      <div class="adm-grid adm-grid-1">
        ${_cardAct('Gadgets',icoGad,
          `<button class="adm-action-btn" onclick="ADMIN.addGadget()">${IC.plus} Nouveau gadget</button>`,
          rows || `<div class="adm-empty" style="padding:1.5rem">Aucun produit Gadget dans le catalogue</div>`,
          true)}
      </div>`;
  }

  function _bFinishes() {
    const lams = (DB.finishes||[]).filter(f=>f.id!=='none');
    const rows = lams.map(f => {
      const i = DB.finishes.indexOf(f);
      return _row3(
        `<div>${_txtInp(`finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}${f.per_side?' · par face':''}</div></div>`,
        _numInp(`finishes.${i}.cost_ps`,f.cost_ps,'DH/f'),
        _delBtn(`ADMIN.removeLam(${i})`)
      );
    }).join('');
    const ico = '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>';
    return `
      ${_pageHdr('Pelliculage','Types de finitions et coût à la feuille')}
      <div class="adm-grid adm-grid-1">
        ${_cardAct('Pelliculages',ico,
          `<button class="adm-action-btn" onclick="ADMIN.addLam()">${IC.plus} Ajouter</button>`,
          rows||`<div class="adm-empty" style="padding:1rem">Aucun pelliculage</div>`,true)}
      </div>`;
  }

  function _bAddons() {
    const rows = (DB.finishes_addon||[]).map((f,i) => {
      let inp = '';
      if      (f.pricing_model==='setup_sheet') inp=`<div style="display:flex;gap:.3rem">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup,'DH fix')}${_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f')}</div>`;
      else if (f.pricing_model==='per_sheet')   inp=_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f');
      else if (f.pricing_model==='per_unit')    inp=`<div style="display:flex;gap:.3rem">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup||0,'DH fix')}${_numInp(`finishes_addon.${i}.cost_pu`,f.cost_pu||0,'DH/u','0.01')}</div>`;
      return _row3(
        `<div>${_txtInp(`finishes_addon.${i}.label`,f.label)}<div class="adm-row-sub">${f.pricing_model} · ${f.group||''}</div></div>`,
        inp, _delBtn(`ADMIN.removeAddon(${i})`)
      );
    }).join('');
    const ico = '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>';
    const carnetCard = (() => {
      const cp = (DB.products||[]).find(p => p.product_type === 'carnet');
      if (!cp) return '';
      const pi = DB.products.indexOf(cp);
      const pr = cp.carnet_pricing || {};
      const icoOpts = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>';
      return _card('Finitions Carnet NCR', icoOpts,
        _row('Agrafage', 'par carnet (obligatoire)',
          _numInp('products.'+pi+'.carnet_pricing.stapling_cost_per_carnet', pr.stapling_cost_per_carnet||0)) +
        _row('Numérotation', 'par carnet (si activée)',
          _numInp('products.'+pi+'.carnet_pricing.numbering_cost_per_carnet', pr.numbering_cost_per_carnet||0)) +
        _row('Perforage', 'par carnet (si activé)',
          _numInp('products.'+pi+'.carnet_pricing.perforation_cost_per_carnet', pr.perforation_cost_per_carnet||0)));
    })();

    return `
      ${_pageHdr('Façonnage & Finitions spéciales','Pelliculage addon, découpe, vernis sélectif et autres opérations')}
      <div class="adm-grid adm-grid-1">
        ${_cardAct('Finitions spéciales',ico,
          `<button class="adm-action-btn" onclick="ADMIN.addAddon()">${IC.plus} Ajouter</button>`,
          rows||`<div class="adm-empty" style="padding:1rem">Aucune finition</div>`,true)}
        ${carnetCard}
      </div>`;
  }

  function _bGF() {
    const gfFinRows = (DB.gf_finishes||[]).map((f,i)=>
      _row(f.label,'',f.cost_per_sqm!=null
        ? _numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²')
        : _numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1'))
    ).join('');
    const gfProds = (DB.products||[]).filter(p=>p.product_type==='grand_format'||p.product_type==='rollup');
    const matCards = gfProds.map(p => {
      const pi = DB.products.indexOf(p);
      const ico = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>';
      return _card(`${p.name} — Matières`,ico,
        (p.gf_materials||[]).map((m,i)=>
          _row(m.label,m.desc,_numInp(`products.${pi}.gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm,'DH/m²','1'))
        ).join(''));
    }).join('');
    const icoGF = '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>';
    return `
      ${_pageHdr('Grand Format','Matières et finitions pour l\'impression grand format')}
      <div class="adm-grid">
        ${_card('Finitions Grand Format',icoGF,gfFinRows||`<div class="adm-empty" style="padding:1rem">Aucune finition</div>`)}
        ${matCards}
      </div>`;
  }

  function _bCarnet() {
    /* Carnet NCR settings have been distributed to their logical sections:
       • Papier NCR + Couverture  → Papiers (matières)
       • Agrafage / Numérotation / Perforage → Façonnage (opérations de finition) */
    const icoMap = (label, tab, color) =>
      `<div onclick="ADMIN._settingsSelectTab('${tab}')" style="display:flex;align-items:center;gap:.75rem;
        padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
        background:var(--sf);transition:all var(--ease)" onmouseover="this.style.borderColor='var(--bl)'"
        onmouseout="this.style.borderColor='var(--bd)'">
        <div style="width:32px;height:32px;border-radius:7px;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px;color:#fff">${_svg(label[1]).replace('<svg','<svg style="width:15px;height:15px"')}</svg>
        </div>
        <div style="flex:1">
          <div style="font-size:.75rem;font-weight:700;color:var(--t1)">${label[0]}</div>
          <div style="font-size:.62rem;color:var(--t3);margin-top:2px">${label[2]}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
      </div>`;

    return `
      ${_pageHdr('Carnet NCR','Les paramètres ont été répartis dans leurs sections logiques')}
      <div class="adm-grid adm-grid-1">
        <div class="adm-card adm-card-full">
          <div class="adm-rows" style="display:flex;flex-direction:column;gap:.5rem;padding:.75rem">
            <div style="font-size:.67rem;color:var(--t2);margin-bottom:.25rem">
              ${IC.info} Les coûts Carnet NCR sont maintenant dans leurs sections respectives :
            </div>
            <div onclick="ADMIN._settingsSelectTab('papers')" style="display:flex;align-items:center;gap:.75rem;
              padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
              background:var(--sf);transition:border-color var(--ease)"
              onmouseover="this.style.borderColor='var(--bl)'" onmouseout="this.style.borderColor='var(--bd)'">
              <div style="width:32px;height:32px;border-radius:7px;background:var(--bl);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" style="width:15px;height:15px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div style="flex:1">
                <div style="font-size:.75rem;font-weight:700;color:var(--t1)">Papiers</div>
                <div style="font-size:.62rem;color:var(--t3);margin-top:2px">Papier NCR (coût/set par nb souches) · Couverture imprimée</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div onclick="ADMIN._settingsSelectTab('addons')" style="display:flex;align-items:center;gap:.75rem;
              padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
              background:var(--sf);transition:border-color var(--ease)"
              onmouseover="this.style.borderColor='var(--bl)'" onmouseout="this.style.borderColor='var(--bd)'">
              <div style="width:32px;height:32px;border-radius:7px;background:var(--am);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" style="width:15px;height:15px"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              </div>
              <div style="flex:1">
                <div style="font-size:.75rem;font-weight:700;color:var(--t1)">Façonnage</div>
                <div style="font-size:.62rem;color:var(--t3);margin-top:2px">Agrafage · Numérotation · Perforage (coûts par carnet)</div>
              </div>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>
        </div>
      </div>`;
  }

  function _bBinding() {
    const rows = (DB.binding_options||[]).map((b,i)=>
      _row(b.label,'frais fixes + par exemplaire',
        `<div style="display:flex;gap:.4rem">${_numInp(`binding_options.${i}.cost_flat`,b.cost_flat,'DH fix','1')}${_numInp(`binding_options.${i}.cost_per_copy`,b.cost_per_copy,'DH/ex')}</div>`)
    ).join('');
    const ico = '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>';
    return `
      ${_pageHdr('Reliure','Options de reliure et leur tarification')}
      <div class="adm-grid adm-grid-1">
        ${_card('Options de reliure',ico,rows||`<div class="adm-empty" style="padding:1rem">Aucune option</div>`,true)}
      </div>`;
  }

  function _bConception() {
    const cp = (DB.products||[]).find(p=>p.product_type==='conception');
    if (!cp) return `${_pageHdr('Conception','')}<div class="adm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/></svg>Aucun produit de type "conception" dans le catalogue.</div>`;
    const pi = DB.products.indexOf(cp);
    const rows = (cp.conception_types||[]).map((ct,i) => {
      let priceInp = '';
      if      (ct.price!=null)             priceInp = _numInp(`products.${pi}.conception_types.${i}.price`,ct.price,'DH');
      else if (ct.price_base!=null)        priceInp = `<div style="display:flex;gap:.3rem">${_numInp(`products.${pi}.conception_types.${i}.price_base`,ct.price_base,'DH base')}${_numInp(`products.${pi}.conception_types.${i}.price_per_page`,ct.price_per_page,'DH/p.')}</div>`;
      else if (ct.price_per_face!=null)    priceInp = _numInp(`products.${pi}.conception_types.${i}.price_per_face`,ct.price_per_face,'DH/face');
      return _row3(`<div>${_txtInp(`products.${pi}.conception_types.${i}.label`,ct.label)}<div class="adm-row-sub">${ct.id}</div></div>`,priceInp,_delBtn(`ADMIN.removeConcType(${pi},${i})`));
    }).join('');
    const ico = '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>';
    return `
      ${_pageHdr('Conception','Tarifs des prestations de design graphique')}
      <div class="adm-grid adm-grid-1">
        ${_card('Prix design logo',ico,
          _row('Prix Logo','tarif de base personnalisable',_numInp(`products.${pi}.logo_price`,cp.logo_price||1200,'DH','1')))}
        ${_cardAct('Prestations',ico,
          `<button class="adm-action-btn" onclick="ADMIN.addConcType(${pi})">${IC.plus} Ajouter</button>`,
          rows||`<div class="adm-empty" style="padding:1rem">Aucune prestation</div>`,true)}
      </div>`;
  }

  /* ── Section Builder helpers ── */

  function _bProducts() {
    const ENGINE_LABELS = { sheet_fit:'Feuille presse', sqm:'Grand Format', gadget:'Gadget / Objet', carnet:'Carnet NCR', service:'Service / Design' };
    const _legacyToEngine = {standard:'sheet_fit',catalogue:'sheet_fit',grand_format:'sqm',rollup:'sqm',pancarte:'sqm',gadget:'gadget',carnet:'carnet',conception:'service'};
    const prods = (DB.products||[]).filter(p=>p.product_type!=='conception' && p.id!=='conception');

    /* ── New product wizard ── */
    if (!activeProd && _newProdMode) {
      const iconKeys = ['layout','image','book','book-open','file-text','tag','flag','scroll','layers','pen-tool','credit-card','truck','printer','image','layers','flag'];
      const ENGINE_INFO = [
        {
          id: 'sheet_fit',
          svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
          label: 'Feuille presse',
          desc: 'Imposition A3+/A2+/A1+ — cartes, flyers, affiches, catalogues, sacs, adhésif'
        },
        {
          id: 'sqm',
          svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>',
          label: 'Grand Format',
          desc: 'Calcul au m² avec laize — bâche, vinyl, rollup, kakémono, pancarte, forex'
        },
        {
          id: 'gadget',
          svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
          label: 'Gadget / Objet pub',
          desc: 'Prix unitaire + coût impression × quantité — stylos, mugs, enveloppes'
        },
        {
          id: 'carnet',
          svg: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="12" y1="8" x2="16" y2="8"/><line x1="12" y1="12" x2="16" y2="12"/>',
          label: 'Carnet NCR',
          desc: 'Offset uniquement — feuillets, souches, numérotage, perforage'
        },
        {
          id: 'service',
          svg: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
          label: 'Service / Design',
          desc: 'Tarif à la prestation — conception graphique, logo, mise en page'
        },
      ];
      const selEngine = _newProdDraft.calc_engine || 'sheet_fit';
      return `
        ${_pageHdr('Nouveau produit','Définissez le nom, l\'identifiant et le moteur de calcul')}
        <div class="adm-grid adm-grid-1">
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr">
              <div class="adm-card-hdr-l">
                <button class="adm-back-btn" onclick="ADMIN.cancelNewProd()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div class="adm-card-title">Informations du produit</div>
              </div>
            </div>
            <div class="adm-new-prod-form">
              <div class="adm-form-grid">
                <div class="adm-form-row">
                  <label class="adm-form-lbl">Nom du produit <span style="color:var(--rd)">*</span></label>
                  <input class="adm-form-inp" id="newProdName" placeholder="ex: Bâche publicitaire" value="${_newProdDraft.name||''}">
                </div>
                <div class="adm-form-row">
                  <label class="adm-form-lbl">Identifiant (slug)</label>
                  <input class="adm-form-inp" id="newProdId" placeholder="auto-généré">
                </div>
              </div>
              <div class="adm-form-row">
                <label class="adm-form-lbl">Icône</label>
                <select class="adm-form-inp" id="newProdIcon" style="cursor:pointer">
                  ${iconKeys.map(k=>`<option value="${k}"${(_newProdDraft.icon||'layout')===k?' selected':''}>${k}</option>`).join('')}
                </select>
              </div>
              <div class="adm-form-row">
                <label class="adm-form-lbl">Moteur de calcul <span style="color:var(--rd)">*</span></label>
                <div class="adm-type-grid">
                  ${ENGINE_INFO.map(t=>`
                    <div class="adm-type-opt${selEngine===t.id?' on':''}"
                      onclick="ADMIN.selectNewType('${t.id}');document.getElementById('newProdType').value='${t.id}'">
                      <span class="adm-type-ico" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0 auto .35rem">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:22px;height:22px">${t.svg}</svg>
                      </span>
                      <div style="font-size:.64rem;font-weight:700">${t.label}</div>
                      <div style="font-size:.56rem;color:var(--t3);line-height:1.3;margin-top:2px">${t.desc}</div>
                    </div>`).join('')}
                </div>
                <input type="hidden" id="newProdType" value="${selEngine}">
              </div>
            </div>
            <div style="padding:.75rem 1rem;display:flex;gap:.5rem;justify-content:flex-end;border-top:1px solid var(--bd)">
              <button class="adm-action-btn" onclick="ADMIN.cancelNewProd()">Annuler</button>
              <button class="adm-primary-btn" onclick="ADMIN.confirmNewProd()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>
                Créer le produit
              </button>
            </div>
          </div>
        </div>`;
    }

    /* ── Product list ── */
    if (!activeProd) {
      const icoP = '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>';
      const list = prods.map(p => {
        const comp = _getComposition(p);
        const engLbl = ENGINE_LABELS[p.calc_engine] || ENGINE_LABELS[_legacyToEngine[p.product_type]] || p.product_type || 'Imprimé';
        return `
          <div class="adm-prod-row" onclick="ADMIN.openProd('${p.id}')">
            <div class="adm-prod-ico">${IC[p.icon]||IC.layout}</div>
            <div class="adm-prod-info">
              <div class="adm-prod-name">${p.name} <span class="adm-prod-type-badge">${engLbl}</span></div>
              <div class="adm-row-sub">${comp.length} section${comp.length!==1?'s':''} · ${p.id}</div>
            </div>
            <div style="display:flex;gap:.3rem;align-items:center;flex-shrink:0">
              <button class="adm-action-btn" onclick="event.stopPropagation();ADMIN.openProd('${p.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
                Configurer
              </button>
              <button class="adm-action-btn danger" onclick="event.stopPropagation();ADMIN.deleteProd('${p.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
              </button>
            </div>
          </div>`;
      }).join('');

      return `
        ${_pageHdr('Produits','Gérez le catalogue, les sections de formulaire et les options par produit',
          `<button class="adm-primary-btn" onclick="ADMIN.startNewProd()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nouveau produit
           </button>`)}
        <div class="adm-grid adm-grid-1">
          ${_cardAct('Catalogue produits',icoP,'',list||`<div class="adm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;margin:0 auto .5rem;display:block;opacity:.35"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/></svg>Aucun produit dans le catalogue.</div>`,true)}
        </div>`;
    }

    /* ── Product editor ── */
    const p = DB.products.find(x=>x.id===activeProd); if (!p) return '';
    const pi = DB.products.indexOf(p);
    const comp = _getComposition(p);
    const usedIds = comp.map(e=>e.type_id);
    const catGroup = g => SECTION_CATALOG.filter(sc=>sc.group===g&&!usedIds.includes(sc.id));
    const groups = ['structure','materials','finish','order','design'];
    const groupLabel = {'structure':'Structure','materials':'Matières','finish':'Finition','order':'Commande','design':'Design'};

    const activeSections = comp.length ? comp.map((entry, ei) => {
      const sc = SECTION_CATALOG.find(x=>x.id===entry.type_id) || {label:entry.type_id,icon:'layout',configurable:false};
      const isOpen = activeSec === ei;
      return `
        <div class="sb-card${isOpen?' open':''}"
          ondragover="ADMIN.secDragOver(event)"
          ondragleave="ADMIN.secDragLeave(event)"
          ondrop="ADMIN.secDrop(event,${pi},${ei})">
          <div class="sb-card-hdr">
            <span class="sb-drag-handle" draggable="true" title="Réordonner"
              ondragstart="ADMIN.secDragStart(event,${pi},${ei})"
              ondragend="ADMIN.secDragEnd(event)">
              <svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor">
                <circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/>
                <circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/>
                <circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/>
              </svg>
            </span>
            <div class="sb-card-label" ${sc.configurable?`onclick="ADMIN.sbToggle(${ei})" style="cursor:pointer;flex:1"`:'style="flex:1"'}>
              <span class="sb-card-id">${sc.label}</span>
              <span class="sb-card-desc">${sc.desc||''}</span>
            </div>
            <div class="sb-card-actions">
              <button class="sb-del-btn" onclick="event.stopPropagation();ADMIN.sbRemove(${pi},${ei})" title="Supprimer">×</button>
            </div>
          </div>
          ${isOpen && sc.configurable ? _sbInlineConfig(p, pi, entry, ei) : ''}
        </div>`;
    }).join('')
    : `<div class="sb-empty">Glissez ou ajoutez des modules depuis la palette →</div>`;

    const palette = groups.map(g => {
      const items = catGroup(g);
      if (!items.length) return '';
      return `
        <div class="sb-pal-group">
          <div class="adm-sb-pal-lbl">${groupLabel[g]}</div>
          <div class="adm-sb-pal-chips">
            ${items.map(sc=>`<div class="adm-sb-pal-chip" onclick="ADMIN.sbAdd(${pi},'${sc.id}')" title="${sc.desc}">+ ${sc.label}</div>`).join('')}
          </div>
        </div>`;
    }).join('');

    const concRows = (p.conception_types||[]).map((ct,i) => {
      let priceInp='';
      if (ct.price)          priceInp=_numInp(`products.${pi}.conception_types.${i}.price`,ct.price,'DH');
      else if (ct.price_base)priceInp=`${_numInp(`products.${pi}.conception_types.${i}.price_base`,ct.price_base,'DH base')}${_numInp(`products.${pi}.conception_types.${i}.price_per_page`,ct.price_per_page,'DH/p')}`;
      else if (ct.price_per_face)priceInp=_numInp(`products.${pi}.conception_types.${i}.price_per_face`,ct.price_per_face,'DH/face');
      return _row3(`<div>${_txtInp(`products.${pi}.conception_types.${i}.label`,ct.label)}<div class="adm-row-sub">${ct.id}</div></div>`,priceInp,_delBtn(`ADMIN.removeConcType(${pi},${i})`));
    }).join('');

    const engine  = p.calc_engine || _legacyToEngine[p.product_type] || 'sheet_fit';
    const engLbl  = ENGINE_LABELS[engine] || engine;
    const engineDropdown = `
      <select style="font-size:.65rem;font-weight:600;padding:0 8px 0 8px;border:1.5px solid var(--bd);
        border-radius:7px;background:var(--sf);color:var(--t1);cursor:pointer;height:32px;min-width:130px"
        onchange="ADMIN.changeEngine(${pi},this.value)" title="Changer le moteur de calcul">
        ${Object.entries(ENGINE_LABELS).map(([id,lbl])=>
          `<option value="${id}"${engine===id?' selected':''}>${lbl}</option>`
        ).join('')}
      </select>`;
    return `
      <!-- Product editor header -->
      <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1.25rem;min-height:40px">

        <!-- Back button -->
        <button class="adm-back-btn" onclick="ADMIN.closeProd()" title="Retour aux produits" style="flex-shrink:0;width:32px;height:32px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        <!-- Breadcrumb + title -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.3rem;font-size:.62rem;color:var(--t3);margin-bottom:.2rem">
            <span>Catalogue</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:9px;height:9px;flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
            <span>Produits</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:9px;height:9px;flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
            <span style="color:var(--bl);font-weight:600">${p.name}</span>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="font-size:1rem;font-weight:700;color:var(--t1);letter-spacing:-.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px">${p.name}</span>
            <span class="adm-prod-type-badge" style="flex-shrink:0">${engLbl}</span>
            <span style="font-size:.62rem;color:var(--t3);font-family:monospace;flex-shrink:0">${p.id}</span>
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;align-items:center;gap:.4rem;flex-shrink:0">
          ${engineDropdown}
          <button id="prodSaveBtn" class="adm-primary-btn" onclick="ADMIN.saveProd()" style="height:32px" title="Sauvegarder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Sauvegarder
          </button>
          <button class="adm-action-btn danger" onclick="ADMIN.deleteProd('${p.id}')" style="height:32px;width:32px;padding:0;justify-content:center" title="Supprimer ce produit">
            ${IC.trash}
          </button>
        </div>
      </div>

      <div class="adm-grid adm-grid-1">
        <!-- Section Builder -->
        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              </div>
              <div>
                <div class="adm-card-title">Section Builder</div>
                <div class="adm-card-sub">Modules du formulaire de configuration — glissez pour réordonner</div>
              </div>
            </div>
          </div>
          <div class="adm-sb-split">
            <div class="adm-sb-active">${activeSections}</div>
            <div class="adm-sb-palette">
              <div class="adm-sb-pal-title">Modules disponibles</div>
              ${palette||`<div style="font-size:.65rem;color:var(--t3);font-style:italic">Tous les modules sont déjà utilisés</div>`}
            </div>
          </div>
        </div>

        ${p.conception_types?.length ? `
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr">
              <div class="adm-card-hdr-l">
                <div class="adm-card-hdr-ico">${_svg('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>')}</div>
                <div class="adm-card-title">Prestations de conception</div>
              </div>
              <button class="adm-action-btn" onclick="ADMIN.addConcType(${pi})">${IC.plus} Ajouter</button>
            </div>
            <div class="adm-rows">${concRows}</div>
          </div>` : ''}

        ${(p.calc_engine==='gadget'||p.product_type==='gadget') ? `
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')}</div>
              <div><div class="adm-card-title">Tarif gadget / objet</div>
              <div class="adm-card-sub">Pour enveloppes : laisser à 0 et utiliser sections env-size / env-support</div></div></div></div>
            <div class="adm-rows">
              ${_row('Prix unitaire HT','Coût produit par unité avant marge',_numInp(`products.${pi}.unit_price`,p.unit_price||0,'DH/u'))}
              ${_row('Coût impression','Par unité',_numInp(`products.${pi}.print_cost`,p.print_cost||0,'DH/u'))}
              ${_row('Technique','Informatif — apparaît sur devis/facture',`<input class="adm-form-inp" style="max-width:160px;font-size:.7rem" placeholder="Sérigraphie, DTF, Laser…" value="${(p.print_technique||'').replace(/"/g,'&quot;')}" oninput="ADMIN.set('products.${pi}.print_technique',this.value)">`)}
            </div>
          </div>` : ''}

        ${(p.calc_engine==='sqm'||['grand_format','rollup','pancarte'].includes(p.product_type)) ? `
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/>')}</div>
              <div><div class="adm-card-title">Configuration Grand Format</div>
              <div class="adm-card-sub">Matière et support depuis les listes globales (Tarifs & Marges)</div></div></div></div>
            <div class="adm-rows">
              ${_row('Matière',`Sélectionner dans la liste globale — configurée dans <em>Tarifs & Marges</em>`,
                `<select class="adm-form-inp" style="max-width:200px;font-size:.7rem" onchange="ADMIN.set('products.${pi}.gf_material_id',this.value)">
                  <option value="">— Choisir —</option>
                  ${(DB.gf_materials||[]).map(m=>`<option value="${m.id}"${p.gf_material_id===m.id?' selected':''}>${m.label}</option>`).join('')}
                </select>`)}
              ${_row('Support','Optionnel — Roll-up, X-banner, mécanisme…',
                `<select class="adm-form-inp" style="max-width:200px;font-size:.7rem" onchange="ADMIN.set('products.${pi}.support_id',this.value)">
                  <option value="">— Aucun —</option>
                  ${(DB.rollup_supports||[]).map(s=>`<option value="${s.id}"${p.support_id===s.id?' selected':''}>${s.label} (${s.cost} DH)</option>`).join('')}
                </select>`)}
            </div>
          </div>` : ''}

        ${p.id==='chemise-rabat' ? `
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>')}</div><div class="adm-card-title">Options rabat chemise</div></div></div>
            <div class="adm-rows">
              ${_row('Rabat collé','Coût par unité',_numInp(`products.${pi}.rabat_colle_cost`,p.rabat_colle_cost??0.8,'DH/u'))}
              ${_row('Rabat imprimé','Coût par unité',_numInp(`products.${pi}.rabat_imprime_cost`,p.rabat_imprime_cost??0.5,'DH/u'))}
            </div>
          </div>` : ''}
      </div>`;
  }

  /* ══ SIDEBAR BUILDER ══ */

  function _bSidebar() {
    const groups = DB.sidebar_groups || [];
    const assignedIds = new Set(groups.flatMap(g => g.products || []));
    const unassigned = (DB.products || []).filter(p => !assignedIds.has(p.id));

    const groupCards = groups.map((grp, gi) => {
      const isOpen = activeGroup === gi;
      const prods = (grp.products || []).map((pid, pi) => {
        const p = DB.products.find(x => x.id === pid);
        if (!p) return '';
        return `
          <div class="sgrp-prod-row sp-draggable" draggable="true"
            ondragstart="ADMIN.spDragStart(event,${gi},${pi})" ondragend="ADMIN.spDragEnd(event)"
            ondragover="ADMIN.spDragOver(event)" ondragleave="ADMIN.spDragLeave(event)"
            ondrop="ADMIN.spDrop(event,${gi},${pi})">
            <div class="sb-drag-handle" style="font-size:8px;color:var(--t3)">⠿</div>
            <div class="sgrp-prod-ico">${IC[p.icon]||IC.layout}</div>
            <span class="sgrp-prod-lbl">${p.name}</span>
            <span class="sgrp-prod-type">${p.product_type||'standard'}</span>
            <button class="adm-del-btn" onclick="ADMIN.sgrpRemoveProd(${gi},${pi})" title="Retirer">${IC.trash}</button>
          </div>`;
      }).join('');

      const grpSet = new Set(grp.products || []);
      const addable = (DB.products || []).filter(p => !grpSet.has(p.id));
      const picker = addable.length
        ? `<div class="sgrp-add-area">
            <select class="adm-inp-lbl" style="width:100%;font-size:.68rem" onchange="ADMIN.sgrpAddProd(${gi},this.value);this.value=''">
              <option value="">+ Ajouter un produit…</option>
              ${addable.map(p=>`<option value="${p.id}">${p.name} (${p.product_type||'standard'})</option>`).join('')}
            </select>
           </div>`
        : '';

      return `
        <div class="sgrp-card${isOpen?' open':''} sg-draggable" draggable="true"
          ondragstart="ADMIN.sgrpDragStart(event,${gi})" ondragend="ADMIN.sgrpDragEnd(event)"
          ondragover="ADMIN.sgrpDragOver(event)" ondragleave="ADMIN.sgrpDragLeave(event)"
          ondrop="ADMIN.sgrpDrop(event,${gi})">
          <div class="sgrp-hdr" onclick="ADMIN.sgrpToggle(${gi})">
            <span class="sgrp-drag sb-drag-handle" onclick="event.stopPropagation()">⠿</span>
            <input class="sgrp-name-inp" id="sgrp-inp-${gi}" readonly
              value="${(grp.label||'').replace(/"/g,'&quot;')}"
              onblur="this.readOnly=true;ADMIN.sgrpRename(${gi},this.value)"
              onkeydown="if(event.key==='Enter'){this.blur()}"
              placeholder="Nom du groupe">
            <span class="sgrp-count">${(grp.products||[]).length} produit${(grp.products||[]).length!==1?'s':''}</span>
            <span class="sgrp-chevron">${IC['chev-r']}</span>
            <button class="adm-del-btn" title="Renommer"
              onclick="event.stopPropagation();(function(){var i=document.getElementById('sgrp-inp-${gi}');i.readOnly=false;i.focus();i.select();})()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
            </button>
            <button class="adm-del-btn" onclick="event.stopPropagation();ADMIN.sgrpRemove(${gi})" title="Supprimer">${IC.trash}</button>
          </div>
          ${isOpen ? `<div class="sgrp-body">
            <div class="sgrp-prods">${prods||`<div class="sgrp-empty">Aucun produit</div>`}</div>
            ${picker}
          </div>` : ''}
        </div>`;
    }).join('');

    const poolItems = unassigned.length
      ? unassigned.map(p => {
          const gi = (activeGroup !== null && activeGroup < groups.length) ? activeGroup : null;
          const canAssign = gi !== null;
          const groupName = canAssign ? groups[gi].label : '';
          return `
            <div class="sgrp-pool-item" style="justify-content:space-between">
              <div style="display:flex;align-items:center;gap:.4rem;min-width:0">
                <div class="sgrp-prod-ico" style="flex-shrink:0">${IC[p.icon]||IC.layout}</div>
                <div style="min-width:0">
                  <div style="font-size:.69rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                  <div style="font-size:.57rem;color:var(--t3)">${p.product_type||'standard'}</div>
                </div>
              </div>
              ${canAssign
                ? `<button class="adm-action-btn" onclick="ADMIN.sgrpAddProd(${gi},'${p.id}')">+ ${groupName}</button>`
                : `<span style="font-size:.58rem;color:var(--t3);font-style:italic">Ouvrez un groupe →</span>`}
            </div>`;
        }).join('')
      : `<div style="padding:.75rem;font-size:.7rem;color:var(--gn);font-weight:600">✓ Tous les produits sont assignés</div>`;

    const icoSb = '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';
    const icoPool = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>';
    return `
      ${_pageHdr('Sidebar','Gérez les groupes et l\'ordre des produits dans la navigation')}
      <div class="adm-grid adm-grid-1">
        ${_cardAct('Groupes de navigation',icoSb,
          `<button class="adm-action-btn" onclick="ADMIN.sgrpAdd()">${IC.plus} Nouveau groupe</button>`,
          `<div class="adm-sgrp-list">${groupCards||`<div class="adm-empty" style="padding:1.5rem">Aucun groupe — créez-en un</div>`}</div>`,true)}
        ${_cardAct('Produits non assignés',icoPool,
          unassigned.length ? `<span style="font-size:.63rem;color:var(--am);font-weight:600">${unassigned.length} non assigné${unassigned.length>1?'s':''}</span>` : '',
          `<div class="sgrp-pool-wrap"><div class="sgrp-pool-grid">${poolItems}</div></div>`,true)}
      </div>`;
  }

  /* ── Sidebar group CRUD ── */
  function sgrpAdd() {
    if (!DB.sidebar_groups) DB.sidebar_groups = [];
    const newId = 'group-' + Date.now();
    DB.sidebar_groups.push({ id: newId, label: 'Nouveau groupe', products: [] });
    activeGroup = DB.sidebar_groups.length - 1;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRemove(gi) {
    if (!confirm('Supprimer ce groupe ? Les produits ne seront pas supprimés.')) return;
    DB.sidebar_groups.splice(gi, 1);
    if (activeGroup === gi) activeGroup = null;
    else if (activeGroup > gi) activeGroup--;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRename(gi, val) {
    DB.sidebar_groups[gi].label = val;
    _flash(); UI.buildSidebar();
  }
  function sgrpToggle(gi) {
    activeGroup = activeGroup === gi ? null : gi;
    _renderTab('sidebar');
  }
  function sgrpAddProd(gi, pid) {
    if (!pid) return;
    const grp = DB.sidebar_groups[gi];
    if (!grp.products) grp.products = [];
    if (!grp.products.includes(pid)) grp.products.push(pid);
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRemoveProd(gi, pi) {
    DB.sidebar_groups[gi].products.splice(pi, 1);
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpAssign(pid) {
    // Legacy fallback — pool now uses dropdown selectors directly
    if (DB.sidebar_groups.length === 0) {
      alert('Créez d\'abord un groupe (bouton "Nouveau groupe")'); return;
    }
    const gi = (activeGroup !== null && activeGroup < DB.sidebar_groups.length) ? activeGroup : null;
    if (gi === null) {
      alert('Sélectionnez un groupe dans la liste (cliquez sur un groupe pour l\'ouvrir) puis utilisez la liste déroulante pour assigner.'); return;
    }
    sgrpAddProd(gi, pid);
  }

  /* ── Sidebar group drag-to-reorder ── */
  let _sgrpDragFrom = null;
  function sgrpDragStart(e, gi) {
    _sgrpDragFrom = gi;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sg-draggable')?.classList.add('sg-dragging'), 0);
  }
  function sgrpDragEnd(e) {
    document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-dragging','sg-drag-over'));
  }
  function sgrpDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.sg-draggable');
    if (card) {
      document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-drag-over'));
      card.classList.add('sg-drag-over');
    }
  }
  function sgrpDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sg-draggable')?.classList.remove('sg-drag-over');
  }
  function sgrpDrop(e, toGi) {
    e.preventDefault();
    document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-dragging','sg-drag-over'));
    if (_sgrpDragFrom === null || _sgrpDragFrom === toGi) { _sgrpDragFrom = null; return; }
    const grp = DB.sidebar_groups.splice(_sgrpDragFrom, 1)[0];
    DB.sidebar_groups.splice(toGi, 0, grp);
    if (activeGroup === _sgrpDragFrom) activeGroup = toGi;
    _sgrpDragFrom = null;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }

  /* ── Product-within-group drag-to-reorder ── */
  let _spDragFrom = null, _spDragGi = null;
  function spDragStart(e, gi, pi) {
    _spDragFrom = pi; _spDragGi = gi;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sp-draggable')?.classList.add('sp-dragging'), 0);
  }
  function spDragEnd(e) {
    document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-dragging','sp-drag-over'));
  }
  function spDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sp-draggable');
    if (row) {
      document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-drag-over'));
      row.classList.add('sp-drag-over');
    }
  }
  function spDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sp-draggable')?.classList.remove('sp-drag-over');
  }
  function spDrop(e, gi, toPi) {
    e.preventDefault();
    document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-dragging','sp-drag-over'));
    if (_spDragFrom === null || _spDragFrom === toPi || _spDragGi !== gi) { _spDragFrom = null; _spDragGi = null; return; }
    const prods = DB.sidebar_groups[gi].products;
    const item = prods.splice(_spDragFrom, 1)[0];
    prods.splice(toPi, 0, item);
    _spDragFrom = null; _spDragGi = null;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }

  /* ══ ACTIONS ══ */
  function openProd(id) {
    activeProd = id; activeSec = null; _prodUnsaved = false;
    // Switch to split view
    $('admBody').style.display    = 'none';
    $('vDash').style.display      = 'none';
    const split = $('admSplit');
    if (split) split.style.display = 'flex';
    _setToolbarActive('admBtnCat');
    const p = DB?.products?.find(x=>x.id===id);
    _setTitle(p ? `Produits · ${p.name||id}` : 'Produits');
    // Render section builder into split top
    const content = $('admSplitContent');
    if (content) content.innerHTML = _bProducts();
    _buildNav();
    // Reset preview
    _pvProdId = null;
    if (_pvOpen) _renderPreview();
  }
  function closeProd() {
    activeProd = null; activeSec = null; _prodUnsaved = false;
    _hideSplit();
    $('admBody').style.display = 'block';
    _renderProd();
    _setTitle('Produits');
  }

  /* ── Delete product ── */
  function deleteProd(id) {
    const p = DB.products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer le produit "${p.name}" ?\nCette action est irréversible.`)) return;
    // Remove from all sidebar groups
    (DB.sidebar_groups || []).forEach(grp => {
      const pi = (grp.products || []).indexOf(id);
      if (pi >= 0) grp.products.splice(pi, 1);
    });
    const idx = DB.products.findIndex(x => x.id === id);
    if (idx >= 0) DB.products.splice(idx, 1);
    activeProd = null; activeSec = null; _prodUnsaved = false;
    _flash(); _renderProd(); UI.buildSidebar();
  }

  /* ── Unsaved tracking for product builder ── */
  let _prodUnsaved = false;
  function _markUnsaved() {
    DB_MOD.persistCurrent(); // always persist locally
    if (!_prodUnsaved) {
      _prodUnsaved = true;
      const btn = document.getElementById('prodSaveBtn');
      if (btn) {
        btn.style.background = 'var(--am)';
        btn.style.borderColor = 'var(--am)';
        btn.title = 'Modifications non sauvegardées — cliquer pour sauvegarder';
      }
    }
  }
  function saveProd() {
    _prodUnsaved = false;
    _flash();
    const btn = document.getElementById('prodSaveBtn');
    if (btn) {
      btn.style.background = 'var(--gn)';
      btn.style.borderColor = 'var(--gn)';
      btn.title = '✓ Enregistré';
      setTimeout(() => {
        btn.style.background = 'var(--bl)';
        btn.style.borderColor = 'var(--bl)';
        btn.title = 'Sauvegarder les modifications';
      }, 2000);
    }
  }

  /* ── New product wizard ── */
  function selectNewType(t) { _newProdDraft.calc_engine = t; _renderProd(); }

  /* ── Change engine on existing product ── */
  function changeEngine(pi, engine) {
    const _legacyMap = { sheet_fit:'standard', sqm:'grand_format', gadget:'gadget', carnet:'carnet', service:'conception' };
    DB.products[pi].calc_engine  = engine;
    DB.products[pi].product_type = _legacyMap[engine] || 'standard';
    _markUnsaved(); _renderProd();
  }
  function startNewProd()   { _newProdMode=true; _newProdDraft={}; _renderProd(); }
  function cancelNewProd()  { _newProdMode=false; _newProdDraft={}; _renderProd(); }
  function confirmNewProd() {
    const name   = document.getElementById('newProdName')?.value?.trim();
    const rawId  = document.getElementById('newProdId')?.value?.trim();
    const icon   = document.getElementById('newProdIcon')?.value || 'layout';
    const engine = document.getElementById('newProdType')?.value || 'sheet_fit';
    const _legacyType = { sheet_fit:'standard', sqm:'grand_format', gadget:'gadget', carnet:'carnet', service:'conception' };
    if (!name) { alert('Le nom est obligatoire.'); return; }
    const id = rawId
      ? rawId.toLowerCase().replace(/[^a-z0-9-]/g,'-')
      : name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if (DB.products.find(p=>p.id===id)) { alert(`L'identifiant "${id}" existe déjà.`); return; }
    const newProd = {
      id, name, icon,
      calc_engine:  engine,
      product_type: _legacyType[engine] || 'standard',
      sizes: [], paper_stocks: [], paper_stocks_special: [],
      finishes_lam: [], finishes_addon: [], sides: ['single','double'],
      quantities: [100, 250, 500], composition: [],
    };
    DB.products.push(newProd);
    _newProdMode = false; _newProdDraft = {};
    DB_MOD.persistCurrent(); // save locally, user must click Sauvegarder to push
    openProd(id);
    // Show a one-time tip about sidebar assignment
    setTimeout(() => {
      const tip = document.createElement('div');
      tip.style.cssText='position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:.5rem 1.1rem;border-radius:9px;font-size:.72rem;font-weight:500;z-index:9999;display:flex;align-items:center;gap:.5rem';
      tip.innerHTML='✓ Produit créé. Configurez ses sections puis allez dans <strong style="color:#60a5fa">Sidebar</strong> pour l\'assigner à un groupe.';
      document.body.appendChild(tip);
      setTimeout(()=>tip.remove(), 4500);
    }, 200);
  }

  /* ── Section Builder actions ── */

  /* Helper: get product by index and ensure composition is initialised.
     Replaces the repeated 2-line guard scattered across every sb* function. */
  function _getComp(pi) {
    const p = DB.products[pi];
    if (!p.composition) p.composition = _getComposition(p);
    return p;
  }

  function sbToggle(ei)  { activeSec = activeSec===ei ? null : ei; _renderProd(); }
  function sbAdd(pi, tid) {
    const p = _getComp(pi);
    p.composition.push({ type_id: tid, config: {} });
    activeSec = p.composition.length - 1;
    _markUnsaved(); _renderProd();
  }
  function sbRemove(pi, ei) {
    const p = _getComp(pi);
    p.composition.splice(ei, 1);
    if (activeSec >= p.composition.length) activeSec = null;
    _markUnsaved(); _renderProd();
  }
  function sbMove(pi, ei, dir) {
    const p = _getComp(pi);
    const arr = p.composition;
    const ni = ei + dir;
    if(ni < 0 || ni >= arr.length) return;
    [arr[ei], arr[ni]] = [arr[ni], arr[ei]];
    activeSec = ni;
    _flash(); _renderProd();
  }
  function sbTogglePaper(pi, ei, field, id, checked) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg[field] = cfg[field] || [];
    const idx = cfg[field].indexOf(id);
    if(checked && idx<0) cfg[field].push(id);
    if(!checked && idx>=0) cfg[field].splice(idx,1);
    _markUnsaved();
  }
  function sbSetCfg(pi, ei, key, val) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg[key] = val;
    _markUnsaved();
  }
  function sbAddSize(pi, ei) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg.items = cfg.items || [...(p.sizes||[])];
    cfg.items.push({ id:'sz-'+Date.now(), label:'Nouveau', w:210, h:297, cost_base:0, dims:'210×297 mm' });
    _markUnsaved(); _renderProd();
  }
  function sbRemoveSize(pi, ei, i) {
    const p = DB.products[pi];
    p.composition[ei].config.items.splice(i,1);
    _markUnsaved(); _renderProd();
  }
  function sbSizeLabel(pi, ei, i, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i].label = val; _markUnsaved();
  }
  function sbSizeDim(pi, ei, i, field, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i][field] = val;
    // keep dims in sync so legacy field stays accurate
    if (field === 'w' || field === 'h') {
      const s = cfg.items[i];
      if (s.w && s.h) s.dims = `${s.w}×${s.h} mm`;
    }
    _markUnsaved();
    if(curProd && curProd.id===DB.products[pi].id) UI.renderFooter();
  }
  /* ── Size drag-to-reorder ── */
  let _dragFrom    = null;
  let _secDragFrom = null;
  let _lDragFrom   = null;  // for check-row lists (paper, lam, addon, gf-options)

  /* ── List (check-row) drag-to-reorder ── */
  function sbLDragStart(e, i) {
    _lDragFrom = i;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sz-draggable')?.classList.add('dragging'), 0);
  }
  function sbLDragEnd(e) {
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
  }
  function sbLDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sz-draggable');
    if (row) {
      document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    }
  }
  function sbLDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sz-draggable')?.classList.remove('drag-over');
  }
  function sbLDrop(e, type, pi, ei, toIdx) {
    e.preventDefault();
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
    if (_lDragFrom === null || _lDragFrom === toIdx) { _lDragFrom = null; return; }
    let arr;
    if (type === 'papers') {
      arr = DB.paper_stocks;
    } else {
      const cfg = DB.products[pi].composition[ei].config;
      if      (type === 'allowed') arr = cfg.allowed;
      else if (type === 'lam')     arr = cfg.lam;
      else if (type === 'items')   arr = cfg.items;
    }
    if (!arr) { _lDragFrom = null; return; }
    const item = arr.splice(_lDragFrom, 1)[0];
    arr.splice(toIdx, 0, item);
    _lDragFrom = null;
    _markUnsaved(); _renderProd();
  }

  function sbDragStart(e, pi, ei, i) {
    _dragFrom = i;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sz-draggable')?.classList.add('dragging'), 0);
  }
  function sbDragEnd(e) {
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
  }
  function sbDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sz-draggable');
    if (row) {
      document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    }
  }
  function sbDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sz-draggable')?.classList.remove('drag-over');
  }
  function sbDrop(e, pi, ei, toIdx) {
    e.preventDefault();
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
    if (_dragFrom === null || _dragFrom === toIdx) { _dragFrom = null; return; }
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.items) { _dragFrom = null; return; }
    const item = cfg.items.splice(_dragFrom, 1)[0];
    cfg.items.splice(toIdx, 0, item);
    _dragFrom = null;
    _markUnsaved(); _renderProd();
  }

  /* ── Section card drag-to-reorder ── */
  function secDragStart(e, pi, ei) {
    _secDragFrom = ei;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sb-card')?.classList.add('sec-dragging'), 0);
  }
  function secDragEnd(e) {
    document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-dragging','sec-drag-over'));
  }
  function secDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.sb-card');
    if (card) {
      document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-drag-over'));
      card.classList.add('sec-drag-over');
    }
  }
  function secDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sb-card')?.classList.remove('sec-drag-over');
  }
  function secDrop(e, pi, toEi) {
    e.preventDefault();
    document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-dragging','sec-drag-over'));
    if (_secDragFrom === null || _secDragFrom === toEi) { _secDragFrom = null; return; }
    const p = _getComp(pi);
    const section = p.composition.splice(_secDragFrom, 1)[0];
    p.composition.splice(toEi, 0, section);
    if (activeSec === _secDragFrom) activeSec = toEi;
    _secDragFrom = null;
    _markUnsaved(); _renderProd();
  }

  function sbAddQty(pi, ei) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg.items = cfg.items || [...(p.quantities||p.page_options||[])];
    cfg.items.push(100);
    _markUnsaved(); _renderProd();
  }
  function sbRemoveQty(pi, ei, i) {
    DB.products[pi].composition[ei].config.items.splice(i,1);
    _markUnsaved(); _renderProd();
  }
  function sbQtyVal(pi, ei, i, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i] = val; _markUnsaved();
  }

  /* ── Deep path setter (DO NOT CHANGE) ── */
  function set(path, value) {
    const parts=path.split('.');
    let obj=DB;
    for(let i=0;i<parts.length-1;i++){const k=parts[i];obj=isNaN(k)?obj[k]:obj[+k];}
    const last=parts[parts.length-1];
    obj[isNaN(last)?last:+last]=value;
    _flash();
    if(curProd) UI.renderFooter();
  }
  function _flash() {
    DB_MOD.persistCurrent();
    const el = $('admSaved');
    if (DB_MOD.getSource() === 'supabase') {
      el.textContent = '⏳ Enregistrement…';
      el.classList.add('on');
      clearTimeout(el._t);
      DB_MOD.pushToSupabase().then(result => {
        if (result.ok) {
          el.textContent = '✓ Enregistré';
          el.style.color = 'var(--gn)';
        } else {
          el.textContent = '⚠ Erreur sauvegarde';
          el.style.color = 'var(--rd)';
        }
        el._t = setTimeout(() => { el.classList.remove('on'); el.textContent = '✓ Enregistré'; el.style.color = ''; }, 2800);
      });
    } else {
      el.textContent = '✓ Enregistré';
      el.style.color = '';
      el.classList.add('on');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('on'), 1800);
    }
  }

  /* ── Paper stocks ── */
  function removePaper(idx)    { DB.paper_stocks.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addPaper(special)   { DB.paper_stocks.push({id:'paper-'+Date.now(),label:'Nouveau papier',desc:'',print_recto:2,print_rv:3,...(special===true||special==='true'?{special:true}:{})}); _flash(); _renderTab(activeTab); }
  /* ── Envelope generator ── */
  function generateEnvelope() {
    const name    = $('envGenName')?.value?.trim();
    const size    = $('envGenSize')?.value?.trim();
    const type    = $('envGenType')?.value || 'normal';
    const cost    = parseFloat($('envGenCost')?.value) || 0;
    const print   = parseFloat($('envGenPrint')?.value) || 0;
    const thresh  = parseInt($('envGenThresh')?.value) || 500;
    if (!name) { alert('Renseignez le nom (ex: DL)'); return; }
    DB.paper_stocks.push({
      id: 'env-' + name.toLowerCase().replace(/\s/g,'-') + '-' + type + '-' + Date.now(),
      label: name, size: size || '',
      envelope: true, envelope_type: type,
      cost_per_sheet: cost,
      print_cost_per_color: print,
      print_threshold: thresh,
    });
    // Reset form
    if ($('envGenName')) $('envGenName').value = '';
    if ($('envGenSize')) $('envGenSize').value = '';
    if ($('envGenCost'))   $('envGenCost').value = '0';
    if ($('envGenPrint'))  $('envGenPrint').value = '0';
    if ($('envGenThresh')) $('envGenThresh').value = '500';
    _flash(); _renderTab(activeTab);
  }

  /* ── Envelope formats (new model) ── */
  function addEnvFormat2() {
    const name = $('efName')?.value?.trim().toUpperCase();
    const w    = parseFloat($('efW')?.value) || 0;
    const h    = parseFloat($('efH')?.value) || 0;
    const cost = parseFloat($('efCost')?.value) || 0;
    if (!name) { alert('Renseignez le nom (ex: DL)'); return; }
    if (!DB.envelope_formats) DB.envelope_formats = [];
    DB.envelope_formats.push({ id:'ef-'+Date.now(), name, w, h, size:`${w}×${h} mm`, cost });
    if ($('efName'))  $('efName').value  = '';
    if ($('efW'))     $('efW').value     = '';
    if ($('efH'))     $('efH').value     = '';
    if ($('efCost'))  $('efCost').value  = '0';
    _flash(); _renderTab(activeTab);
  }
  function addEnvFormatPreset(name, w, h) {
    if ($('efName')) $('efName').value = name;
    if ($('efW'))    $('efW').value    = w;
    if ($('efH'))    $('efH').value    = h;
  }
  function removeEnvFormat(i) {
    DB.envelope_formats.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }

  /* ── Envelope types (new model) ── */
  function addEnvType() {
    const name    = $('etName')?.value?.trim();
    const costPce = parseFloat($('etCostPce')?.value) || 0;
    const costCol = parseFloat($('etCost')?.value)    || 0;
    if (!name) { alert('Renseignez le nom du type (ex: Autodex)'); return; }
    if (!DB.envelope_types) DB.envelope_types = [];
    DB.envelope_types.push({ id:'et-'+Date.now(), name, cost_per_piece: costPce, cost_per_color: costCol });
    if ($('etName'))    $('etName').value    = '';
    if ($('etCostPce')) $('etCostPce').value = '0';
    if ($('etCost'))    $('etCost').value    = '0';
    _flash(); _renderTab(activeTab);
  }
  function removeEnvType(i) {
    DB.envelope_types.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }

  /* ── Lam finishes ── */
  function removeLam(idx)      { DB.finishes.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addLam()            { DB.finishes.push({id:'lam-'+Date.now(),label:'Nouveau pelliculage',group:'lam',cost_ps:1,per_side:true}); _flash(); _renderTab(activeTab); }
  /* ── Addon finishes ── */
  function removeAddon(idx)    { DB.finishes_addon.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addAddon()          { DB.finishes_addon.push({id:'addon-'+Date.now(),label:'Nouvelle finition',group:'faconnage',pricing_model:'per_unit',cost_setup:0,cost_pu:0}); _flash(); _renderTab(activeTab); }
  /* ── Binding options ── */
  function addBinding()        { if (!DB.binding_options) DB.binding_options=[]; DB.binding_options.push({id:'bind-'+Date.now(),label:'Nouvelle reliure',cost_flat:0,cost_per_copy:0}); _flash(); _renderTab(activeTab); }
  function removeBinding(i)    { DB.binding_options.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF finishes ── */
  function addGfFinish()       { if (!DB.gf_finishes) DB.gf_finishes=[]; DB.gf_finishes.push({id:'gff-'+Date.now(),label:'Nouvelle finition GF',cost_flat:0}); _flash(); _renderTab(activeTab); }
  function removeGfFinish(i)   { if (DB.gf_finishes) DB.gf_finishes.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF global materials ── */
  function addGfMat()          { if (!DB.gf_materials) DB.gf_materials=[]; DB.gf_materials.push({id:'mat-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeGfMat(i)      { if (DB.gf_materials) DB.gf_materials.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Rollup / X-banner supports ── */
  function addRuSupport()      { if (!DB.rollup_supports) DB.rollup_supports=[]; DB.rollup_supports.push({id:'sup-'+Date.now(),label:'Nouveau support',cost:0}); _flash(); _renderTab(activeTab); }
  function removeRuSupport(i)  { if (DB.rollup_supports) DB.rollup_supports.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF materials (global) ── */
  function addGfMaterial()     { if (!DB.gf_materials) DB.gf_materials=[]; DB.gf_materials.push({id:'gfm-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeGfMaterial(i) { if (DB.gf_materials) DB.gf_materials.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Supports (global — rollup, xbanner…) ── */
  function addSupport()        { if (!DB.supports) DB.supports=[]; DB.supports.push({id:'sup-'+Date.now(),label:'Nouveau support',cost:0}); _flash(); _renderTab(activeTab); }
  function removeSupport(i)    { if (DB.supports) DB.supports.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Planche formats ── */
  function addGadget() {
    const id='gadget-'+Date.now();
    DB.products.push({id,name:'Nouveau gadget',icon:'tag',calc_engine:'gadget',product_type:'gadget',unit_price:0,print_cost:0,print_technique:'',quantities:[10,25,50,100],composition:[]});
    _markUnsaved(); _flash(); _renderTab(activeTab);
  }
  function deleteGadget(id) {
    if (!confirm('Supprimer ce gadget ?')) return;
    const i=DB.products.findIndex(p=>p.id===id);
    if (i>=0){DB.products.splice(i,1);_markUnsaved();_flash();_renderTab(activeTab);}
  }
  function addPlanche()        { if (!DB.planches) DB.planches=[{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}]; DB.planches.push({id:'P'+Date.now(),w:480,h:320}); _flash(); _renderTab(activeTab); }
  /* ── SQM product helpers ── */
  function addSqmMat(pi)       { const p=DB.products[pi]; const arr=p.gf_materials?'gf_materials':'pancarte_materials'; if(!p[arr])p[arr]=[]; p[arr].push({id:'mat-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeSqmMat(pi,mi) { const p=DB.products[pi]; const arr=p.gf_materials?'gf_materials':'pancarte_materials'; if(p[arr])p[arr].splice(mi,1); _flash(); _renderTab(activeTab); }
  function _activeTab()        { return activeTab; }
  /* ── Conception types ── */
  function removeConcType(pi,i){ DB.products[pi].conception_types.splice(i,1); _flash(); _renderTab(activeTab); }
  function addConcType(pi)     { (DB.products[pi].conception_types=DB.products[pi].conception_types||[]).push({id:'ct-'+Date.now(),label:'Nouvelle prestation',price:500,note:''}); _flash(); _renderTab(activeTab); }
  /* ── Pancarte materials ── */
  function removePanMat(pi,mi){ DB.products[pi].pancarte_materials.splice(mi,1); _flash(); _renderTab(activeTab); }
  function addPanMat(pi)      { (DB.products[pi].pancarte_materials=DB.products[pi].pancarte_materials||[]).push({id:'mat-'+Date.now(),label:'Nouveau support',cost_per_sqm:300}); _flash(); _renderTab(activeTab); }
  /* ── Export ── */
  /* ── Contact & Shop builder ── */
  function _bContact() {
    if (!DB.contact) DB.contact = {};
    if (!DB.shop)    DB.shop    = {};
    const s = DB.shop, c = DB.contact;
    const row = (label, key, obj, placeholder='', hint='') => `
      <div class="adm-row">
        <div>
          <div class="adm-row-label">${label}</div>
          ${hint ? `<div class="adm-row-sub">${hint}</div>` : ''}
        </div>
        <input class="adm-inp-lbl" style="width:160px"
          value="${(obj[key]||'').replace(/"/g,'&quot;')}"
          placeholder="${placeholder}"
          oninput="ADMIN.set('${obj===DB.shop?'shop':'contact'}.${key}',this.value)">
      </div>`;
    return `<div class="adm-page-hdr">
        <div><div class="adm-page-title">Contact & Boutique</div>
        <div class="adm-page-sub">Ces infos apparaissent sur le devis PDF et dans le lien WhatsApp</div></div>
      </div>
      <div class="adm-grid adm-grid-1">
        ${_card('Boutique', '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
          row('Nom de la boutique', 'name',    s, 'Kote Imprimerie') +
          row('Adresse',            'address', s, 'Casablanca, Maroc') +
          row('Téléphone',          'tel',     s, '+212 6XX XXX XXX') +
          row('ICE',                'ice',     s, '000000000000000', 'Identifiant Commun de l\'Entreprise')
        )}
        ${_card('WhatsApp', '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.15 1.18 2 2 0 012.13 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>',
          row('Numéro WhatsApp', 'whatsapp', c, '212600000000',
              'Format international sans + ni espaces — ex: 212661234567') +
          `<div class="adm-row" style="border-bottom:none">
            <div class="adm-row-label" style="font-size:.62rem;color:var(--t3)">
              Aperçu du lien
            </div>
            <code style="font-size:.62rem;color:var(--bl);word-break:break-all">
              ${c.whatsapp ? `wa.me/${(c.whatsapp||'').replace(/\D/g,'')}` : '—'}
            </code>
          </div>`
        )}

        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico" style="background:#e8f4fd">
                <svg viewBox="0 0 24 24" fill="none" stroke="#0088cc" stroke-width="1.8" style="width:11px;height:11px"><path d="M21.5 2L2 9.5l7 2.5 2.5 7L21.5 2z"/><path d="M9 12l4 4"/></svg>
              </div>
              <div>
                <div class="adm-card-title">Telegram — Notifications commandes</div>
                <div class="adm-card-sub">Recevez une alerte sur votre téléphone à chaque nouvelle commande</div>
              </div>
            </div>
            <label class="tog${c.tg_enabled?' on':''}"
              onclick="this.classList.toggle('on');ADMIN.set('contact.tg_enabled',this.classList.contains('on'));ADMIN._settingsSelectTab('contact')">
            </label>
          </div>
          <div class="adm-rows" style="${c.tg_enabled?'':'opacity:.45;pointer-events:none'}">
            <div class="adm-row">
              <div>
                <div class="adm-row-label">Bot Token</div>
                <div class="adm-row-sub">@BotFather → /newbot → copier le token</div>
              </div>
              <input class="adm-inp-lbl" style="width:200px;font-family:monospace;font-size:.65rem"
                type="password"
                value="${(c.tg_token||'').replace(/"/g,'&quot;')}"
                placeholder="123456789:AAF..."
                oninput="ADMIN.set('contact.tg_token',this.value)">
            </div>
            <div class="adm-row">
              <div>
                <div class="adm-row-label">Chat ID</div>
                <div class="adm-row-sub">Envoyez /start à votre bot, puis message @userinfobot</div>
              </div>
              <input class="adm-inp-lbl" style="width:140px;font-family:monospace"
                value="${(c.tg_chat_id||'').replace(/"/g,'&quot;')}"
                placeholder="123456789"
                oninput="ADMIN.set('contact.tg_chat_id',this.value)">
            </div>
            <div class="adm-row" style="border-bottom:none">
              <div>
                <div class="adm-row-label">Tester</div>
                <div class="adm-row-sub">Envoie un message de test à votre bot</div>
              </div>
              <button class="adm-action-btn" onclick="ADMIN.tgTest()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M21.5 2L2 9.5l7 2.5 2.5 7L21.5 2z"/></svg>
                Envoyer test
              </button>
            </div>
          </div>
          <div style="padding:.5rem .85rem;font-size:.63rem;color:var(--t3);border-top:1px solid var(--bd);line-height:1.65;background:var(--s2)">
            <strong style="color:var(--t2)">Guide rapide :</strong>
            1. Ouvrez Telegram → cherchez <code style="background:var(--bd);border-radius:3px;padding:1px 5px">@BotFather</code> →
            tapez <code style="background:var(--bd);border-radius:3px;padding:1px 5px">/newbot</code> → suivez les instructions → copiez le token ci-dessus.<br>
            2. Cherchez <code style="background:var(--bd);border-radius:3px;padding:1px 5px">@userinfobot</code> → envoyez n'importe quel message → copiez votre <em>Id</em> comme Chat ID.<br>
            3. Activez le toggle et cliquez <strong>Envoyer test</strong>.
          </div>
        </div>

      </div>`;
  }

  /* ── Telegram test ── */
  async function tgTest() {
    const token   = DB.contact?.tg_token?.trim();
    const chat_id = DB.contact?.tg_chat_id?.trim();
    if (!token || !chat_id) { alert('Renseignez le Token et le Chat ID d\'abord.'); return; }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: '✅ Kote · Notifications activées !\n\nVous recevrez une alerte ici à chaque nouvelle commande.', parse_mode: 'HTML' }),
    }).catch(e => ({ ok: false, _err: e.message }));
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    if (data.ok) { alert('✅ Message envoyé — vérifiez Telegram !'); }
    else         { alert('❌ Échec : ' + (data.description || res._err || 'Vérifiez token et chat ID')); }
  }

  /* ── Design tiers tab ── */
  function _bDesign() {
    if (!DB.contact) DB.contact = {};
    const c = DB.contact;
    const DEFAULT_TIERS = [
      { id:'basic',   label:'Basic',   desc:'Mise en page simple',          price:200 },
      { id:'pro',     label:'Pro',     desc:'Design créatif + corrections',  price:400 },
      { id:'premium', label:'Premium', desc:'Premium + déclinaisons + rush', price:800 },
    ];
    const tiers = c.design_tiers || DEFAULT_TIERS;

    const tierRows = tiers.map((t, i) => `
      <div class="adm-row" style="align-items:center;gap:.5rem;flex-wrap:wrap">
        <input class="adm-inp-lbl" style="width:90px" value="${(t.label||'').replace(/"/g,'&quot;')}"
          placeholder="Nom" oninput="ADMIN.setDesignTier(${i},'label',this.value)">
        <input class="adm-inp-lbl" style="flex:1;min-width:120px" value="${(t.desc||'').replace(/"/g,'&quot;')}"
          placeholder="Description courte" oninput="ADMIN.setDesignTier(${i},'desc',this.value)">
        <div class="adm-num-wrap" style="flex-shrink:0">
          <input type="number" class="adm-inp" style="width:72px" min="0" step="50"
            value="${t.price||0}" oninput="ADMIN.setDesignTier(${i},'price',+this.value)">
          <span class="adm-num-unit">DH</span>
        </div>
      </div>`).join('');

    const waRow = `
      <div class="adm-row">
        <div>
          <div class="adm-row-label">WhatsApp graphiste</div>
          <div class="adm-row-sub">Numéro qui recevra les demandes de design (format: 212XXXXXXXXX)</div>
        </div>
        <input class="adm-inp-lbl" style="width:160px"
          value="${(c.designer_whatsapp||'').replace(/"/g,'&quot;')}"
          placeholder="212600000000"
          oninput="ADMIN.set('contact.designer_whatsapp',this.value)">
      </div>`;

    const enabledRow = `
      <div class="adm-row" style="border-bottom:none">
        <div>
          <div class="adm-row-label">Activer la section design</div>
          <div class="adm-row-sub">Affiche l'uploader + les niveaux de conception sur chaque produit catalogue</div>
        </div>
        <label class="tog${c.design_enabled !== false ? ' on' : ''}"
          onclick="this.classList.toggle('on');ADMIN.set('contact.design_enabled',this.classList.contains('on'))">
        </label>
      </div>`;

    return `
      ${_pageHdr('Design fichiers', 'Uploader + niveaux de conception graphique')}
      <div class="adm-grid adm-grid-1">
        ${_card('Paramètres', '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
          enabledRow + waRow
        )}
        ${_card('Niveaux de conception', '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
          `<div style="padding:.3rem 0 .5rem .85rem;font-size:.67rem;color:var(--t3)">
            3 niveaux fixés — modifiez label, description et prix
          </div>` + tierRows
        )}
      </div>`;
  }

  function setDesignTier(i, field, value) {
    if (!DB.contact) DB.contact = {};
    if (!DB.contact.design_tiers) {
      DB.contact.design_tiers = [
        { id:'basic',   label:'Basic',   desc:'Mise en page simple',          price:200 },
        { id:'pro',     label:'Pro',     desc:'Design créatif + corrections',  price:400 },
        { id:'premium', label:'Premium', desc:'Premium + déclinaisons + rush', price:800 },
      ];
    }
    if (!DB.contact.design_tiers[i]) return;
    DB.contact.design_tiers[i][field] = value;
    _flash();
  }

  /* Per-product design section tier config (stored in composition entry.config.tiers) */
  function setDesignSectionTier(pi, ei, ti, field, value) {
    const p = _getComp(pi); if (!p) return;
    const entry = p.composition[ei]; if (!entry) return;
    if (!entry.config) entry.config = {};
    const model = entry.config.design_model || 'tier';
    const defaults = model === 'multipage'
      ? [
          { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price_base:400,  price_per_page:50  },
          { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price_base:700,  price_per_page:80  },
          { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price_base:1200, price_per_page:120 },
        ]
      : [
          { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price:200 },
          { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price:400 },
          { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price:800 },
        ];
    if (!entry.config.tiers) entry.config.tiers = JSON.parse(JSON.stringify(defaults));
    if (!entry.config.tiers[ti]) return;
    entry.config.tiers[ti][field] = value;
    _markUnsaved();
  }

  /* ── Auth tab — minimalist, details behind help toggles ── */
  function _bAuth() {
    if (!DB.contact) DB.contact = {};
    const c = DB.contact;
    const supa_url     = window.SUPABASE_URL || '';
    const callback_url = supa_url ? supa_url + '/auth/v1/callback' : '—';
    const netlify_url  = c.site_url || window.location.origin;
    const storedUrl    = localStorage.getItem('kote_supa_url') || '';
    const storedKey    = localStorage.getItem('kote_supa_key') || '';
    const isCustom     = !!storedUrl;

    /* ⓘ button + collapsible help panel */
    const helpBtn = (id, html) =>
      `<button onclick="var p=document.getElementById('${id}');p.style.display=p.style.display==='none'?'block':'none'"
        style="background:none;border:1.5px solid var(--bd);border-radius:50%;width:18px;height:18px;cursor:pointer;
          display:inline-flex;align-items:center;justify-content:center;color:var(--t3);flex-shrink:0;font-size:.6rem;
          font-weight:700;line-height:1;transition:all var(--ease)"
        onmouseover="this.style.borderColor='var(--bl)';this.style.color='var(--bl)'"
        onmouseout="this.style.borderColor='var(--bd)';this.style.color='var(--t3)'">?</button>
       <div id="${id}" style="display:none;margin-top:.5rem;padding:.6rem .75rem;background:var(--s2);
         border-radius:7px;border:1px solid var(--bd);font-size:.69rem;color:var(--t2);line-height:1.65">
         ${html}
       </div>`;

    /* Editable field row — larger, clean */
    const frow = (label, id, val, ph, type, helpId, helpHtml) =>
      `<div style="display:flex;flex-direction:column;gap:.35rem;padding:.6rem 1rem;border-bottom:1px solid var(--bd)">
        <div style="display:flex;align-items:center;gap:.4rem">
          <span style="font-size:.75rem;font-weight:600;color:var(--t2)">${label}</span>
          ${helpHtml ? helpBtn(helpId, helpHtml) : ''}
        </div>
        <input id="${id}" type="${type}" style="border:1.5px solid var(--bd);border-radius:var(--r);
          padding:.52rem .75rem;font-size:.8rem;color:var(--t1);background:var(--sf);
          width:100%;transition:border-color var(--ease);font-family:inherit"
          placeholder="${ph}" value="${val}"
          onfocus="this.style.borderColor='var(--bl)'" onblur="this.style.borderColor='var(--bd)'">
      </div>`;

    /* Read-only info row */
    const infoRow = (label, val) =>
      `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
        padding:.55rem 1rem;border-bottom:1px solid var(--bd)">
        <span style="font-size:.73rem;font-weight:500;color:var(--t2);white-space:nowrap">${label}</span>
        <code style="font-size:.7rem;color:var(--bl);font-family:monospace;word-break:break-all;text-align:right">${val}</code>
      </div>`;

    /* Status badge */
    const badge = (ok, label) =>
      `<span style="font-size:.68rem;font-weight:700;padding:3px 10px;border-radius:20px;white-space:nowrap;
        background:${ok?'#dcfce7':'#fef3c7'};color:${ok?'#166534':'#92400e'}">${label}</span>`;

    const icoSupa = '<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>';
    const icoMail = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';
    const icoGoog = '<circle cx="12" cy="12" r="10"/><path d="M17.5 12H12v2.5h3.2c-.4 1.5-1.7 2.5-3.2 2.5-2 0-3.5-1.5-3.5-3.5s1.5-3.5 3.5-3.5c.9 0 1.7.3 2.3.8l1.8-1.8A6 6 0 1012 18a6 6 0 006-6h-.5z"/>';
    const icoCode = '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';

    return `
      ${_pageHdr('Authentification', 'Supabase · Google OAuth · Magic Link')}
      <div style="display:flex;flex-direction:column;gap:.75rem;max-width:600px">

        <!-- Supabase connexion -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(icoSupa)}</div>
              <div style="flex:1"><div class="adm-card-title" style="font-size:.82rem">Connexion Supabase</div></div>
              ${badge(!!supa_url, isCustom ? '✓ Personnalisé' : 'Par défaut')}
            </div>
          </div>
          ${frow('URL du projet', 'supaUrlInp', storedUrl || supa_url, 'https://xxxx.supabase.co', 'text',
            'h-supa-url', 'Supabase Dashboard → <strong>Settings → API → Project URL</strong>')}
          ${frow('Clé anon publique', 'supaKeyInp', storedKey || SUPABASE_ANON_KEY, 'eyJhbGci…', 'password',
            'h-supa-key', 'Supabase Dashboard → <strong>Settings → API → anon public</strong><br>Commence par <code>eyJ</code>. Clé publique, safe côté client.')}
          <div style="padding:.65rem 1rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
            <button class="adm-primary-btn" style="font-size:.76rem;height:34px" onclick="ADMIN.saveSupaCreds()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
              Enregistrer &amp; Reconnecter
            </button>
            <button class="adm-action-btn" style="font-size:.74rem;height:34px" onclick="ADMIN.downloadConfigJs()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>
              config.js
            </button>
            ${isCustom ? '<button class="adm-action-btn danger" style="font-size:.74rem;height:34px" onclick="ADMIN.resetSupaCreds()">Réinitialiser</button>' : ''}
            ${helpBtn('h-supa-how',
              '<strong>Enregistrer & Reconnecter</strong> — sauvegarde dans <em>ce navigateur</em> uniquement.<br><br>' +
              '<strong>config.js</strong> — génère un fichier avec les identifiants intégrés. Déployez-le sur Netlify pour que tous les appareils se connectent automatiquement.')}
          </div>
        </div>

        <!-- Magic Link -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(icoMail)}</div>
              <div style="flex:1"><div class="adm-card-title" style="font-size:.82rem">Magic Link (Email)</div></div>
              ${badge(true, '✓ Actif')}
            </div>
          </div>
          <div style="padding:.6rem 1rem;font-size:.73rem;color:var(--t2)">
            Activé par défaut via Supabase — aucune configuration requise.
          </div>
        </div>

        <!-- Google OAuth -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(icoGoog)}</div>
              <div style="flex:1"><div class="adm-card-title" style="font-size:.82rem">Google OAuth</div></div>
            </div>
          </div>
          ${frow('URL du site', 'authSiteUrlInp', c.site_url||'', 'https://votre-site.netlify.app', 'text',
            'h-google-url', 'Doit correspondre exactement à l\'URL dans <strong>Supabase → Auth → URL Configuration → Site URL</strong>.')}
          ${infoRow('Callback URL', callback_url)}
          <div style="padding:.55rem 1rem">
            ${helpBtn('h-google-steps',
              '1. <strong>Supabase</strong> → Auth → Providers → Google → Activer<br>' +
              '2. <strong>Google Cloud Console</strong> → Credentials → OAuth Client → Web → ajouter le Callback URL ci-dessus<br>' +
              '3. Copier <em>Client ID</em> + <em>Client Secret</em> → Coller dans Supabase Google provider<br>' +
              '4. Supabase → URL Configuration → Site URL = votre URL du site')}
          </div>
        </div>

        <!-- URL Configuration -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>')}</div>
              <div><div class="adm-card-title" style="font-size:.82rem">URL Configuration Supabase</div></div>
            </div>
          </div>
          ${infoRow('Site URL', netlify_url)}
          ${infoRow('Redirect URLs', netlify_url + '&nbsp;&nbsp;' + netlify_url + '/*')}
          <div style="padding:.55rem 1rem .65rem;font-size:.7rem;color:#92400e;background:#fffbeb;
            border-top:1px solid #fde68a;display:flex;gap:.5rem;align-items:flex-start">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:13px;height:13px;flex-shrink:0;margin-top:1px">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Auth Flow Type = <strong>Implicit</strong> (pas PKCE) — Supabase → Auth → URL Configuration
          </div>
        </div>

        <!-- SQL setup -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(icoCode)}</div>
              <div style="flex:1">
                <div class="adm-card-title" style="font-size:.82rem">SQL initial</div>
                <div class="adm-card-sub">Supabase → SQL Editor → New query → Run</div>
              </div>
              ${helpBtn('h-sql-info', 'À exécuter <strong>une seule fois</strong> lors du setup initial. Ajoute les colonnes <code>user_id</code> et <code>source</code> à <code>kote_orders</code>, et crée les RLS policies.')}
            </div>
          </div>
          <pre style="margin:.4rem .85rem .75rem;background:#0f172a;color:#e2e8f0;border-radius:7px;
            padding:.75rem;font-size:.68rem;overflow-x:auto;line-height:1.65;font-family:'Courier New',monospace">ALTER TABLE kote_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE kote_orders ADD COLUMN IF NOT EXISTS source text DEFAULT 'client';
CREATE INDEX IF NOT EXISTS idx_orders_user ON kote_orders(user_id);
ALTER TABLE kote_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own orders"    ON kote_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert orders" ON kote_orders FOR INSERT WITH CHECK (true);
CREATE POLICY "service full"  ON kote_orders USING (auth.role() = 'service_role');
ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_formats jsonb;
ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_types   jsonb;</pre>
        </div>

      </div>`;
  }
  /* ── Supabase credentials management ── */
  function saveSupaCreds() {
    const url = $('supaUrlInp')?.value?.trim();
    const key = $('supaKeyInp')?.value?.trim();
    if (!url || !key) { alert('URL et clé requis'); return; }
    if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      alert('URL invalide — doit être https://xxxx.supabase.co'); return;
    }
    if (!key.startsWith('eyJ')) {
      alert('Clé invalide — doit commencer par eyJ...'); return;
    }
    localStorage.setItem('kote_supa_url', url);
    localStorage.setItem('kote_supa_key', key);
    // Clear session DB so it re-fetches from new account
    sessionStorage.removeItem('kote_db');
    sessionStorage.removeItem('kote_db_name');
    // Show feedback then reload
    const btn = document.querySelector('[onclick="ADMIN.saveSupaCreds()"]');
    if (btn) { btn.textContent = '✓ Enregistré — rechargement…'; btn.disabled = true; }
    setTimeout(() => location.reload(), 900);
  }

  function resetSupaCreds() {
    if (!confirm('Revenir aux identifiants par défaut (config.js) ?')) return;
    localStorage.removeItem('kote_supa_url');
    localStorage.removeItem('kote_supa_key');
    sessionStorage.removeItem('kote_db');
    setTimeout(() => location.reload(), 300);
  }

  function downloadConfigJs() {
    const url = $('supaUrlInp')?.value?.trim() || window.SUPABASE_URL || '';
    const key = $('supaKeyInp')?.value?.trim() || window.SUPABASE_ANON_KEY || '';
    if (!url || !key) { alert('Renseignez d\'abord l\'URL et la clé Supabase'); return; }

    const content = `'use strict';

/* ════════════════════════════════════════════════════════
   DB_MOD  — database load / session persistence + source toggle
   ════════════════════════════════════════════════════════ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROLE — controls feature visibility across the app
   'provider' → full app: admin, PDF, cost breakdown, DB toggle
   'client'   → product catalog + cart + order form only
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
if (typeof ROLE === 'undefined') var ROLE = 'provider';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DB TOGGLE — change DEFAULT_SOURCE to switch boot mode
   'json'      → auto-fetch ./data.json on page load
   'supabase'  → connect to Supabase REST API on page load
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DEFAULT_SOURCE = 'supabase'; /* ← CHANGE THIS LINE ONLY : supabase | json */

/* ── Supabase credentials — updated ${new Date().toLocaleDateString('fr-FR')} ─── */
const _storedUrl  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_url');
const _storedKey  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_key');

const SUPABASE_URL      = _storedUrl  || '${url}';
const SUPABASE_ANON_KEY = _storedKey  || '${key}';
/* expose to invoice.js (loaded as separate <script>) */
window.SUPABASE_URL      = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
/* ─────────────────────────────────────────────────────── */
`;

    const blob = new Blob([content], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.js';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportJSON() {
    const isSupa = DB_MOD.getSource() === 'supabase';
    let exportData = { ...DB };

    if (isSupa) {
      const exportBtn = document.querySelector('.adm-export-btn');
      const origHTML  = exportBtn?.innerHTML;
      if (exportBtn) exportBtn.innerHTML = '&#x23F3; Export&#x2026;';

      const _h = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY };
      try {
        const [rClients, rQuotes] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/kote_clients?select=*&order=nom.asc`,              { headers: _h }),
          fetch(`${SUPABASE_URL}/rest/v1/kote_quotes?select=*&order=created_at.desc`,       { headers: _h }),
        ]);
        if (rClients.ok) exportData._clients = await rClients.json();
        if (rQuotes.ok)  exportData._quotes  = await rQuotes.json();
      } catch(e) { console.warn('exportJSON: could not fetch clients/quotes', e); }

      if (exportBtn) exportBtn.innerHTML = origHTML;
    }

    const filename = isSupa
      ? `kote-backup-${new Date().toISOString().slice(0,10)}.json`
      : 'data.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));
    a.download = filename; a.click(); URL.revokeObjectURL(a.href);
  }

  /* ── Images tab ── */
  function _bImages() {
    const has = k => !!localStorage.getItem(`kote_img_${k}`);
    const badge = k => has(k)
      ? `<span style="font-size:.6rem;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:20px;font-weight:700">✓ Chargée</span>`
      : `<span style="font-size:.6rem;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-weight:700">Non chargée</span>`;

    const imgCard = (key, label, hint) => `
      <div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:8px">
        <div style="display:flex;align-items:center;width:100%;gap:8px">
          <div style="flex:1">
            <div class="adm-row-label">${label} ${badge(key)}</div>
            <div class="adm-row-sub">${hint}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <label style="cursor:pointer;background:#2563EB;color:#fff;padding:5px 12px;border-radius:6px;font-size:.65rem;font-weight:700">
              Choisir fichier
              <input type="file" accept="image/*" style="display:none"
                onchange="ADMIN.uploadImg('${key}',this)">
            </label>
            ${has(key) ? `<button onclick="ADMIN.clearImg('${key}')" style="background:none;border:1px solid #e4eaf2;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:.62rem;color:#ef4444">Supprimer</button>` : ''}
          </div>
        </div>
        ${has(key) ? `<img src="${localStorage.getItem('kote_img_'+key)}" style="max-height:60px;max-width:100%;border-radius:4px;border:1px solid #e4eaf2;object-fit:contain">` : ''}
      </div>`;

    return `<div class="adm-page-hdr">
      <div><div class="adm-page-title">Images du document</div>
      <div class="adm-page-sub">Ces images apparaissent dans l'aperçu et le PDF généré. Elles sont stockées localement dans votre navigateur.</div></div>
    </div>
    <div class="adm-grid adm-grid-1">
      ${_card('En-tête (Letterhead)', '<rect x="3" y="3" width="18" height="5" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/>',
        imgCard('lh', 'Fond de page / En-tête', 'Format PNG recommandé — taille A4 (2480 × 3508 px)')
      )}
      ${_card('Cachet', '<circle cx="12" cy="8" r="4"/><path d="M6 20h12"/><path d="M8 16c0-2.21 1.79-4 4-4s4 1.79 4 4v1H8v-1z"/>',
        imgCard('stamp', 'Image du cachet', 'PNG avec fond transparent recommandé — environ 400 × 260 px')
      )}
      ${_card('Signature', '<path d="M3 18c3-6 5-9 7-9s2 3 4 3 4-4.5 7-10.5"/><path d="M3 21h18"/>',
        imgCard('sig', 'Image de la signature', 'PNG avec fond transparent recommandé — environ 400 × 200 px')
      )}
    </div>`;
  }

  function uploadImg(key, input) {
    const file=input.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const dataURL=e.target.result;
      localStorage.setItem(`kote_img_${key}`,dataURL);
      if(window.INVOICE?.setImage) INVOICE.setImage(key,dataURL);
      _renderTab('images');
    };
    reader.readAsDataURL(file);
  }

  function clearImg(key) {
    localStorage.removeItem(`kote_img_${key}`);
    if(window.INVOICE?.setImage) INVOICE.setImage(key,'');
    _renderTab('images');
  }

  /* ════════════════════════════════════════════════════════
     EXPORT & BACKUP + DB CLEANER
     ════════════════════════════════════════════════════════ */

  /* ── State ── */
  let _exportKey = '';
  let _expCounts = {};          // { table_name: count | '…' | 'err' }
  let _wipeArmed = null;        // { btnId, table, filter } — two-step confirm

  /* ── Table registry — single source of truth ── */
  const _EXP_TABLES = [
    { id:'kote_config',  label:'Configuration', desc:'Produits, tarifs, paramètres', noWipe:true,  noCount:true },
    { id:'kote_quotes',  label:'Devis',         desc:'Devis générés'                                            },
    { id:'kote_orders',  label:'Commandes',     desc:'Commandes reçues'                                         },
    { id:'kote_clients', label:'Clients',       desc:'Répertoire clients'                                       },
  ];

  /* ── Supabase REST helpers ── */
  function _expHeaders() {
    const k = _exportKey.length > 20 ? _exportKey : SUPABASE_ANON_KEY;
    return { 'apikey': k, 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' };
  }

  async function _countRows(table) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
        method: 'GET',
        headers: { ..._expHeaders(), 'Prefer': 'count=exact' },
      });
      const cr = res.headers.get('content-range');    // e.g. "*/83"
      const n  = cr ? parseInt(cr.split('/')[1]) : null;
      return isNaN(n) ? '?' : n;
    } catch { return 'err'; }
  }

  /* ── Load counts async and patch DOM ── */
  async function _loadExportCounts() {
    for (const t of _EXP_TABLES) {
      if (t.noCount) { _expCounts[t.id] = 1; continue; }
      const el = $('expc-' + t.id);
      if (el) el.textContent = '…';
      const n = await _countRows(t.id);
      _expCounts[t.id] = n;
      if (el) el.textContent = typeof n === 'number' ? n + ' lignes' : n;
    }
    _refreshWipeButtons();
  }

  /* ── Refresh wipe button labels with live counts ── */
  function _refreshWipeButtons() {
    const hasKey = _exportKey.length > 20;
    document.querySelectorAll('.exp-wipe-btn').forEach(btn => {
      btn.disabled = !hasKey;
      btn.title    = hasKey ? '' : 'Clé secrète requise';
    });
  }

  /* ── Build _bExport UI ── */
  function _bExport() {
    const date = new Date().toISOString().slice(0,10);
    const dl   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>`;
    const hasKey = _exportKey.length > 20;

    /* Wipe buttons — disabled if no key */
    const wipeBtn = (id, label, table, filter) => `
      <button id="${id}" class="exp-wipe-btn"
        onclick="ADMIN.wipeArm('${id}','${table}','${filter}')"
        ${hasKey ? '' : 'disabled title="Clé secrète requise"'}
        style="padding:4px 9px;border-radius:5px;font-family:inherit;font-size:.62rem;
        font-weight:700;cursor:pointer;border:1.5px solid var(--bd);background:var(--s2);
        color:var(--t2);transition:all .15s;white-space:nowrap">
        ${label}
      </button>`;

    /* Order status options for select */
    const statusOpts = ['nouveau','en_cours','livre','annule']
      .map(s => `<option value="${s}">${{nouveau:'Nouveau',en_cours:'En cours',livre:'Livré',annule:'Annulé'}[s]}</option>`)
      .join('');

    return `
    <div class="adm-page-hdr" style="margin-bottom:.6rem">
      <div class="adm-page-title">Export &amp; Backup</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1.1rem;max-width:520px">

      <!-- ── Key ── -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
          <label style="font-size:.65rem;font-weight:700;color:var(--t2);
            text-transform:uppercase;letter-spacing:.6px">
            Service Role Key
            <span id="expKeyStatus" style="margin-left:5px;font-size:.58rem;
              font-weight:700;text-transform:none;letter-spacing:0"></span>
          </label>
          <button onclick="ADMIN.toggleExportHelp()" id="expHelpBtn"
            style="background:none;border:none;padding:0;font-size:.62rem;font-weight:600;
            color:var(--t3);cursor:pointer;display:flex;align-items:center;gap:3px;
            transition:color .15s;text-decoration:underline;text-underline-offset:2px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:10px;height:10px">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Comment obtenir la clé ?
          </button>
        </div>

        <!-- Help panel — hidden until needed -->
        <div id="expHelpPanel" style="display:none;margin-bottom:8px;padding:10px 12px 11px;
          background:#fffbeb;border:1px solid #fde68a;border-radius:7px">
          <div style="font-size:.65rem;color:#92400e;font-weight:700;margin-bottom:5px">
            📋 Guide rapide — Service Role Key
          </div>
          <ol style="font-size:.63rem;color:#78350f;line-height:1.75;padding-left:1.1rem;margin:0 0 7px">
            <li>Ouvrez votre projet sur <strong>supabase.com</strong></li>
            <li>Allez dans <strong>Project Settings → API</strong></li>
            <li>Cliquez l'onglet <strong>"Legacy anon, service_role API keys"</strong></li>
            <li>Copiez la clé <strong>service_role</strong> (commence par <code>eyJ…</code>)</li>
          </ol>
          <div style="font-size:.61rem;color:#b45309;background:#fef3c7;border:1px solid #fde68a;
            border-radius:5px;padding:5px 8px;display:flex;gap:5px;align-items:flex-start">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:10px;height:10px;flex-shrink:0;margin-top:1px;color:#d97706">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Clé secrète — utilisée <strong>en mémoire uniquement</strong>, jamais stockée.</span>
          </div>
        </div>

        <div style="display:flex;gap:5px">
          <input type="password" id="expKeyInp"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
            value="${_exportKey}"
            oninput="ADMIN.setExportKey(this.value)"
            style="flex:1;padding:7px 9px;border:1.5px solid var(--bd);border-radius:var(--r);
            font-family:monospace;font-size:.63rem;color:var(--t1);background:var(--s2);
            transition:border-color .15s;min-width:0">
          ${_exportKey ? `<button onclick="ADMIN.clearExportKey()" title="Effacer"
            style="background:none;border:1.5px solid var(--bd);border-radius:var(--r);
            padding:0 9px;cursor:pointer;font-size:.68rem;color:var(--t3)">✕</button>` : ''}
        </div>
      </div>

      <!-- ── Tables list ── -->
      <div>
        <div style="font-size:.58rem;font-weight:700;color:var(--t3);text-transform:uppercase;
          letter-spacing:.8px;margin-bottom:6px">Tables</div>
        <div style="border:1.5px solid var(--bd);border-radius:var(--r);overflow:hidden">
          ${_EXP_TABLES.map((t, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
              ${i < _EXP_TABLES.length-1 ? 'border-bottom:1px solid var(--bd);' : ''}
              background:var(--sf)">
              <div style="flex:1;min-width:0">
                <div style="font-size:.68rem;font-weight:700;color:var(--t1)">${t.id}</div>
                <div style="font-size:.6rem;color:var(--t3)">${t.desc}</div>
              </div>
              <span id="expc-${t.id}" style="font-size:.62rem;color:var(--t3);
                font-variant-numeric:tabular-nums;min-width:50px;text-align:right">
                ${t.noCount ? '1 ligne' : (_expCounts[t.id] !== undefined ? _expCounts[t.id] + (typeof _expCounts[t.id]==='number'?' lignes':'') : '…')}
              </span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;
                font-size:.65rem;color:var(--t2);font-weight:600;flex-shrink:0">
                <input type="checkbox" id="expInc-${t.id}" checked
                  style="width:13px;height:13px;accent-color:var(--bl);cursor:pointer">
              </label>
            </div>`).join('')}
        </div>
      </div>

      <!-- ── Export buttons ── -->
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button id="expSqlBtn" onclick="ADMIN.runExport('sql')"
          style="background:#0f172a;color:#fff;border:none;border-radius:var(--r);
          padding:8px 16px;font-family:inherit;font-size:.7rem;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:5px">
          ${dl} SQL
        </button>
        <button id="expJsonBtn" onclick="ADMIN.runExport('json')"
          style="background:var(--bl);color:#fff;border:none;border-radius:var(--r);
          padding:8px 16px;font-family:inherit;font-size:.7rem;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:5px">
          ${dl} JSON
        </button>
      </div>

      <!-- ── Divider ── -->
      <div style="height:1px;background:var(--bd);margin:.1rem 0"></div>

      <!-- ── DB Cleaner ── -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:.58rem;font-weight:700;color:var(--t3);
            text-transform:uppercase;letter-spacing:.8px">Nettoyage</div>
          ${!hasKey ? `<span style="font-size:.6rem;color:var(--am);font-weight:600">
            ⚠ Clé secrète requise pour les suppressions</span>` : ''}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">

          <!-- kote_quotes -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:.67rem;font-weight:600;color:var(--t2);
              min-width:100px">kote_quotes</span>
            ${wipeBtn('wp-qt-old', '&gt; 30 jours', 'kote_quotes', 'old30')}
            ${wipeBtn('wp-qt-all', 'Tout supprimer', 'kote_quotes', 'all')}
          </div>

          <!-- kote_orders by status + all -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:.67rem;font-weight:600;color:var(--t2);
              min-width:100px">kote_orders</span>
            <div style="display:flex;align-items:center;gap:5px">
              <select id="wipeOrderStatus"
                style="padding:4px 6px;border:1.5px solid var(--bd);border-radius:5px;
                font-family:inherit;font-size:.62rem;color:var(--t2);background:var(--s2)">
                ${statusOpts}
              </select>
              ${wipeBtn('wp-ord-st', 'Supprimer', 'kote_orders', 'status')}
            </div>
            ${wipeBtn('wp-ord-all', 'Tout supprimer', 'kote_orders', 'all')}
          </div>

          <!-- kote_clients -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:.67rem;font-weight:600;color:var(--t2);
              min-width:100px">kote_clients</span>
            ${wipeBtn('wp-cli-all', 'Tout supprimer', 'kote_clients', 'all')}
          </div>

          <!-- Full reset -->
          <div style="display:flex;align-items:center;gap:8px;padding-top:4px;
            border-top:1px dashed var(--bd);margin-top:2px;flex-wrap:wrap">
            <span style="font-size:.67rem;font-weight:600;color:var(--t2);
              min-width:100px">Réinitialiser</span>
            ${wipeBtn('wp-all', 'Tout effacer (quotes + orders + clients)', 'all', 'all')}
          </div>

        </div>
      </div>

      <!-- ── Status ── -->
      <div id="expStatus" style="display:none;padding:6px 10px;border-radius:6px;
        font-size:.65rem;font-weight:600;border:1px solid"></div>

    </div>`;
  }

  /* ── Called after render to load counts ── */
  function _initExportTab() {
    // Small delay to let DOM settle
    setTimeout(() => _loadExportCounts(), 80);
  }

  /* ── Wipe helpers ── */

  /* Reset a wipe button back to its neutral appearance */
  function _wipeResetBtn(btn) {
    if (!btn) return;
    btn.style.background  = 'var(--s2)';
    btn.style.color       = 'var(--t2)';
    btn.style.borderColor = 'var(--bd)';
    if (btn.dataset.origLabel) btn.textContent = btn.dataset.origLabel;
  }

  /* ── Wipe: arm → confirm two-step ── */
  function wipeArm(btnId, table, filter) {
    const btn = $(btnId);
    if (!btn) return;

    /* Already armed — execute */
    if (_wipeArmed && _wipeArmed.btnId === btnId) {
      wipeExecute(table, filter);
      return;
    }

    /* Disarm any previously armed button */
    if (_wipeArmed) {
      _wipeResetBtn($(_wipeArmed.btnId));
    }

    /* Count rows that will be affected */
    let affectedLabel = '?';
    if (filter === 'all') {
      const n = _expCounts[table];
      affectedLabel = typeof n === 'number' ? n + ' lignes' : 'toutes les lignes';
    } else if (filter === 'old30') {
      affectedLabel = '> 30 jours';
    } else if (filter === 'status') {
      const sel = $('wipeOrderStatus');
      affectedLabel = sel ? 'statut «' + sel.value + '»' : 'par statut';
    }

    /* Arm this button */
    btn.dataset.origLabel = btn.textContent;
    _wipeArmed = { btnId, table, filter };
    btn.textContent = '⚠ Confirmer ? (' + affectedLabel + ')';
    btn.style.background = '#fef2f2';
    btn.style.color = '#dc2626';
    btn.style.borderColor = '#fecaca';

    /* Auto-disarm after 5s if not confirmed */
    clearTimeout(btn._disarmTimer);
    btn._disarmTimer = setTimeout(() => {
      if (_wipeArmed?.btnId === btnId) {
        _wipeResetBtn(btn);
        _wipeArmed = null;
      }
    }, 5000);
  }

  /* ── Wipe: execute DELETE ── */
  async function wipeExecute(table, filter) {
    _wipeArmed = null;
    const status = $('expStatus');

    /* Build DELETE URLs — PostgREST requires a filter */
    const cutoff30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const tables = table === 'all'
      ? ['kote_quotes','kote_orders','kote_clients']
      : [table];

    /* Button loading state */
    const armBtn = $(tables.map(t => `wp-${t.split('_')[1][0]}`)[0]);

    if (status) { status.style.display = 'none'; }

    let totalDeleted = 0;

    try {
      for (const tbl of tables) {
        let url;
        if (filter === 'old30' && tbl === 'kote_quotes') {
          url = `${SUPABASE_URL}/rest/v1/${tbl}?created_at=lt.${encodeURIComponent(cutoff30)}`;
        } else if (filter === 'status' && tbl === 'kote_orders') {
          const sel = $('wipeOrderStatus');
          const st  = sel ? sel.value : 'nouveau';
          url = `${SUPABASE_URL}/rest/v1/${tbl}?status=eq.${encodeURIComponent(st)}`;
        } else {
          /* Delete all — filter on created_at >= epoch to satisfy PostgREST */
          url = `${SUPABASE_URL}/rest/v1/${tbl}?created_at=gte.1970-01-01`;
        }

        const res = await fetch(url, {
          method: 'DELETE',
          headers: { ..._expHeaders(), 'Prefer': 'return=minimal,count=exact' },
        });

        if (!res.ok) {
          const body = await res.text().catch(()=>'');
          throw new Error(`${tbl}: HTTP ${res.status} — ${body}`);
        }

        /* Parse deleted count from Content-Range */
        const cr = res.headers.get('content-range');
        const n  = cr ? parseInt(cr.split('/')[1]) : 0;
        if (!isNaN(n)) totalDeleted += n;
      }

      /* Success */
      if (status) {
        status.style.display = 'flex';
        status.style.background = 'var(--gn-lt)';
        status.style.color = 'var(--gn)';
        status.style.borderColor = '#a7f3d0';
        status.innerHTML = `✓ Supprimé — ${totalDeleted} ligne${totalDeleted>1?'s':''} effacée${totalDeleted>1?'s':''}`;
        setTimeout(() => { if (status) status.style.display = 'none'; }, 5000);
      }

      /* Refresh counts */
      await _loadExportCounts();

    } catch(e) {
      console.error('[WIPE]', e);
      if (status) {
        status.style.display = 'flex';
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.style.borderColor = '#fecaca';
        status.innerHTML = `✗ Erreur : ${e.message}`;
      }
    }

    /* Reset all wipe buttons */
    document.querySelectorAll('.exp-wipe-btn').forEach(b => _wipeResetBtn(b));
  }

  /* ── Export key helpers ── */
  function toggleExportHelp() {
    const p = $('expHelpPanel');
    const b = $('expHelpBtn');
    if (!p) return;
    const open = p.style.display === 'none';
    p.style.display = open ? 'block' : 'none';
    if (b) b.style.color = open ? 'var(--am)' : 'var(--t3)';
  }

  function setExportKey(val) {
    _exportKey = val.trim();
    const st = $('expKeyStatus');
    if (st) {
      st.textContent = _exportKey.length > 20 ? '✓ Clé saisie' : '';
      st.style.color = 'var(--gn)';
    }
    _refreshWipeButtons();
  }

  function clearExportKey() {
    _exportKey = '';
    const inp = $('expKeyInp');
    if (inp) inp.value = '';
    const st = $('expKeyStatus');
    if (st) st.textContent = '';
    _refreshWipeButtons();
    selectTab('export'); // re-render to show/hide clear button
  }

  /* ── Main export entry point ── */
  async function runExport(format) {
    const btnId  = format === 'sql' ? 'expSqlBtn' : 'expJsonBtn';
    const btn    = $(btnId);
    const status = $('expStatus');
    const date   = new Date().toISOString().slice(0, 10);

    /* Read per-table include toggles */
    const inc = {};
    _EXP_TABLES.forEach(t => {
      const cb = $('expInc-' + t.id);
      inc[t.id] = cb ? cb.checked : true;
    });

    const origHTML = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ …'; }
    if (status) status.style.display = 'none';

    const headers = _expHeaders();

    try {
      const fetches = [];
      if (inc['kote_quotes'])  fetches.push(fetch(`${SUPABASE_URL}/rest/v1/kote_quotes?select=*&order=created_at.desc`,  { headers }));
      else                     fetches.push(Promise.resolve({ ok:true, json:()=>[] }));
      if (inc['kote_orders'])  fetches.push(fetch(`${SUPABASE_URL}/rest/v1/kote_orders?select=*&order=created_at.desc`,  { headers }));
      else                     fetches.push(Promise.resolve({ ok:true, json:()=>[] }));
      if (inc['kote_clients']) fetches.push(fetch(`${SUPABASE_URL}/rest/v1/kote_clients?select=*&order=nom.asc`,         { headers }));
      else                     fetches.push(Promise.resolve({ ok:true, json:()=>[] }));

      const [rQ, rO, rC] = await Promise.all(fetches);
      if (inc['kote_quotes']  && !rQ.ok) throw new Error(`kote_quotes: HTTP ${rQ.status}`);
      if (inc['kote_orders']  && !rO.ok) throw new Error(`kote_orders: HTTP ${rO.status}`);
      if (inc['kote_clients'] && !rC.ok) throw new Error(`kote_clients: HTTP ${rC.status}`);

      const quotes  = await rQ.json();
      const orders  = await rO.json();
      const clients = await rC.json();

      const incConfig  = inc['kote_config'];
      const incClients = inc['kote_clients'];

      if (format === 'json') {
        _downloadJSON({ incConfig, incClients, quotes, orders, clients, date });
      } else {
        _downloadSQL({ incConfig, incClients, quotes, orders, clients, date });
      }

      const nRows = quotes.length + orders.length + clients.length;
      if (status) {
        status.style.display = 'flex';
        status.style.background = 'var(--gn-lt)';
        status.style.color = 'var(--gn)';
        status.style.borderColor = '#a7f3d0';
        status.innerHTML = `✓ Export réussi — ${nRows} lignes (${date})`;
        setTimeout(() => { if (status) status.style.display = 'none'; }, 5000);
      }
    } catch(e) {
      console.error('[EXPORT]', e);
      if (status) {
        status.style.display = 'flex';
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.style.borderColor = '#fecaca';
        status.innerHTML = `✗ Erreur : ${e.message}`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
  }

  /* ── JSON download ── */
  function _downloadJSON({ incConfig, incClients, quotes, orders, clients, date }) {
    const out = incConfig ? { ...DB } : {};
    out._quotes = quotes;
    out._orders = orders;
    if (incClients) out._clients = clients;
    _triggerDownload(
      JSON.stringify(out, null, 2),
      `kote-backup-${date}.json`,
      'application/json'
    );
  }

  /* ── SQL download ── */
  function _downloadSQL({ incConfig, incClients, quotes, orders, clients, date }) {
    const ts   = new Date().toISOString();
    const esc  = v => v === null || v === undefined ? 'NULL'
                   : typeof v === 'number'           ? String(v)
                   : typeof v === 'boolean'          ? (v ? 'TRUE' : 'FALSE')
                   : `'${String(v).replace(/'/g, "''")}'`;
    const escJ = v => v === null || v === undefined ? 'NULL'
                   : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

    /* INSERT block generator */
    const inserts = (table, rows, colFn) => {
      if (!rows.length) return `-- (no rows in ${table})\n`;
      return rows.map(r => `INSERT INTO ${table} (${colFn(r).map(c=>c[0]).join(', ')}) VALUES (${colFn(r).map(c=>c[1]).join(', ')}) ON CONFLICT (id) DO NOTHING;`).join('\n') + '\n';
    };

    const quoteCols = r => [
      ['id',         esc(r.id)],
      ['created_at', esc(r.created_at)],
      ['updated_at', esc(r.updated_at)],
      ['ref',        esc(r.ref)],
      ['status',     esc(r.status)],
      ['client_nom', esc(r.client_nom)],
      ['client_ice', esc(r.client_ice)],
      ['total_ht',   esc(r.total_ht)],
      ['total_ttc',  esc(r.total_ttc)],
      ['payload',    escJ(r.payload)],
    ];

    const orderCols = r => [
      ['id',             esc(r.id)],
      ['created_at',     esc(r.created_at)],
      ['updated_at',     esc(r.updated_at)],
      ['ref',            esc(r.ref)],
      ['status',         esc(r.status)],
      ['client_nom',     esc(r.client_nom)],
      ['client_tel',     esc(r.client_tel)],
      ['client_email',   esc(r.client_email)],
      ['client_ville',   esc(r.client_ville)],
      ['client_adresse', esc(r.client_adresse)],
      ['total_ht',       esc(r.total_ht)],
      ['total_ttc',      esc(r.total_ttc)],
      ['payload',        escJ(r.payload)],
    ];

    const clientCols = r => [
      ['id',         esc(r.id)],
      ['created_at', esc(r.created_at)],
      ['nom',        esc(r.nom)],
      ['adresse',    esc(r.adresse)],
      ['ice',        esc(r.ice)],
      ['tel',        esc(r.tel)],
      ['email',      esc(r.email)],
    ];

    const configInsert = incConfig && DB
      ? `INSERT INTO kote_config (id, sidebar_groups, products, paper_stocks, finishes, finishes_addon, gf_finishes, binding_options, pricing, sheet, turnaround_options, offset, shop, contact, envelope_formats, envelope_types)
VALUES (
  1,
  ${escJ(DB.sidebar_groups)},
  ${escJ(DB.products)},
  ${escJ(DB.paper_stocks)},
  ${escJ(DB.finishes)},
  ${escJ(DB.finishes_addon)},
  ${escJ(DB.gf_finishes)},
  ${escJ(DB.binding_options)},
  ${escJ(DB.pricing)},
  ${escJ(DB.sheet)},
  ${escJ(DB.turnaround_options)},
  ${escJ(DB.offset)},
  ${escJ(DB.shop)},
  ${escJ(DB.contact)},
  ${escJ(DB.envelope_formats||[])},
  ${escJ(DB.envelope_types||[])}
) ON CONFLICT (id) DO UPDATE SET
  sidebar_groups=EXCLUDED.sidebar_groups, products=EXCLUDED.products,
  paper_stocks=EXCLUDED.paper_stocks, finishes=EXCLUDED.finishes,
  finishes_addon=EXCLUDED.finishes_addon, gf_finishes=EXCLUDED.gf_finishes,
  binding_options=EXCLUDED.binding_options, pricing=EXCLUDED.pricing,
  sheet=EXCLUDED.sheet, turnaround_options=EXCLUDED.turnaround_options,
  offset=EXCLUDED.offset, shop=EXCLUDED.shop, contact=EXCLUDED.contact,
  envelope_formats=EXCLUDED.envelope_formats, envelope_types=EXCLUDED.envelope_types;`
      : '-- kote_config: export désactivé';

    const sql = `-- ══════════════════════════════════════════════════════════
-- KOTE DATABASE BACKUP
-- Generated : ${ts}
-- Source    : ${SUPABASE_URL}
-- Schema    : Kote v9.6
-- Tables    : kote_config, kote_quotes, kote_orders${incClients ? ', kote_clients' : ''}
--
-- USAGE: Run in Supabase SQL Editor on a fresh project.
--   1. Create a new Supabase project
--   2. Open SQL Editor → New query
--   3. Paste this entire file and click Run
-- ══════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Helper: auto-update updated_at ───────────────────────
create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ══════════════════════════════════════════════════════════
-- TABLE: kote_config
-- ══════════════════════════════════════════════════════════
create table if not exists kote_config (
  id               int4    primary key default 1,
  sidebar_groups   jsonb,
  products         jsonb,
  paper_stocks     jsonb,
  finishes         jsonb,
  finishes_addon   jsonb,
  gf_finishes      jsonb,
  binding_options  jsonb,
  pricing          jsonb,
  sheet            jsonb,
  turnaround_options jsonb,
  offset           jsonb,
  shop             jsonb,
  contact          jsonb,
  envelope_formats jsonb,
  envelope_types   jsonb
);

-- Add envelope columns if table already exists
ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_formats jsonb;
ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_types   jsonb;

-- ══════════════════════════════════════════════════════════
-- TABLE: kote_quotes
-- ══════════════════════════════════════════════════════════
create table if not exists kote_quotes (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  ref         text        not null,
  status      text        default 'devis',
  client_nom  text,
  client_ice  text,
  total_ht    numeric,
  total_ttc   numeric,
  payload     jsonb
);
create index if not exists kote_quotes_created_at_idx on kote_quotes (created_at desc);
create index if not exists kote_quotes_ref_idx        on kote_quotes (ref);

drop trigger if exists kote_quotes_updated_at on kote_quotes;
create trigger kote_quotes_updated_at
  before update on kote_quotes
  for each row execute function _set_updated_at();

-- ══════════════════════════════════════════════════════════
-- TABLE: kote_orders
-- ══════════════════════════════════════════════════════════
create table if not exists kote_orders (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  ref             text        not null,
  status          text        default 'nouveau',
  client_nom      text,
  client_tel      text,
  client_email    text,
  client_ville    text,
  client_adresse  text,
  total_ht        numeric,
  total_ttc       numeric,
  payload         jsonb
);
create index if not exists kote_orders_created_at_idx on kote_orders (created_at desc);
create index if not exists kote_orders_status_idx     on kote_orders (status);
create index if not exists kote_orders_ref_idx        on kote_orders (ref);

drop trigger if exists kote_orders_updated_at on kote_orders;
create trigger kote_orders_updated_at
  before update on kote_orders
  for each row execute function _set_updated_at();

-- ══════════════════════════════════════════════════════════
-- TABLE: kote_clients
-- ══════════════════════════════════════════════════════════
create table if not exists kote_clients (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  nom         text,
  adresse     text,
  ice         text,
  tel         text,
  email       text
);
create index if not exists kote_clients_nom_idx on kote_clients (nom);

-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════
alter table kote_config  enable row level security;
alter table kote_quotes  enable row level security;
alter table kote_orders  enable row level security;
alter table kote_clients enable row level security;

-- Drop existing policies cleanly before recreating
do $$ declare r record;
begin
  for r in select policyname, tablename from pg_policies
    where tablename in ('kote_config','kote_quotes','kote_orders','kote_clients')
  loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- kote_config: anon can read + update (app uses anon key, no auth)
create policy "anon can read config"   on kote_config for select to anon using (true);
create policy "anon can update config" on kote_config for update to anon using (true);

-- kote_quotes: anon full access
create policy "anon can insert quotes" on kote_quotes for insert to anon with check (true);
create policy "anon can read quotes"   on kote_quotes for select to anon using (true);
create policy "anon can update quotes" on kote_quotes for update to anon using (true);

-- kote_orders: anon full access
create policy "anon can insert orders" on kote_orders for insert to anon with check (true);
create policy "anon can read orders"   on kote_orders for select to anon using (true);
create policy "anon can update orders" on kote_orders for update to anon using (true);

-- kote_clients: anon full access
create policy "anon can insert clients" on kote_clients for insert to anon with check (true);
create policy "anon can read clients"   on kote_clients for select to anon using (true);
create policy "anon can update clients" on kote_clients for update to anon using (true);

-- ══════════════════════════════════════════════════════════
-- DATA: kote_config
-- ══════════════════════════════════════════════════════════
${configInsert}

-- ══════════════════════════════════════════════════════════
-- DATA: kote_quotes (${quotes.length} rows)
-- ══════════════════════════════════════════════════════════
${inserts('kote_quotes', quotes, quoteCols)}
-- ══════════════════════════════════════════════════════════
-- DATA: kote_orders (${orders.length} rows)
-- ══════════════════════════════════════════════════════════
${inserts('kote_orders', orders, orderCols)}
${incClients ? `-- ══════════════════════════════════════════════════════════
-- DATA: kote_clients (${clients.length} rows)
-- ══════════════════════════════════════════════════════════
${inserts('kote_clients', clients, clientCols)}` : '-- kote_clients: export désactivé (option décochée)'}

-- ══════════════════════════════════════════════════════════
-- END OF BACKUP — ${ts}
-- ══════════════════════════════════════════════════════════
`;

    _triggerDownload(sql, `kote-backup-${date}.sql`, 'text/plain');
  }

  /* ── Trigger browser download ── */
  function _triggerDownload(content, filename, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { open, close, selectTab,
           toggleNav, closeNav, goToDash, goToProducts, togglePreview, _pvSet,
           _settingsSelectTab, toggleDbOverflow, closeDbOverflow, syncDbDot,
           openCatSheet, closeCatSheet, toggleCatSheet,
           set, exportJSON, saveSupaCreds, resetSupaCreds, downloadConfigJs, deleteProd, saveProd, selectNewType, changeEngine, _renderTab,
           removePaper, addPaper, addEnvFormat2, addEnvFormatPreset, removeEnvFormat, addEnvType, removeEnvType, removeLam, addLam, removeAddon, addAddon,
           addBinding, removeBinding, addGfFinish, removeGfFinish, addGfMat, removeGfMat, addRuSupport, removeRuSupport,
           addGfMaterial, removeGfMaterial, addSupport, removeSupport,
           addPlanche, addSqmMat, removeSqmMat, _activeTab,
           addCityRow, removeCityRow, dcSetFee, dcSearch, dcFilter, dcPage, dcExport, dcImport, dcReset, removeConcType, addConcType, removePanMat, addPanMat, addSqmMat, removeSqmMat, addPlanche, _activeTab, addGadget, deleteGadget,
           sbAdd, sbRemove, sbMove, sbToggle, sbTogglePaper, sbSetCfg,
           sbAddSize, sbRemoveSize, sbSizeLabel, sbSizeDim,
           sbDragStart, sbDragEnd, sbDragOver, sbDragLeave, sbDrop,
           secDragStart, secDragEnd, secDragOver, secDragLeave, secDrop,
           sbAddQty, sbRemoveQty, sbQtyVal,
           sbLDragStart, sbLDragEnd, sbLDragOver, sbLDragLeave, sbLDrop,
           openProd, closeProd,
           startNewProd, cancelNewProd, confirmNewProd,
           sgrpAdd, sgrpRemove, sgrpRename, sgrpToggle, sgrpAddProd, sgrpRemoveProd, sgrpAssign,
           sgrpDragStart, sgrpDragEnd, sgrpDragOver, sgrpDragLeave, sgrpDrop,
           spDragStart, spDragEnd, spDragOver, spDragLeave, spDrop,
           uploadImg, clearImg,
           toggleExportHelp, setExportKey, clearExportKey, runExport,
           setDesignTier, setDesignSectionTier,
           wipeArm, wipeExecute, tgTest };
})();
'use strict';

/* ════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════ */
DB_MOD.tryRestore();

/* ── PWA: Service Worker registration ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — show a subtle update nudge
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

/* ── Offline / online indicator ── */
function _setOffline(isOffline) {
  const bar = $('offlineBar');
  if (bar) bar.style.display = isOffline ? 'flex' : 'none';
}
window.addEventListener('offline', () => _setOffline(true));
window.addEventListener('online',  () => _setOffline(false));
_setOffline(!navigator.onLine);
