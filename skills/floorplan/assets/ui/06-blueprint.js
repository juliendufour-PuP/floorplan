// Blueprints: a map planned from a PRD or a description, before any code exists (graph.meta.blueprint,
// from scripts/plan.mjs). Cards get a dashed outline and the project name a "Blueprint" pill, the
// overview says what it was planned from, and every planned part offers "Build this with Claude": a
// ready prompt to build just that part, following the plan. Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  const BP = SC && SC.graph.meta.blueprint;
  if (!BP) return;
  const { h } = SC;
  const Cap = (t) => t[0].toUpperCase() + t.slice(1);
  const A = SC.agent || { name: 'Claude', app: 'Claude Code' };
  const G = SC.graph;

  document.documentElement.classList.add('blueprint');
  const style = document.createElement('style');
  style.textContent = `
    /* planned, not built: a dashed outline on every card */
    html.blueprint .card:not(.connector)::after { content: ""; position: absolute; inset: 0; border-radius: inherit; border: 2.5px dashed rgba(var(--ink), .32); pointer-events: none; }
    .bp-pill { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; margin-left: 8px; border-radius: 999px; font-size: 11px; font-weight: 500; letter-spacing: .02em; color: var(--text-2); border: 1px dashed rgba(var(--ink), .35); flex: none; }
    .bp-list { margin: 8px 0 0; padding-left: 18px; color: var(--text-2); font-size: 13px; line-height: 1.55; }
    .bp-list li + li { margin-top: 4px; }
  `;
  document.head.appendChild(style);

  // a "Blueprint" pill beside the board's title, which is redrawn on every move
  const addPill = () => {
    const k = document.querySelector('#context .k');
    if (!k || k.querySelector('.bp-pill')) return;
    k.insertAdjacentHTML('beforeend', '<span class="bp-pill" title="Prévu, pas encore construit : chaque carte est une partie dont le système aurait besoin.">Plan</span>');
  };
  SC.on('render', addPill);
  SC.on('ready', addPill);

  const ACCESS = { public: 'tout le monde', 'signed-in': 'les utilisateurs connectés', team: 'seulement l’équipe qui gère le service', webhook: 'le service qui l’envoie, qui doit prouver son identité', internal: 'seulement nos propres services' };
  /** "for signed-in users: managers of that location", or the open question when nobody decided. */
  const whoMay = (r) => !r.access ? 'qui peut l’utiliser n’est pas encore décidé : demandez-moi'
    : `pour ${r.access === 'signed-in' && r.who ? r.who : ACCESS[r.access] || r.access}${r.publicBecause ? `, parce que ${r.publicBecause.replace(/\.$/, '')}` : ''}`;

  SC.addPanelSection('overview', () => ({
    html: `<div class="sec"><h3>Plan prévisionnel</h3>
      <p class="pd">Prévu${BP.source ? ` à partir de <b>${h(BP.source)}</b>` : ''}, pas encore construit. Chaque carte en pointillés est une partie dont le système aurait besoin.${SC.exported ? '' : ` Choisissez-en une, puis <b>Construire avec ${h(A.name)}</b> pour la lancer.`}</p>
      ${BP.stack?.length ? `<div class="tags" style="margin-top:10px">${BP.stack.map((s) => `<span class="tag">${h(s)}</span>`).join('')}</div>` : ''}
      ${BP.assumptions?.length ? `<h3 style="margin-top:14px">Hypothèses</h3><ul class="bp-list">${BP.assumptions.map((a) => `<li>${h(a)}</li>`).join('')}</ul>` : ''}
    </div>`,
  }));

  /** The planned files inside an item (a part, a folder or one file). */
  const filesIn = (id) => G.files.filter((f) => id === 'f:' + f.p || SC.chain('f:' + f.p).includes(id));
  function buildPrompt(id) {
    const i = SC.info(id);
    const fl = filesIn(id);
    const paths = new Set(fl.map((f) => 'f:' + f.p));
    const eps = SC.routes.filter((r) => paths.has('f:' + r.f));
    const deps = new Map();
    for (const l of G.links) {
      if (!paths.has(l.a) || paths.has(l.b)) continue;
      const o = SC.info(l.b);
      if (o) deps.set(l.b, `${o.name}${l.b.startsWith('f:') ? ` (${l.b.slice(2)})` : ''}`);
    }
    // open questions from the PRD that touch this part
    const inside = (x) => x === id || paths.has(x) || (x.startsWith('r:') && paths.has('f:' + SC.routes[+x.slice(2)]?.f)) || (SC.exists(x) && SC.chain(x).includes(id));
    const questions = (G.health?.issues || []).filter((q) => q.kind === 'question' && (q.items || []).some(inside)).map((q) => q.title);
    return [
      `Construisez « ${i.name} » à partir du plan prévisionnel de ${G.project.name} : floorplan/plan.json et floorplan/architecture.json${BP.source ? `, prévu à partir de ${BP.source}` : ''}.`,
      i.desc ? `\nÀ quoi ça sert : ${i.desc}` : '',
      BP.stack?.length ? `\nTechnologies : ${BP.stack.join(' ; ')}.` : '',
      `\nFichiers à créer :`,
      ...fl.map((f) => `- ${f.p}: ${f.name}${f.d ? `. ${f.d}` : ''}`),
      eps.length ? `\nPoints d’accès à créer (gardez la méthode, le chemin et qui peut les utiliser exactement comme prévu) :` : '',
      ...eps.map((r) => `- ${r.m} ${r.p} (${whoMay(r)}): ${r.name}${r.d ? `. ${r.d}` : ''}`),
      deps.size ? `\nCela dépend de : ${[...deps.values()].join(' ; ')}.` : '',
      questions.length ? `\nPas encore décidé (demandez-moi avant de construire ce qui en dépend) :\n${questions.map((q) => `- ${q}`).join('\n')}` : '',
      `\nAvant d’écrire du code, lisez ces parties de plan.json et vérifiez lesquelles de ses dépendances existent déjà. S’il en manque, dites-le-moi et proposez ce qu’il faut construire d’abord. Gardez les chemins et les noms de fichiers du plan. Si le plan vous semble faux ou incomplet pour cette partie, dites-le-moi avant de le modifier. Une fois terminé, lancez-le ou lancez ses tests, et expliquez-moi comment l’essayer. Répondez-moi en français.`,
    ].filter((x) => x !== '').join('\n');
  }

  SC.addPanelSection('item', (id) => {
    if (!id || typeof id !== 'string') return '';
    // an endpoint: who the plan lets use it
    if (id.startsWith('r:')) {
      const r = SC.routes[+id.slice(2)];
      if (!r) return '';
      const text = !r.access ? `Pas encore décidé.${SC.graph.health ? ' La revue de conception le signale.' : ''}` : `${Cap(r.access === 'signed-in' && r.who ? r.who : ACCESS[r.access] || r.access)}.${r.publicBecause ? ` Ouvert volontairement : ${r.publicBecause}` : ''}`;
      return `<div class="sec"><h3>Qui peut l’utiliser</h3><p class="pd">${h(text)}</p></div>`;
    }
    const i = SC.info(id);
    if (SC.exported || !i || (i.type === 'node' && i.n.kind === 'external') || !filesIn(id).length) return '';
    return {
      html: `<div class="sec"><h3>Construire</h3><p class="pd">Une demande prête pour ${h(A.app)}, afin de construire ${i.type === 'file' ? 'ce fichier' : 'cette partie'} comme le décrit le plan.</p>
        <div class="actions"><button class="btn soft" data-bp-build>${SC.iconI('spark')}Construire avec ${h(A.name)}</button></div></div>`,
      bind: (el) => el.querySelector('[data-bp-build]')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const prompt = buildPrompt(id);
        SC.modal({
          title: `Construire avec ${A.name}`,
          html: `<p class="hc-hint">Copiez cette demande et collez-la dans <b>${h(A.app)}</b>, ouvert dans le dossier de votre projet.</p><pre>${h(prompt)}</pre>`,
          actions: [{ label: 'Copier la demande', primary: true, icon: 'copy', onClick: () => { SC.copy(prompt); SC.toast(`Copié. Collez la demande dans ${A.app}.`); } }],
        });
      }),
    };
  });
})();
