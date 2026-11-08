// Health check panel: plain-language warnings from graph.health (lib/health.mjs) — leaked keys,
// endpoints anyone can call, unused and oversized files — each with "Show on map" and a ready
// prompt to paste into Claude Code or Codex. Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  // an exported copy without Health leaves the button out: an empty list would read as "all clear"
  if (!SC || (SC.exported && !SC.graph.health)) return;
  const { h } = SC;
  const A = SC.agent || { name: 'Claude', app: 'Claude Code' };
  const issues = (SC.graph.health && SC.graph.health.issues) || [];
  // a blueprint (planned, not built) gets a design review of the plan instead of a code check
  const PLAN = !!SC.graph.meta.blueprint;
  const FIX = PLAN ? 'Résoudre' : 'Corriger';
  // French needs the article to agree: "de la revue" / "du bilan"
  const CHECK_OF = PLAN ? 'de la revue de conception' : 'du bilan de santé';
  const CHECK_IN = PLAN ? 'dans la revue de conception' : 'dans le bilan de santé';
  const ISSUES_URL = 'https://github.com/haydenschmitty/floorplan/issues/new';

  // ---------- "not a problem" ----------
  // Saved by serve.mjs to floorplan/health-dismissed.json (build folds it into graph.health.dismissed);
  // a map opened without the server keeps them in this browser. A dismissal covers the issue as it was: it
  // shows again if it gets more or less serious or finds something new in a file (counted per file, so an
  // edit higher up doesn't bring it back; the same rule as dismissalFor in lib/health.mjs).
  const SERVER = window.FLOORPLAN_SERVER;
  const STORE_KEY = 'health-dismissed:' + (SC.graph.meta.rootName || '');
  const built = (SC.graph.health && SC.graph.health.dismissed) || [];
  let dismissed = SC.exported || SERVER ? built : SC.store.get(STORE_KEY, built);
  const locsOf = (issue) => (issue.locations || []).map((l) => `${l.file}:${l.line}`);
  const dismissalOf = (issue) => {
    const d = dismissed.find((x) => x.id === issue.id);
    if (!d || (d.severity && d.severity !== issue.severity)) return null;
    const left = new Map();
    for (const loc of d.locations || []) { const f = String(loc).replace(/:[^:]*$/, ''); left.set(f, (left.get(f) || 0) + 1); }
    for (const l of issue.locations || []) { const n = left.get(l.file) || 0; if (!n) return null; left.set(l.file, n - 1); }
    return d;
  };
  const canDismiss = !SC.exported;
  async function saveDismissal(issue, reason) {
    const rec = { id: issue.id, severity: issue.severity, locations: locsOf(issue), ...(reason ? { reason } : {}) };
    if (SERVER) {
      const r = await fetch('/api/health/dismissed', { method: 'POST', headers: { 'content-type': 'application/json', 'x-floorplan-token': SERVER.token }, body: JSON.stringify(rec) }).then((x) => x.json()).catch(() => null);
      if (!r) { SC.toast('Impossible de joindre le serveur de la carte : rien n’a été enregistré.'); return false; }
      dismissed = r.dismissed;
    } else {
      dismissed = [...dismissed.filter((x) => x.id !== issue.id), { ...rec, at: new Date().toISOString() }];
      SC.store.set(STORE_KEY, dismissed);
    }
    return true;
  }
  async function undoDismissal(issue) {
    if (SERVER) {
      const r = await fetch('/api/health/dismissed', { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-floorplan-token': SERVER.token }, body: JSON.stringify({ id: issue.id }) }).then((x) => x.json()).catch(() => null);
      if (!r) { SC.toast('Impossible de joindre le serveur de la carte.'); return; }
      dismissed = r.dismissed;
    } else {
      dismissed = dismissed.filter((x) => x.id !== issue.id);
      SC.store.set(STORE_KEY, dismissed);
    }
    refresh();
  }

  const SEV = {
    high: { color: 'var(--sev-high)', group: 'À corriger en premier', word: (n) => n > 1 ? 'importants' : 'important' },
    medium: { color: 'var(--sev-medium)', group: 'À corriger bientôt', word: () => 'à corriger' },
    low: { color: 'var(--sev-low)', group: 'À ranger à l’occasion', word: (n) => n > 1 ? 'mineurs' : 'mineur' },
  };
  const ORDER = ['high', 'medium', 'low'];
  const active = () => issues.filter((i) => !dismissalOf(i));
  const count = (sev) => active().filter((i) => i.severity === sev).length;
  const urgent = () => count('high') + count('medium');

  SC.icons.health = '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>';
  SC.icons.check = '<path d="m5 12.5 4.5 4.5L19 7.5"/>';

  const style = document.createElement('style');
  style.textContent = `
    .hc-issue { padding: 12px 14px; border-radius: 16px; background: rgba(var(--ink), .04); margin-bottom: 8px; }
    .hc-issue:last-child { margin-bottom: 0; }
    .hc-issue.off { background: none; box-shadow: inset 0 0 0 1px rgba(var(--ink), .08); }
    .hc-issue.off .hc-t { color: var(--text-2); }
    .hc-t { display: flex; gap: 9px; align-items: flex-start; font-weight: 500; line-height: 1.4; }
    .hc-t .dot { margin-top: 6px; }
    .hc-d { color: var(--text-2); font-size: 12.5px; line-height: 1.55; margin: 6px 0 0 17px; }
    .hc-n { color: var(--text-3); font-size: 12.5px; line-height: 1.45; margin: 4px 0 0 17px; }
    .hc-w { font-family: var(--mono); font-size: 11px; color: var(--text-3); margin: 6px 0 0 17px; word-break: break-all; line-height: 1.5; }
    .hc-a { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 0 17px; }
    .hc-a .btn { height: 30px; padding: 0 12px; font-size: 12.5px; gap: 6px; }
    .hc-a .btn svg.i { width: 14px; height: 14px; }
    .hc-calm { margin-top: 14px; padding: 11px 13px; border-radius: 14px; background: var(--ok-bg); color: var(--ok-text); font-size: 13px; line-height: 1.55; }
    .hc-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 12px; font-size: 12px; color: var(--text-2); }
    .hc-sub span { display: inline-flex; align-items: center; gap: 6px; }
    #btn-health .badge { background: var(--hc-badge, var(--on)); color: var(--hc-badge-text, var(--on-text)); }
    #btn-health.calm svg.i { color: var(--ok); }
    #modal .hc-hint { margin: 0; }
    #modal .hc-hint b { color: var(--text); font-weight: 500; }
    #modal .hc-why { width: 100%; min-height: 72px; resize: vertical; margin-top: 12px; background: rgba(var(--ink), .05); border: 0; border-radius: 14px; padding: 11px 13px; color: var(--text); outline: none; font: inherit; font-size: 13px; line-height: 1.5; box-sizing: border-box; }
    #modal .hc-why:focus { background: rgba(var(--ink), .07); box-shadow: 0 0 0 1px rgba(var(--ink), .14); }
    #modal .hc-rep { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; font-size: 13px; line-height: 1.5; color: var(--text-2); cursor: pointer; }
    #modal .hc-rep input { margin-top: 3px; }
    #modal .hc-prev { margin-top: 8px; display: none; }
    #modal .hc-prev.on { display: block; }
  `;
  document.head.appendChild(style);

  // ---------- actions ----------
  let isOpen = false, openedAt = null;
  const where = () => JSON.stringify([SC.state.selected, SC.state.container]);
  function closeList() { isOpen = false; SC.closePanel(); }
  function showOnMap(issue) {
    const items = (issue.items || []).filter((id) => SC.exists(id)).map((id) => ({ id, note: (issue.notes && issue.notes[id]) || '' }));
    if (!items.length) { SC.toast(`Ce point n’est pas sur la carte. Utilisez plutôt « ${FIX} avec ${A.name} ».`); return; }
    if (isOpen) closeList();
    SC.showBoard({ title: issue.title, question: issue.detail, items });
  }
  // a served blueprint settles review items on the map: the request goes into the Ask bar's Change mode,
  // for the person to finish (an open question needs their answer) or edit, then send
  const here = (issue) => PLAN && !!issue.change && !!SC.canChange?.();
  function resolveHere(issue) {
    if (isOpen) closeList();
    if (!SC.draftChange(issue.change)) { fixWith(issue); return; }
    SC.toast(issue.kind === 'question' ? 'Tapez votre réponse, puis appuyez sur Entrée' : 'Modifiez la demande si besoin, puis appuyez sur Entrée');
  }
  function fixWith(issue) {
    SC.modal({
      title: `${FIX} avec ${A.name}`,
      html: `<p class="hc-hint">Copiez cette demande et collez-la dans <b>${A.app}</b>, ouvert dans le dossier de votre projet. Elle explique quoi modifier et demande votre accord avant toute action risquée.</p><pre>${h(issue.fix)}</pre>`,
      actions: [{ label: 'Copier la demande', primary: true, icon: 'copy', onClick: () => { SC.copy(issue.fix); SC.toast(`Copié. Collez la demande dans ${A.app}.`); } }],
    });
  }
  // The report is a GitHub issue the person reads and sends themselves: which check fired, its title (which
  // can name a file or endpoint), the kinds of files involved and their note. Never code, values or the fix prompt.
  const reportText = (issue, reason) => [
    `**Check:** ${issue.kind} (${issue.severity})`,
    `**What Floorplan said:** ${issue.title}`,
    `**File types:** ${[...new Set((issue.locations || []).map((l) => (/\.[^./]+$/.exec(l.file) || [l.file.split('/').pop()])[0]))].slice(0, 6).join(', ') || 'none'}`,
    ``,
    `**Why it's not a problem:**`,
    reason.slice(0, 1500) || '_(no note)_',
  ].join('\n');
  function notAProblem(issue) {
    const m = SC.modal({
      title: 'Pas un problème ?',
      html: `<p class="hc-hint">Marquez « ${h(issue.title)} » comme fausse alerte : il passe en bas ${CHECK_OF} et sort du décompte. Il revient si ce contrôle trouve du nouveau à cet endroit.</p>
        <textarea class="hc-why" placeholder="Pourquoi ? (facultatif) Par exemple : cette valeur est un hachage bcrypt, pas le mot de passe" spellcheck="true"></textarea>
        <label class="hc-rep"><input type="checkbox" class="hc-rep-on"><span>Prévenir aussi le développeur de Floorplan, pour améliorer ce contrôle. Cela ouvre un ticket GitHub, en anglais, que vous pouvez lire et modifier avant de l’envoyer. Il contient seulement ce qui est affiché ci-dessous, jamais votre code ni aucune valeur.</span></label>
        <pre class="hc-prev"></pre>`,
      actions: [{ label: 'Marquer « Pas un problème »', primary: true, icon: 'check', keepOpen: true, onClick: async (close) => {
        const reason = m.el.querySelector('.hc-why').value.trim();
        const report = m.el.querySelector('.hc-rep-on').checked;
        if (report) window.open(`${ISSUES_URL}?title=${encodeURIComponent(`False positive: ${issue.kind}`)}&body=${encodeURIComponent(reportText(issue, reason))}`, '_blank', 'noopener');
        if (!(await saveDismissal(issue, reason))) return;
        close();
        refresh();
        SC.toast(report ? 'Marqué « Pas un problème ». Merci pour le signalement.' : 'Marqué « Pas un problème ».');
      } }],
    });
    const why = m.el.querySelector('.hc-why'), on = m.el.querySelector('.hc-rep-on'), prev = m.el.querySelector('.hc-prev');
    const sync = () => { prev.classList.toggle('on', on.checked); prev.textContent = reportText(issue, why.value.trim()); };
    why.addEventListener('input', sync); on.addEventListener('change', sync);
    why.focus();
  }
  const onMap = (issue) => (issue.items || []).some((id) => SC.exists(id));

  // ---------- html ----------
  const locText = (issue) => {
    const locs = issue.locations || [];
    if (!SC.technical() || !locs.length) return '';
    const shown = locs.slice(0, 3).map((l) => `${l.file}${l.line > 1 ? ':' + l.line : ''}`);
    return `<div class="hc-w">${shown.map(h).join('<br>')}${locs.length > 3 ? `<br>+${locs.length - 3} autre${locs.length - 3 > 1 ? 's' : ''}` : ''}</div>`;
  };
  const issueHtml = (issue, idx, note) => {
    const d = dismissalOf(issue);
    if (d) return `<div class="hc-issue off">
        <div class="hc-t"><span class="dot" style="background:rgba(var(--ink),.2)"></span><span>${h(issue.title)}</span></div>
        <div class="hc-n">Marqué « Pas un problème »${d.reason ? `: ${h(d.reason)}` : ''}</div>
        ${canDismiss ? `<div class="hc-a"><button class="btn soft" data-hc-undo="${idx}">Réafficher</button></div>` : ''}
      </div>`;
    return `<div class="hc-issue">
      <div class="hc-t"><span class="dot" style="background:${SEV[issue.severity].color}"></span><span>${h(issue.title)}</span></div>
      ${note ? `<div class="hc-n">${h(note)}</div>` : `<div class="hc-d">${h(issue.detail)}</div>`}
      ${locText(issue)}
      <div class="hc-a">
        ${onMap(issue) ? `<button class="btn soft" data-hc-show="${idx}">${SC.iconI('search')}Voir sur la carte</button>` : ''}
        ${SC.exported ? '' : here(issue) ? `<button class="btn soft" data-hc-here="${idx}">${SC.iconI('spark')}Résoudre sur la carte</button>` : `<button class="btn soft" data-hc-fix="${idx}">${SC.iconI('spark')}${FIX} avec ${A.name}</button>`}
        ${canDismiss ? `<button class="btn soft" data-hc-dismiss="${idx}">${SC.iconI('check')}Pas un problème</button>` : ''}
      </div>
    </div>`;
  };
  const bindIssues = (el) => {
    const on = (attr, fn) => el.querySelectorAll(`[data-hc-${attr}]`).forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(issues[+b.getAttribute(`data-hc-${attr}`)]); }));
    on('show', showOnMap); on('fix', fixWith); on('here', resolveHere); on('dismiss', notAProblem); on('undo', undoDismissal);
  };
  const headline = () => urgent() ? `${SC.plural(urgent(), 'point')} ${urgent() === 1 ? 'demande' : 'demandent'} votre attention` : active().length ? 'Rien d’urgent' : 'Aucun problème trouvé';
  const breakdown = () => `<div class="hc-sub">${ORDER.filter(count).map((s) => `<span><i class="dot" style="background:${SEV[s].color}"></i>${count(s)} ${SEV[s].word(count(s))}</span>`).join('')}</div>`;
  const headColor = () => urgent() ? SEV[count('high') ? 'high' : 'medium'].color : 'var(--ok)';

  function listHtml() {
    const live = active(), off = issues.filter(dismissalOf);
    const top = `<div class="sec">
        <div class="ph"><span class="ico" style="--c:${headColor()}">${SC.icon('health')}</span><span class="kindlabel">${PLAN ? 'Revue de conception' : 'Bilan de santé'}</span></div>
        <h2 class="pt">${h(headline())}</h2>
        <p class="pd">${PLAN ? 'Nous avons cherché dans le plan les parties que n’importe qui sur internet pourrait utiliser, les décisions que le PRD laisse ouvertes et les éléments reliés à rien. Les régler maintenant coûte moins cher qu’après la construction.' : 'Nous avons cherché les clés laissées dans le code ou envoyées au navigateur, les données et les parties de votre application que n’importe qui sur internet peut atteindre (tables Supabase, règles Firebase, webhooks Stripe, points d’accès), les fichiers inutilisés et les fichiers trop gros pour être modifiés sans risque. C’est un contrôle rapide, pas un audit de sécurité.'}</p>
        ${live.length ? breakdown() : `<div class="hc-calm">${off.length ? `Plus rien à examiner : vous avez marqué ${SC.plural(off.length, 'élément')} « Pas un problème ».` : `Rien de notable.`} C’est un contrôle automatique rapide, pas une revue ${PLAN ? 'de conception' : 'de sécurité'} complète.</div>`}
        <div class="actions"><button class="btn soft" data-hc-back>${SC.iconI('left')}Précédent</button></div>
      </div>`;
    const groups = ORDER.map((sev) => {
      const list = issues.map((i, idx) => [i, idx]).filter(([i]) => i.severity === sev && !dismissalOf(i));
      return list.length ? `<div class="sec"><h3>${h(SEV[sev].group)} <span class="c">${list.length}</span></h3>${list.map(([i, idx]) => issueHtml(i, idx)).join('')}</div>` : '';
    }).join('');
    const offHtml = off.length ? `<div class="sec"><h3>Marqués « Pas un problème » <span class="c">${off.length}</span></h3>${issues.map((i, idx) => [i, idx]).filter(([i]) => dismissalOf(i)).map(([i, idx]) => issueHtml(i, idx)).join('')}</div>` : '';
    const foot = !live.length ? '' : SC.exported ? `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">Ce sont des indications automatiques, datant de l’export de cette copie.</div>` : `<div class="sec" style="color:var(--text-3);font-size:12px;line-height:1.6">Ce sont des indications automatiques. ${live.some(here)
      ? `« Résoudre sur la carte » place une demande dans la barre Demander, en mode Modifier : complétez-la ou ajustez-la, appuyez sur Entrée, et ${A.name} met à jour le plan puis redessine la carte. « Annuler » remet tout comme avant.`
      : `« ${FIX} avec ${A.name} » vous donne une demande à coller dans ${A.app}. ${PLAN ? 'Elle explique le choix et met à jour le plan une fois que vous avez décidé.' : 'Elle vérifie le code avant de modifier quoi que ce soit.'}`} Si une indication est fausse, « Pas un problème » la met de côté.</div>`;
    return top + groups + offHtml + foot;
  }
  function openList() {
    isOpen = true;
    openedAt = where();
    SC.showPanel(listHtml(), (panel) => {
      panel.querySelector('[data-hc-back]')?.addEventListener('click', closeList);
      bindIssues(panel);
    });
  }

  // ---------- chrome ----------
  const btn = SC.addHeaderButton({
    id: 'btn-health', label: PLAN ? 'Revue de conception' : 'Bilan de santé', icon: 'health',
    onClick: () => (isOpen ? closeList() : openList()),
  });
  const badge = document.createElement('span');
  badge.className = 'badge';
  function updateButton() {
    const n = urgent();
    btn.title = `${PLAN ? 'Revue de conception' : 'Bilan de santé'} : ${n ? headline() : 'rien d’urgent'}`;
    btn.querySelector('svg.i').innerHTML = SC.icons[n ? 'health' : 'check'];
    if (n) {
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.style.setProperty('--hc-badge', count('high') ? SEV.high.color : SEV.medium.color);
      btn.style.setProperty('--hc-badge-text', 'var(--on-sev-text)');
      btn.appendChild(badge);
    } else badge.remove();
    btn.classList.toggle('calm', !n);
    btn.setAttribute('aria-label', btn.title); // keeps its name, with the count, when only the icon shows
  }
  function refresh() {
    updateButton();
    if (isOpen) openList(); else SC.refreshPanel();
  }
  updateButton();
  // the server's list is the saved one: it may have changed since this map was built
  if (SERVER && canDismiss) fetch('/api/health/dismissed', { headers: { 'x-floorplan-token': SERVER.token } }).then((r) => r.json()).then((r) => { if (Array.isArray(r.dismissed)) { dismissed = r.dismissed; refresh(); } }).catch(() => {});

  // Selecting something else on the map while the list is open shows that item instead.
  SC.on('panel', () => { if (isOpen && openedAt && where() !== openedAt) { isOpen = false; SC.closePanel(); } });

  SC.addPanelSection('overview', () => ({
    html: `<div class="sec"><h3>${PLAN ? 'Revue de conception' : 'Bilan de santé'}</h3><div class="list"><a class="row" data-hc-open>
        <span class="dot" style="background:${headColor()}"></span>
        <span class="rt"><div class="rn">${h(headline())}</div><div class="rd">${active().length ? ORDER.filter(count).map((s) => `${count(s)} ${SEV[s].word(count(s))}`).join(' · ') : PLAN ? 'Contrôle automatique rapide du plan' : 'Contrôle automatique rapide des secrets, des points d’accès ouverts et des fichiers inutilisés'}</div></span>
        <span class="rc">${SC.iconI('right')}</span></a></div></div>`,
    bind: (el) => el.querySelector('[data-hc-open]')?.addEventListener('click', (ev) => { ev.preventDefault(); openList(); }),
  }));

  SC.addPanelSection('item', (itemId) => {
    if (!itemId || typeof itemId !== 'string' || !issues.length) return '';
    const hits = [];
    issues.forEach((issue, idx) => {
      if (dismissalOf(issue)) return;
      const inside = (issue.items || []).filter((id) => id === itemId || (SC.exists(id) && SC.chain(id).includes(itemId)));
      if (!inside.length) return;
      const exact = issue.notes && inside.includes(itemId) ? issue.notes[itemId] : '';
      hits.push(issueHtml(issue, idx, exact || (inside.length > 1 || inside[0] !== itemId ? `Concerne ${SC.plural(inside.length, 'endroit')} ici` : '')));
    });
    if (!hits.length) return '';
    return { html: `<div class="sec"><h3>${PLAN ? 'Revue de conception' : 'Bilan de santé'} <span class="c">${hits.length}</span></h3>${hits.slice(0, 6).join('')}${hits.length > 6 ? `<div class="more" data-hc-open style="cursor:pointer">+${hits.length - 6} autre${hits.length - 6 > 1 ? 's' : ''} ${CHECK_IN}</div>` : ''}</div>`, bind: (el) => { bindIssues(el); el.querySelector('[data-hc-open]')?.addEventListener('click', openList); } };
  });
})();
