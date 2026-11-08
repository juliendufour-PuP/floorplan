// Blueprints: a floorplan of a system that hasn't been built yet, planned from a PRD or a description.
//
// planToScan(plan, root) — turns floorplan/plan.json (the planned files, endpoints and calls, written by
//                          the agent) into the same scan.json shape scan.mjs writes for real code, so
//                          build.mjs and the viewer work unchanged. Returns { scan, errors, warnings }.
// buildPlanHealth(ctx)   — called by build.mjs instead of buildHealth for a blueprint: a design review of
//                          the plan (who may call each endpoint, loose ends, open questions) in the same
//                          { summary, issues } shape, so the Health panel shows it.

import path from 'node:path';
import { classify, toPosix } from './common.mjs';
import { matchCalls } from './routes.mjs';

// who may use an endpoint. "team" is the people who run the service (its own admin pages), not the app's users.
export const ACCESS = ['public', 'signed-in', 'team', 'webhook', 'internal'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'CALL', 'ANY'];
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'CALL']);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const strArr = (v) => (Array.isArray(v) ? v.filter(isStr) : []);
const routeKey = (m, p) => `${m} ${p}`;

/** "POST /api/orders" -> { method, path }, or null. */
export function parseCall(s) {
  const m = /^\s*([A-Za-z]+)\s+(\/\S*)\s*$/.exec(String(s || ''));
  return m && METHODS.includes(m[1].toUpperCase()) ? { method: m[1].toUpperCase(), path: m[2] } : null;
}

export function planToScan(plan, root) {
  const errors = [], warnings = [];
  const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
  if (!plan || typeof plan !== 'object') return { scan: null, errors: ['plan.json must be an object'], warnings };
  const files = Array.isArray(plan.files) ? plan.files : [];
  const endpoints = Array.isArray(plan.endpoints) ? plan.endpoints : [];
  if (!files.length) err('files must be a non-empty array of the files the system would have');

  const byPath = new Map();
  files.forEach((f, i) => {
    const where = `files[${i}]${f?.path ? ` ("${f.path}")` : ''}`;
    if (!isStr(f?.path)) return err(`${where}.path is required`);
    const p = toPosix(f.path.trim()).replace(/^\.\//, '');
    if (p.startsWith('/') || p.includes('..')) return err(`${where}.path must be relative to the project folder`);
    if (byPath.has(p)) return err(`${where}.path duplicates an earlier file`);
    if (!isStr(f.description)) warn(`${where} has no description`);
    byPath.set(p, f);
  });
  const known = [...byPath.keys()];
  const near = (p) => { const base = p.split('/').pop(); const hit = known.find((k) => k.split('/').pop() === base); return hit ? ` (did you mean "${hit}"?)` : ''; };

  // endpoints, keyed by "METHOD /path"
  const routes = [], access = {}, seen = new Set();
  endpoints.forEach((e, i) => {
    const where = `endpoints[${i}]${e?.method && e?.path ? ` ("${e.method} ${e.path}")` : ''}`;
    const method = String(e?.method || '').toUpperCase();
    if (!METHODS.includes(method)) return err(`${where}.method must be one of ${METHODS.join(', ')}`);
    if (!isStr(e.path) || !e.path.startsWith('/')) return err(`${where}.path must start with "/"`);
    if (!isStr(e.file)) return err(`${where}.file is required: the planned file that handles it`);
    const file = toPosix(e.file.trim()).replace(/^\.\//, '');
    if (!byPath.has(file)) return err(`${where}.file "${file}" is not one of the planned files${near(file)}`);
    const key = routeKey(method, e.path);
    if (seen.has(key)) return err(`${where} duplicates an earlier endpoint`);
    seen.add(key);
    if (e.access !== undefined && !ACCESS.includes(e.access)) err(`${where}.access "${e.access}" must be one of ${ACCESS.join(', ')}${e.access === 'staff' ? ' ("team" is your own team; for some of the app’s users, use "signed-in" with "who")' : ''}`);
    if (e.who !== undefined && !isStr(e.who)) err(`${where}.who must be a few words, e.g. "managers of that location"`);
    if (e.publicBecause !== undefined && !isStr(e.publicBecause)) err(`${where}.publicBecause must say why it is open to anyone`);
    if (ACCESS.includes(e.access)) access[key] = e.access;
    routes.push({ file, method, path: e.path, line: 0, ...(ACCESS.includes(e.access) ? { access: e.access } : {}), ...(isStr(e.who) ? { who: e.who.trim() } : {}), ...(isStr(e.publicBecause) ? { publicBecause: e.publicBecause.trim() } : {}), ...(isStr(e.name) ? { name: e.name.trim() } : {}), ...(isStr(e.description) ? { desc: e.description.trim() } : {}) });
  });
  const routeKeys = new Set(routes.map((r) => routeKey(r.method, r.path)));

  // imports, calls, and links to outside services and data stores
  const edges = [], nodeLinks = [], callFiles = [];
  for (const [p, f] of byPath) {
    for (const u of strArr(f.uses)) {
      const to = toPosix(u.trim()).replace(/^\.\//, '');
      if (!byPath.has(to)) { err(`files "${p}".uses "${u}" is not one of the planned files${near(to)}`); continue; }
      if (to !== p) edges.push({ from: p, to });
    }
    const calls = [];
    for (const c of strArr(f.calls)) {
      const pc = parseCall(c);
      if (!pc) { err(`files "${p}".calls "${c}" must look like "POST /api/orders"`); continue; }
      if (!routeKeys.has(routeKey(pc.method, pc.path))) warn(`files "${p}".calls "${c}" matches no planned endpoint`);
      calls.push({ path: pc.path, method: pc.method, line: 0 });
    }
    if (calls.length) callFiles.push({ path: p, calls });
    for (const s of strArr(f.services)) nodeLinks.push({ from: p, to: s.trim(), kind: 'http' });
    for (const d of strArr(f.data)) nodeLinks.push({ from: p, to: d.trim(), kind: 'data' });
  }
  // calls only reach the exact planned endpoint (method and path), never a near miss
  const http = matchCalls(callFiles, routes).filter((h) => routeKeys.has(routeKey(h.method, h.path)) && h.call === h.path);

  const questions = [];
  (Array.isArray(plan.questions) ? plan.questions : []).forEach((q, i) => {
    const text = isStr(q) ? q : q?.question;
    if (!isStr(text)) return err(`questions[${i}] needs a question`);
    questions.push({ question: text.trim(), about: strArr(q?.about) });
  });

  const scan = {
    version: 1,
    blueprint: {
      source: isStr(plan.source) ? plan.source.trim() : '',
      stack: strArr(plan.stack),
      assumptions: strArr(plan.assumptions),
      questions,
      access,
    },
    generatedAt: new Date().toISOString(),
    root: toPosix(root),
    rootName: path.basename(root),
    repos: [],
    files: [...byPath].map(([p, f]) => {
      const c = classify(p, 0);
      return {
        path: p, repo: null, category: 'code', lang: c.lang || path.posix.extname(p).slice(1) || null, loc: 0, bytes: 0,
        ...(isStr(f.name) ? { name: f.name.trim() } : {}),
        ...(isStr(f.description) ? { desc: f.description.trim() } : {}),
        ...(isStr(f.screen) && f.screen.startsWith('/') ? { screens: [{ fw: 'plan', url: f.screen.trim() }] } : {}),
      };
    }),
    edges,
    externals: [],
    extEdges: [],
    routes,
    http,
    hosts: [],
    nodeLinks,
  };
  return { scan, errors, warnings };
}

/** The design review shown in the Health panel for a blueprint. */
export function buildPlanHealth({ graph, scan }) {
  const bp = scan.blueprint || {};
  const issues = [];
  const routes = graph.routes || [];
  const ridOf = new Map(routes.map((r, i) => [routeKey(r.m, r.p), 'r:' + i]));
  const fileIds = new Set(graph.files.map((f) => 'f:' + f.p));
  const nodeIds = new Set(graph.nodes.map((n) => 'n:' + n.id));
  const refOf = (s) => {
    if (!isStr(s)) return null;
    const t = s.trim();
    if (nodeIds.has('n:' + t)) return 'n:' + t;
    if (fileIds.has('f:' + t)) return 'f:' + t;
    const pc = parseCall(t);
    return pc ? ridOf.get(routeKey(pc.method, pc.path)) || null : null;
  };
  const line = (r) => `- ${r.m} ${r.p} (${r.f})${r.name ? ` : ${r.name}` : ''}`;
  const rebuild = 'Ensuite, régénérez le plan prévisionnel : lancez plan.mjs puis build.mjs depuis le skill Floorplan, comme l’indiquent ses instructions.';
  // each item also carries `change`: a request to settle it from the map (the Ask bar's Change mode), for the person to finish or edit
  const names = (xs, max = 6) => { const l = xs.slice(0, max).concat(xs.length > max ? [`${xs.length - max} autre${xs.length - max > 1 ? 's' : ''}`] : []); return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} et ${l.at(-1)}`; };
  const ep = (r) => `${r.m} ${r.p}`;

  // ---------- who may call each endpoint ----------
  const accessOf = (r) => bp.access?.[routeKey(r.m, r.p)];
  // open on purpose, with a reason (publicBecause), counts as reviewed
  const openWrites = routes.map((r, i) => ({ r, i })).filter(({ r }) => accessOf(r) === 'public' && WRITE.has(r.m) && !r.publicBecause);
  if (openWrites.length) issues.push({
    id: 'plan-open-writes', kind: 'unprotected-endpoint', severity: 'medium',
    change: `Revoir qui peut utiliser ${names(openWrites.map(({ r }) => ep(r)))}. Pour l’instant, n’importe qui peut s’en servir pour modifier des données. `,
    title: openWrites.length === 1 ? 'N’importe qui pourrait modifier des données via un point d’accès prévu' : `N’importe qui pourrait modifier des données via ${openWrites.length} points d’accès prévus`,
    detail: `Le plan permet à ${openWrites.length === 1 ? 'ce point d’accès' : 'ces points d’accès'} de créer, modifier ou supprimer des données sans connexion. C’est normal pour une inscription ou une commande sans compte, mais à revoir avant de construire : ${openWrites.length === 1 ? 'c’est l’élément' : 'ce sont les éléments'} qu’un inconnu détournerait le plus facilement.`,
    items: openWrites.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(openWrites.slice(0, 24).map(({ i }) => ['r:' + i, 'Prévu ouvert à tous, et modifie des données'])),
    locations: [],
    fix: [`Revue de conception de floorplan/plan.json : ces points d’accès prévus modifient des données et sont marqués "access": "public" :`, ...openWrites.map(({ r }) => line(r)), ``, `Pour chacun, dites-moi simplement si un inconnu devrait vraiment pouvoir s’en servir. Si ce n’est pas le cas, passez son accès à "signed-in" dans plan.json (avec "who" si seuls certains utilisateurs y ont droit). S’il doit rester public (connexion, inscription, commande sans compte), renseignez "publicBecause" avec la raison, y compris ce qui limite les abus (limite de débit, CAPTCHA, confirmation par e-mail). Demandez-moi en cas de doute.`, rebuild].join('\n'),
  });
  const unknown = routes.map((r, i) => ({ r, i })).filter(({ r }) => !accessOf(r));
  if (unknown.length) issues.push({
    id: 'plan-no-access', kind: 'unprotected-endpoint', severity: 'medium',
    change: `Décider qui peut utiliser ${names(unknown.map(({ r }) => ep(r)))}, d’après le PRD. `,
    title: unknown.length === 1 ? 'Le plan ne dit pas qui peut utiliser un point d’accès' : `Le plan ne dit pas qui peut utiliser ${unknown.length} points d’accès`,
    detail: `Décider maintenant qui peut utiliser chaque partie du système (tout le monde, les clients connectés, seulement les responsables, votre équipe, un autre service) est bien plus simple que d’ajouter des contrôles de connexion une fois le système construit.`,
    items: unknown.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(unknown.slice(0, 24).map(({ i }) => ['r:' + i, 'Qui peut l’utiliser n’est pas encore décidé'])),
    locations: [],
    fix: [`Revue de conception de floorplan/plan.json : ces points d’accès prévus n’ont pas de "access" :`, ...unknown.map(({ r }) => line(r)), ``, `Pour chacun, choisissez qui peut l’utiliser : "public" (tout le monde), "signed-in" (avec "who" quand seuls certains utilisateurs y ont droit, par exemple "responsables de ce site"), "team" (seulement les personnes qui gèrent le service), "webhook" (le service d’une autre entreprise, qui doit prouver son identité) ou "internal" (seulement nos propres services). Appuyez-vous sur le PRD, et demandez-moi là où il ne dit rien.`, rebuild].join('\n'),
  });

  // ---------- open questions from the PRD ----------
  bp.questions?.forEach((q, k) => {
    const items = [...new Set(q.about.map(refOf).filter(Boolean))];
    issues.push({
      id: 'plan-question:' + k, kind: 'question', severity: 'medium',
      change: `Question ouverte : « ${q.question} » Ma réponse : `,
      title: q.question,
      detail: 'Le PRD ne répond pas à cette question, et la réponse change ce qui sera construit. Tranchez-la avant de construire les parties concernées.',
      items, notes: Object.fromEntries(items.map((id) => [id, 'Dépend d’une question ouverte'])),
      locations: [],
      fix: [`Question ouverte dans le plan prévisionnel (floorplan/plan.json) : ${q.question}`, ``, `Expliquez-moi simplement les options, avec ce que chacune impliquerait pour les parties concernées${q.about.length ? ` (${q.about.join(', ')})` : ''}, et recommandez-en une. Une fois que j’ai décidé, mettez à jour plan.json et architecture.json en conséquence, et retirez la question de la liste "questions" de plan.json.`, rebuild].join('\n'),
    });
  });

  // ---------- loose ends ----------
  const called = new Set(graph.links.filter((l) => l.k === 'http' && l.calls).flatMap((l) => l.calls.map(([ri]) => ri)));
  const unusedRoutes = routes.map((r, i) => ({ r, i })).filter(({ r, i }) => !called.has(i) && !['webhook', 'internal', 'public'].includes(accessOf(r)));
  if (unusedRoutes.length) issues.push({
    id: 'plan-unused-endpoints', kind: 'unused-file', severity: 'low',
    change: `Rien n’appelle ${names(unusedRoutes.map(({ r }) => ep(r)))}. Ajoutez l’écran ou le service qui devrait ${unusedRoutes.length === 1 ? 'l’utiliser, ou supprimez-le s’il ne sert à rien' : 'les utiliser, ou supprimez-les s’ils ne servent à rien'}. `,
    title: unusedRoutes.length === 1 ? 'Rien dans le plan n’utilise un point d’accès' : `Rien dans le plan n’utilise ${unusedRoutes.length} points d’accès`,
    detail: `Aucune page ni aucun service prévu ne ${unusedRoutes.length === 1 ? 'l’appelle' : 'les appelle'}. Soit il manque au plan un écran qui en a besoin, soit ${unusedRoutes.length === 1 ? 'il n’est pas utile' : 'ils ne sont pas utiles'}.`,
    items: unusedRoutes.slice(0, 24).map(({ i }) => 'r:' + i),
    notes: Object.fromEntries(unusedRoutes.slice(0, 24).map(({ i }) => ['r:' + i, 'Aucun appel prévu'])),
    locations: [],
    fix: [`Revue de conception de floorplan/plan.json : rien dans le plan n’appelle ces points d’accès :`, ...unusedRoutes.map(({ r }) => line(r)), ``, `Pour chacun, trouvez quel écran ou service prévu devrait l’appeler et ajoutez-le aux "calls" de ce fichier, ou dites-moi qu’il est inutile et supprimez-le.`, rebuild].join('\n'),
  });
  const linked = new Set();
  for (const l of graph.links) { linked.add(l.a); linked.add(l.b); }
  const screenFiles = new Set((graph.screens || []).map((s) => s.file));
  const routeFiles = new Set(routes.map((r) => r.f));
  const loose = graph.files.filter((f) => !linked.has('f:' + f.p) && !screenFiles.has(f.p) && !routeFiles.has(f.p));
  if (loose.length) issues.push({
    id: 'plan-loose-files', kind: 'unused-file', severity: 'low',
    change: `${names(loose.map((f) => f.p))} ${loose.length === 1 ? 'n’est relié à rien. Reliez-le à ce qui devrait l’utiliser, ou supprimez-le' : 'ne sont reliés à rien. Reliez-les à ce qui devrait les utiliser, ou supprimez-les'}. `,
    title: loose.length === 1 ? 'Un fichier prévu n’est relié à rien' : `${loose.length} fichiers prévus ne sont reliés à rien`,
    detail: `Rien dans le plan ne ${loose.length === 1 ? 'l’utilise' : 'les utilise'}, et ${loose.length === 1 ? 'il n’utilise' : 'ils n’utilisent'} rien. En général, cela veut dire qu’il manque une connexion dans le plan.`,
    items: loose.slice(0, 24).map((f) => 'f:' + f.p),
    notes: Object.fromEntries(loose.slice(0, 24).map((f) => ['f:' + f.p, 'Relié à rien dans le plan'])),
    locations: [],
    fix: [`Revue de conception de floorplan/plan.json : ces fichiers prévus ne sont reliés à rien :`, ...loose.map((f) => `- ${f.p}`), ``, `Ajoutez les entrées "uses", "calls", "services" ou "data" manquantes, ou supprimez les fichiers inutiles.`, rebuild].join('\n'),
  });

  const ORDER = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const summary = { high: 0, medium: 0, low: 0 };
  for (const i of issues) summary[i.severity]++;
  return { summary, issues: issues.slice(0, 40), review: true };
}
