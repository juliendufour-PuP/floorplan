// floorplan glossary: explains the technical words a non-developer meets on the map.
// The first time a known term appears in a description (details panel, board title area), it gets a
// dotted underline; hovering or focusing it shows a one-sentence explanation. Off while
// "Show technical detail" is on. Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  if (!SC) return;

  // [display name, plain explanation, aliases...]. Aliases are matched as whole words, ignoring case,
  // except those marked with a leading "=" (matched exactly, so "REST" doesn't fire on "the rest").
  // The English aliases stay (code, file names and older descriptions are in English); the French ones
  // catch the same terms in French descriptions.
  const TERMS = [
    ['API', 'La façon dont des programmes se parlent : l’un demande quelque chose (des prix, une commande) et l’autre répond.', 'API', 'APIs', 'API client'],
    ['Point d’accès', 'Une requête précise que l’application sait recevoir, comme « marquer cette commande comme expédiée ». Chacune a sa propre adresse web.', 'endpoint', 'endpoints', 'point d’accès', 'points d’accès', 'point d\'accès', 'points d\'accès'],
    ['Webhook', 'Un message qu’un autre service envoie automatiquement à votre application quand quelque chose s’y passe, comme « un paiement est passé ».', 'webhook', 'webhooks'],
    ['Serveur', 'Un ordinateur dans le cloud qui fait tourner le travail en coulisses de votre application et répond aux demandes des écrans.', 'server', 'servers', 'main server', 'serveur', 'serveurs', 'serveur principal'],
    ['Frontend', 'La partie de l’application que les gens voient et utilisent : les écrans, les boutons et les formulaires dans le navigateur.', 'frontend', 'front end', 'front-end'],
    ['Backend', 'La partie en coulisses de l’application, qui garde les données, applique les règles et parle aux autres services.', 'backend', 'back end', 'back-end'],
    ['Base de données', 'L’endroit où l’application garde ses données (produits, commandes, clients) pour que rien ne se perde quand elle redémarre.', 'database', 'databases', 'DB', 'base de données', 'bases de données', 'BDD'],
    ['Enregistrement', 'Une entrée sauvegardée dans la base de données, comme une commande ou un client. Une table est la liste de tous les enregistrements d’un même type.', 'database record', 'database records', 'database table', 'database tables', 'enregistrement', 'enregistrements'],
    ['Modèle', 'Dans le code, un modèle décrit comment un type d’enregistrement (une commande, un client) est rangé dans la base de données.', 'model', 'models', 'ORM', 'ORM model', 'ORM models', 'data model', 'modèle de données', 'modèles de données'],
    ['Requête de base de données', 'Une question que l’application pose à la base de données, comme « toutes les commandes du jour pas encore expédiées ».', 'query', 'queries', 'requête SQL', 'requêtes SQL'],
    ['File d’attente', 'Une liste de tâches en attente : le travail y est déposé puis traité un par un en arrière-plan, pour que rien ne se perde.', 'queue', 'queues', 'queued', 'outbox', 'message queue', 'file d’attente', 'files d’attente', 'file d\'attente', 'files d\'attente'],
    ['Tâche de fond', 'Une tâche qui tourne seule en coulisses, pour que personne n’ait à l’attendre à l’écran.', 'background job', 'background jobs', 'background task', 'background tasks', 'worker', 'workers', 'tâche de fond', 'tâches de fond', 'tâche en arrière-plan', 'tâches en arrière-plan'],
    ['Tâche planifiée', 'Une tâche qui se lance automatiquement selon un horaire, par exemple toutes les heures ou chaque nuit.', 'cron', 'cron job', 'cron jobs', 'scheduled job', 'scheduled jobs', 'scheduler', 'tâche planifiée', 'tâches planifiées'],
    ['Variable d’environnement', 'Un réglage gardé en dehors du code, comme la base de données ou le compte à utiliser, pour qu’il puisse différer entre le test et la production.', 'environment variable', 'environment variables', 'env var', 'env vars', '.env', 'variable d’environnement', 'variables d’environnement', 'variable d\'environnement', 'variables d\'environnement'],
    ['Secret', 'Un mot de passe ou une clé que l’application utilise pour se connecter à un autre service. Il ne doit jamais être partagé ni écrit dans le code.', 'secret', 'secrets', 'API key', 'API keys', 'credentials', 'clé API', 'clés API', 'clé d’API', 'clés d’API'],
    ['Déploiement', 'La mise en ligne d’une nouvelle version de l’application, pour que les gens commencent à l’utiliser.', 'deploy', 'deploys', 'deployed', 'deployment', 'deployments', 'déploiement', 'déploiements', 'déployer', 'déployé', 'déployée'],
    ['Migration', 'Un changement ponctuel de la façon dont les données sont rangées, comme l’ajout d’un nouveau champ à chaque commande.', 'migration', 'migrations'],
    ['Cache', 'Une copie gardée à portée de main pour charger plus vite, au lieu de tout recalculer.', 'cache', 'cached', 'caching', 'mise en cache'],
    ['Connexion', 'La vérification de l’identité de quelqu’un (souvent avec un mot de passe) avant de le laisser entrer.', 'auth', 'authentication', 'login', 'log in', 'sign-in', 'sign in', 'authentification'],
    ['Autorisations', 'Les règles qui disent qui a le droit de faire quoi, par exemple seuls les responsables peuvent rembourser.', 'permissions', 'authorization', 'roles', 'RBAC', 'autorisations', 'droits d’accès', 'droits d\'accès'],
    ['Session', 'La façon dont l’application se souvient que vous êtes connecté, pour ne pas redemander votre mot de passe à chaque écran.', 'session', 'sessions'],
    ['Jeton', 'Un laissez-passer numérique temporaire que l’application remet après la connexion et vérifie à chaque requête.', 'token', 'tokens', 'bearer token', 'access token', 'jeton', 'jetons', 'jeton d’accès', 'jeton d\'accès'],
    ['SDK', 'Un kit de code prêt à l’emploi qu’une entreprise fournit pour que les applications parlent plus facilement à son service.', 'SDK', 'SDKs'],
    ['Dépôt', 'Le dossier qui contient tout le code d’un projet et l’historique complet de ses modifications.', 'repository', 'repositories', 'repo', 'repos', 'dépôt', 'dépôts', 'dépôt Git'],
    ['Composant', 'Une brique réutilisable des écrans, comme un bouton, un tableau ou tout un éditeur de produit.', 'component', 'components', 'composant', 'composants'],
    ['Route', 'Une adresse web à laquelle l’application répond : côté écrans c’est une page, côté serveur c’est un type de requête.', 'route', 'routes', 'routing', 'App Router', 'routage'],
    ['Requête', 'Un message qui demande au serveur de faire ou de chercher quelque chose. Le serveur renvoie une réponse avec le résultat.', 'request', 'requests', 'response', 'responses', 'requête', 'requêtes', 'requête web', 'requêtes web'],
    ['JSON', 'Un format texte simple que les programmes utilisent pour s’échanger des données, comme une liste étiquetée.', 'JSON'],
    ['REST', 'Une façon courante de construire des API, où chaque adresse web représente un type de chose (commandes, produits).', '=REST', '=RESTful'],
    ['Méthode HTTP', 'Le type de requête : GET lit quelque chose, POST crée, PUT ou PATCH modifie, DELETE supprime.', 'HTTP method', 'HTTP methods', '=GET', '=POST', '=PUT', '=PATCH', '=DELETE', 'méthode HTTP', 'méthodes HTTP'],
    ['HTTP', 'Le langage que les navigateurs et les serveurs utilisent pour se parler sur le web. HTTPS en est la version chiffrée.', 'HTTP', 'HTTPS'],
    ['CDN', 'Un réseau de serveurs répartis dans le monde qui livre vite images et fichiers depuis un point proche du visiteur.', 'CDN', 'CDNs'],
    ['Espace de stockage', 'Un stockage de fichiers dans le cloud, pour les images de produits, les fichiers envoyés ou les exports.', 'storage bucket', 'bucket', 'buckets', 'S3', 'GCS', 'Cloud Storage'],
    ['Pub/Sub', 'Le service de messages de Google : une partie de l’application publie un événement et d’autres le récupèrent pour le traiter en arrière-plan.', 'Pub/Sub', 'PubSub'],
    ['MCP', 'Une façon standard de connecter des assistants IA (comme Claude ou ChatGPT) à une application, pour qu’ils puissent y chercher des informations.', 'MCP', 'MCP server', 'Model Context Protocol', 'serveur MCP'],
    ['Next.js', 'Une boîte à outils très utilisée pour construire des sites et des applications web avec React.', 'Next.js', 'NextJS'],
    ['React', 'Une bibliothèque très utilisée pour construire des écrans interactifs à partir de pièces réutilisables.', '=React'],
    ['Flask', 'Une boîte à outils Python pour construire des serveurs web.', 'Flask'],
    ['SQLAlchemy', 'Une boîte à outils Python qui permet au code de lire et d’enregistrer des données sans écrire de commandes brutes pour la base.', 'SQLAlchemy'],
    ['Postgres', 'Une base de données très répandue. RDS et Cloud SQL en sont les versions hébergées par Amazon et Google.', 'Postgres', 'PostgreSQL', 'RDS', 'Cloud SQL'],
    ['Docker', 'Une façon d’emballer une application avec tout ce dont elle a besoin, pour qu’elle tourne pareil sur n’importe quel ordinateur ou cloud.', 'Docker', 'container', 'containers', 'conteneur', 'conteneurs'],
    ['Cloud Run', 'Le service de Google qui fait tourner les serveurs et les tâches de fond d’une application dans le cloud, sans gérer de machines.', 'Cloud Run'],
    ['Middleware', 'Un contrôle par lequel passe chaque requête à son arrivée, comme « cette personne est-elle connectée ? ».', 'middleware'],
    ['Blueprint', 'Dans Flask, un groupe de requêtes liées réunies ensemble, comme toutes les requêtes sur les commandes.', 'blueprint', 'blueprints'],
    ['Tests', 'Des vérifications automatiques que le code fait toujours ce qu’il doit, lancées avant chaque mise en ligne.', 'test suite', 'unit test', 'unit tests', 'pytest', 'Vitest', 'test unitaire', 'tests unitaires', 'suite de tests'],
    ['Script', 'Un petit programme lancé à la main pour une tâche ponctuelle, comme corriger ou importer des données.', 'script', 'scripts'],
    ['OAuth', 'La norme derrière les boutons « Se connecter avec… » : elle permet à une application d’en utiliser une autre en votre nom sans partager votre mot de passe.', 'OAuth'],
  ];

  const exact = new Map(), loose = new Map(), alts = [];
  TERMS.forEach(([name, text, ...aliases], i) => {
    for (let a of aliases) {
      const strict = a.startsWith('=');
      if (strict) a = a.slice(1);
      (strict ? exact : loose).set(strict ? a : a.toLowerCase(), i);
      alts.push(a);
    }
  });
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  alts.sort((a, b) => b.length - a.length);
  // accented letters count as word characters, so "cache" doesn't fire inside the French "caché"
  const RE = new RegExp(`(?<![\\p{L}\\p{N}_./-])(?:${alts.map(esc).join('|')})(?![\\p{L}\\p{N}_/]|-[\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}_])`, 'giu');
  const termOf = (m) => exact.has(m) ? exact.get(m) : loose.has(m.toLowerCase()) ? loose.get(m.toLowerCase()) : -1;

  // Where to look, and what to leave alone.
  const TARGETS = '.pd, .rd, .callout';
  const SKIP = 'a[href], button, code, pre, kbd, samp, input, textarea, select, [contenteditable], .tag, .rp, .pp, .method, .kbd, .sc-term, [data-noglossary]';
  const CLICKABLE = 'a, [data-go], [data-sel], [data-flow], [data-open], [role="button"]';
  const isMono = (el) => /mono|monospace/i.test(el.style?.fontFamily || '');

  function annotate(scope, targets) {
    if (!scope || SC.technical()) return;
    const used = new Set([...scope.querySelectorAll('.sc-term')].map((s) => +s.dataset.term)); // max one per term per scope
    const skipped = (from, stop) => { for (let p = from; p && p !== stop; p = p.parentElement) if (p.matches(SKIP) || isMono(p)) return true; return false; };
    for (const el of targets) {
      if (skipped(el, scope)) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (t) => !t.nodeValue.trim() || skipped(t.parentElement, el) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      for (const t of texts) wrapIn(t, used);
    }
  }
  function wrapIn(textNode, used) {
    let node = textNode;
    while (node) {
      RE.lastIndex = 0;
      let m, hit = null;
      while ((m = RE.exec(node.nodeValue))) {
        const i = termOf(m[0]);
        if (i >= 0 && !used.has(i)) { hit = { m, i }; break; }
      }
      if (!hit) return;
      used.add(hit.i);
      const word = node.splitText(hit.m.index);
      const rest = word.splitText(hit.m[0].length);
      const span = document.createElement('span');
      span.className = 'sc-term';
      span.dataset.term = String(hit.i);
      if (!word.parentElement.closest(CLICKABLE)) span.tabIndex = 0; // inside clickable rows: hover only, clicks pass through
      word.replaceWith(span);
      span.appendChild(word);
      node = rest;
    }
  }
  function strip(scope) {
    if (!scope) return;
    for (const s of scope.querySelectorAll('.sc-term')) s.replaceWith(...s.childNodes);
    scope.normalize();
  }

  const panelEl = () => document.getElementById('panel');
  const contextEl = () => document.getElementById('context');
  const doPanel = () => { const p = panelEl(); if (p) annotate(p, p.querySelectorAll(TARGETS)); };
  const doContext = () => { const c = contextEl(); if (c) annotate(c, c.querySelectorAll('p, .callout')); };

  // Run after the viewer and any other extension listeners have finished filling the DOM.
  SC.on('panel', () => { hide(true); queueMicrotask(doPanel); });
  SC.on('render', () => { hide(true); queueMicrotask(doContext); });
  SC.on('technical', (on) => {
    hide(true);
    if (on) { strip(panelEl()); strip(contextEl()); }
    else { queueMicrotask(() => { strip(panelEl()); strip(contextEl()); doPanel(); doContext(); }); }
  });

  // ---------- popover ----------
  const style = document.createElement('style');
  style.textContent = `
.sc-term { pointer-events: auto; cursor: help; border-radius: 4px; text-decoration-line: underline; text-decoration-style: dotted; text-decoration-thickness: 1px; text-underline-offset: 3px;
  text-decoration-color: rgba(var(--ink), .32); text-decoration-color: color-mix(in srgb, currentColor 45%, transparent); transition: text-decoration-color .2s var(--ease), color .2s var(--ease); }
.sc-term:hover, .sc-term.on { text-decoration-color: currentColor; color: var(--text); }
.callout .sc-term:hover, .callout .sc-term.on { color: inherit; }
.sc-term:focus { outline: none; }
.sc-term:focus-visible { box-shadow: 0 0 0 2px var(--focus); }
#sc-gloss { position: fixed; left: 0; top: 0; z-index: 55; max-width: 280px; padding: 11px 13px; border-radius: 14px; font-size: 12.5px; line-height: 1.5; color: var(--text-2);
  pointer-events: none; opacity: 0; transform: translateY(3px); transition: opacity .15s var(--ease), transform .25s var(--ease); }
#sc-gloss.on { opacity: 1; transform: none; }
#sc-gloss b { display: block; color: var(--text); font-weight: 600; margin-bottom: 2px; }`;
  document.head.appendChild(style);

  const pop = document.createElement('div');
  pop.id = 'sc-gloss';
  pop.className = 'glass';
  pop.setAttribute('role', 'tooltip');
  document.body.appendChild(pop);

  let current = null, showT = 0, hideT = 0;
  function show(el) {
    clearTimeout(hideT);
    if (current === el) return;
    const term = TERMS[+el.dataset.term];
    if (!term) return;
    current?.classList.remove('on'); current?.removeAttribute('aria-describedby');
    current = el;
    el.classList.add('on');
    el.setAttribute('aria-describedby', 'sc-gloss');
    pop.innerHTML = `<b>${SC.h(term[0])}</b>${SC.h(term[1])}`;
    const r = el.getClientRects()[0] || el.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 8;
    const x = Math.max(12, Math.min(r.left, innerWidth - pw - 12));
    const below = r.bottom + gap + ph <= innerHeight - 12;
    const y = below ? r.bottom + gap : Math.max(12, r.top - gap - ph);
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
    pop.classList.add('on');
  }
  function hide(now) {
    clearTimeout(showT); clearTimeout(hideT);
    const go = () => { pop.classList.remove('on'); current?.classList.remove('on'); current?.removeAttribute('aria-describedby'); current = null; };
    if (now === true) go(); else hideT = setTimeout(go, 90);
  }
  const termAt = (ev) => ev.target instanceof Element ? ev.target.closest('.sc-term') : null;
  document.addEventListener('mouseover', (ev) => { const t = termAt(ev); if (!t) return; clearTimeout(showT); showT = setTimeout(() => show(t), current ? 0 : 140); });
  document.addEventListener('mouseout', (ev) => { const t = termAt(ev); if (t && !t.contains(ev.relatedTarget)) { clearTimeout(showT); hide(); } });
  document.addEventListener('focusin', (ev) => { const t = termAt(ev); if (t) show(t); });
  document.addEventListener('focusout', (ev) => { if (termAt(ev)) hide(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && current) hide(true); });
  document.addEventListener('scroll', () => { if (current) hide(true); }, true);
  addEventListener('resize', () => { if (current) hide(true); });

  // initial pass, in case the first render/panel happened before this script ran
  if (document.readyState !== 'loading') queueMicrotask(() => { doPanel(); doContext(); });
})();
