// Messages temporaires, avec action facultative (« Annuler ») et barre de temps restant.
import { echapper } from './format.js';

export function toast(message, { action, surAction, duree = 5000, erreur = false } = {}) {
  const zone = document.getElementById('toasts');
  if (!zone) return;
  const t = document.createElement('div');
  t.className = `toast${erreur ? ' err' : ''}`;
  t.innerHTML = `<span>${echapper(message)}</span>${action ? `<button type="button" class="btn">${echapper(action)}</button>` : ''}<i class="t-bar" style="animation-duration:${duree}ms"></i>`;
  const fermer = () => { t.remove(); };
  t.querySelector('button')?.addEventListener('click', () => { fermer(); surAction?.(); });
  zone.appendChild(t);
  setTimeout(fermer, duree);
}
