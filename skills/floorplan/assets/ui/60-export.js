// Export: a copy of the map to share as one HTML file, for people without Claude or Codex. The map's server
// (serve.mjs) builds it: the same page without the Ask bar, requests for Claude or Codex, or links into this
// computer, plus the extras ticked here. Talks to the viewer only through window.Floorplan.
(() => {
  const SC = window.Floorplan;
  if (!SC || SC.exported) return;
  const S = window.FLOORPLAN_SERVER;
  // opened in the Claude app: there's no map folder to export from
  if (!S && location.protocol !== 'file:') return;
  const { h } = SC;
  const G = SC.graph;
  const PLAN = !!G.meta.blueprint;
  const CMD = 'node floorplan/serve.mjs --export';

  const style = document.createElement('style');
  style.textContent = `
.xp-opts { display: flex; flex-direction: column; gap: 2px; margin: 14px 0 4px; }
.xp-opt { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; cursor: pointer; }
.xp-opt:hover { background: rgba(var(--ink), .05); }
.xp-opt input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); flex: none; cursor: pointer; }
.xp-opt b { display: block; font-weight: 500; color: var(--text); }
.xp-opt span { display: block; font-size: 12.5px; color: var(--text-3); line-height: 1.5; }
.xp-opt.warn span { color: var(--warn-text); }
.xp-note { font-size: 12.5px; color: var(--text-3); line-height: 1.55; margin-top: 10px; }
.xp-err { font-size: 12.5px; color: var(--warn-text); background: var(--warn-bg); border-radius: 10px; padding: 8px 12px; margin-top: 10px; }
`;
  document.head.appendChild(style);
  SC.icons.export = '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>';

  // only what this map has; the extras that say how the app could be attacked are off unless ticked
  const PARTS = [
    { id: 'flows', label: 'Parcours et visite guidée', hint: 'Les parcours guidés, y compris ceux que vous avez demandés.', on: true, has: G.flows.length > 0 || (G.tour || []).length > 0 },
    { id: 'notes', label: 'Notes épinglées aux fichiers', hint: 'Les notes affichées sur les cartes de fichiers.', on: true, has: G.files.some((f) => f.note) },
    { id: 'recent', label: 'Travaux récents', hint: 'Ce qui vient d’être modifié, et pourquoi.', on: false, has: !!G.recent?.items?.length },
    PLAN
      ? { id: 'health', label: 'Revue de conception', hint: 'Les décisions que le plan laisse encore ouvertes.', on: false, has: !!G.health?.issues?.length }
      : { id: 'health', label: 'Bilan de santé', hint: 'Liste les points d’accès que tout le monde peut utiliser et l’emplacement des secrets dans le code (jamais leurs valeurs). Ne l’incluez que pour des personnes de confiance.', on: false, warn: true, has: !!G.health?.issues?.length },
  ].filter((p) => p.has);

  async function download(el, close) {
    const err = el.querySelector('.xp-err');
    const include = [...el.querySelectorAll('[data-xp]')].filter((c) => c.checked).map((c) => c.dataset.xp);
    // flows requested since the map was last built live only on this page so far
    const flows = G.flows.filter((f) => f.custom).map((f) => ({ id: f.id, title: f.title, description: f.description, steps: f.steps }));
    try {
      const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json', 'x-floorplan-token': S.token }, body: JSON.stringify({ include, flows }) });
      if (r.status === 403) throw new Error('Le serveur de la carte a redémarré depuis l’ouverture de cette page. Rechargez la page et réessayez.');
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Le serveur de la carte n’a pas pu l’exporter.');
      const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'floorplan-carte.html';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await r.blob());
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      close();
      SC.toast(`Téléchargé : ${name}`);
    } catch (e) {
      err.hidden = false;
      err.textContent = e.message === 'Failed to fetch' ? 'Impossible de joindre le serveur de la carte. Demandez à Claude ou à Codex de rouvrir le floorplan, puis réessayez.' : e.message;
    }
  }

  function openExport() {
    if (!S) {
      SC.modal({
        title: 'Exporter une copie',
        html: `<p>L’export a besoin du serveur de la carte. Demandez à Claude ou à Codex « exporte le floorplan », ou lancez ceci dans le dossier du projet :</p><pre>${h(CMD)}</pre>`,
        actions: [{ label: 'Copier la commande', primary: true, icon: 'copy', onClick: () => { SC.copy(CMD); SC.toast('Copié'); } }],
      });
      return;
    }
    const m = SC.modal({
      title: 'Exporter une copie',
      html: `<p>Un seul fichier HTML avec toute la carte, à envoyer à qui vous voulez. Il s’ouvre dans n’importe quel navigateur, sans rien installer, et n’a pas de barre Demander.</p>
        ${PARTS.length ? `<div class="xp-opts">${PARTS.map((p) => `<label class="xp-opt${p.warn ? ' warn' : ''}"><input type="checkbox" data-xp="${p.id}"${p.on ? ' checked' : ''}><div><b>${h(p.label)}</b><span>${h(p.hint)}</span></div></label>`).join('')}</div>` : ''}
        <p class="xp-note">Ce fichier montre comment ${h(G.project.name)} est construit : chaque partie, chaque fichier et chaque point d’accès, ainsi que le nom des fonctions qu’ils contiennent, mais pas le code lui-même.</p>
        <div class="xp-err" hidden></div>`,
      actions: [{ label: 'Télécharger', primary: true, icon: 'export', keepOpen: true, onClick: (close) => { download(m.el, close); } }],
    });
  }

  SC.addHeaderButton({ id: 'btn-export', label: 'Exporter', icon: 'export', title: 'Exporter une copie de cette carte à partager', onClick: openExport });
})();
