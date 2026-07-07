// Live "Teams" stat → active-team count from Directus (public read).
// Falls back silently to the build-time value (30) if the API is unreachable.
import { getDirectusUrl } from '../lib/directus';

const el = document.querySelector<HTMLElement>('.stat-number[data-stat="teams"]');
if (el) {
  const url = `${getDirectusUrl()}/items/teams?aggregate%5Bcount%5D=id&filter%5Bactive%5D%5B_eq%5D=true`;
  fetch(url)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`teams count ${r.status}`))))
    .then((j) => {
      const count = Number(j?.data?.[0]?.count?.id);
      if (!Number.isFinite(count) || count <= 0) return;
      el.setAttribute('data-value', String(count));
      // Correct the rendered number unless a count-up animation is mid-flight —
      // in that case it will settle on the freshly-set data-value on its own.
      if (!el.classList.contains('counting')) {
        el.textContent = String(count);
      }
    })
    .catch(() => {
      /* keep the build-time fallback */
    });
}
