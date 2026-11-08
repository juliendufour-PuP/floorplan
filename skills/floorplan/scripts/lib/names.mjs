// Fallback human-readable names, used until Claude writes real ones in floorplan/descriptions/.
import path from 'node:path';

const P = path.posix;
const ACRONYMS = /\b(api|ui|ux|id|ids|sku|skus|csv|url|urls|http|db|sql|bc|mcp|pos|gcs|s3|aws|gcp|jwt|pdf|ai|llm|cli|css|html|json|xml|oauth|sso|cdn|dns|ip|io|qa|ci|cd|crud|rpc|grpc|sdk|ttl|uuid|mtg)\b/g;
const GENERIC = /^(index|page|layout|route|routes|__init__|__main__|main|mod|lib|app|server|loading|error|not-found|template|default|handler|handlers|views?|urls|models?|schemas?|types?|constants?|utils?|helpers?|config|settings)$/i;

export function humanize(id) {
  let s = String(id)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.\s]+/g, ' ')
    .trim()
    .toLowerCase();
  s = s.replace(ACRONYMS, (m) => m.toUpperCase());
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(id);
}

const cleanSeg = (seg) => seg.replace(/^\((.*)\)$/, '$1').replace(/^\[\.{0,3}(.*)\]$/, '$1 (détail)');

export function fallbackFileName(p) {
  const base = P.basename(p);
  const stem = base.replace(/\.(test|spec)(?=\.)/, '').replace(/\.[^.]+$/, '');
  const isTest = /\.(test|spec)\.[a-z]+$/i.test(base) || /^test_/.test(base) || /_test\.(py|go)$/.test(base);
  const core = stem.replace(/^test_/, '').replace(/_test$/, '');
  let name;
  if (GENERIC.test(core)) {
    const dirs = P.dirname(p).split('/').filter((d) => d && !/^(src|app|lib|pkg|internal)$/.test(d)).map(cleanSeg);
    const parent = dirs.slice(-1)[0] || '';
    const role = { page: 'Page', layout: 'Gabarit', route: 'Gestionnaire de route', __init__: 'Paquet', index: '', loading: 'État de chargement', error: 'État d’erreur' }[core.toLowerCase()];
    name = parent ? (role ? `${role} ${humanize(parent)}` : role === '' ? humanize(parent) : `${humanize(parent)} ${humanize(core).toLowerCase()}`) : humanize(core);
  } else name = humanize(core);
  return isTest ? `${name} (tests)` : name;
}

export function fallbackRouteName(r) {
  if (r.handler && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ANY)$/.test(r.handler)) return humanize(r.handler);
  const segs = r.path.split('/').filter((s) => s && !/[<{:[*]/.test(s));
  const verb = { GET: 'Lire', POST: 'Créer', PUT: 'Remplacer', PATCH: 'Modifier', DELETE: 'Supprimer' }[r.method] || r.method;
  return `${verb} ${humanize(segs.slice(-2).join(' ') || 'racine').toLowerCase()}`;
}

export const routeKey = (r) => `${r.method} ${r.path}`;
