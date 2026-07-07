// Live About-page stats → public_stats collection in Directus (public read).
// One request covers both numbers; values are kept fresh server-side by the
// "Public stats: recount" flow (API writes) and the weekly ClubDesk sync
// (raw-SQL refresh at the end of import-clubdesk-csv.mjs in wiedisync).
// Falls back silently to the build-time markup values if the API is
// unreachable or the collection doesn't exist (e.g. directus-dev).
import { getDirectusUrl } from '../lib/directus';

const members = document.querySelector<HTMLElement>('.stat-number[data-stat="members"]');
const teams = document.querySelector<HTMLElement>('.stat-number[data-stat="teams"]');

// stat-counters.ts captures data-value when its count-up STARTS and writes the
// captured value on its final frame — a value set mid-animation would be
// overwritten at the end. So: update data-value immediately (covers the
// not-yet-started case; the observer fires at 15% viewport visibility), and
// re-assert textContent after the animation window (1500ms run + 250ms glow).
function apply(el: HTMLElement | null, count: number) {
  if (!el || !Number.isFinite(count) || count <= 0) return;
  const value = String(count);
  el.setAttribute('data-value', value);
  if (el.classList.contains('counting')) {
    setTimeout(() => {
      el.textContent = value;
    }, 1800);
  } else {
    el.textContent = value;
  }
}

if (members || teams) {
  const base = getDirectusUrl();
  fetch(`${base}/items/public_stats?fields=id,value`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`public_stats ${r.status}`))))
    .then((j: { data?: { id: string; value: number }[] }) => {
      const byId = new Map((j.data ?? []).map((row) => [row.id, Number(row.value)]));
      apply(members, byId.get('member_count') ?? NaN);
      apply(teams, byId.get('team_count') ?? NaN);
      if (!byId.get('team_count')) throw new Error('no team_count');
    })
    .catch(() => {
      // public_stats unavailable (e.g. dev Directus) — teams has a second
      // public source: the live active-team count aggregate.
      if (!teams) return;
      fetch(`${base}/items/teams?aggregate%5Bcount%5D=id&filter%5Bactive%5D%5B_eq%5D=true`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('teams aggregate failed'))))
        .then((j) => apply(teams, Number(j?.data?.[0]?.count?.id)))
        .catch(() => {
          /* keep the build-time fallbacks */
        });
    });
}
