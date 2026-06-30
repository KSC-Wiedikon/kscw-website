// Calendar Grid — Vanilla JS month grid fetching games from Directus
// With filter toolbar, sport/team colors, and iCal subscribe modal

const DIRECTUS_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch'

interface DirectusTeam {
  id: number
  name: string
  sport: string
  color: string
}

interface DirectusGame {
  id: number
  game_id: string
  date: string
  time: string
  home_team: string
  away_team: string
  home_score: number
  away_score: number
  status: string
  type: string
  kscw_team?: DirectusTeam | null
  hall?: { id: number; name: string; address: string; city?: string; maps_url?: string } | null
}

interface CalendarEvent {
  title: string
  date: string
  endDate?: string
  time?: string
  location?: string
  category: string
  body?: string
  signupUrl?: string
}

// A single row from the `hall_closures` collection. One closure row exists per
// (date-range × hall), so a school-holiday week is stored as ~12 rows (one per
// hall). They are collapsed back into one entry per day/reason at render time.
interface DirectusClosure {
  id: number
  start_date: string // YYYY-MM-DD (plain date, no time)
  end_date: string   // YYYY-MM-DD, inclusive
  reason: string
  source: string     // 'school_holidays' | 'gcal' | 'manual'
  hall?: { id: number; name: string } | null
}

// Per-day, per-reason grouping of the raw closure rows above: the 12 hall rows
// of one holiday become a single chip listing the affected halls.
interface ClosureGroup {
  label: string      // display label (localized for the generic "Halle geschlossen")
  source: string
  startDate: string  // full closure range start (not just the rendered day)
  endDate: string
  halls: string[]
}

const container = document.getElementById('calendar-grid')
if (container) {
  // Live language: read from the runtime i18n engine each time labels are
  // recomputed (single-URL site — language switches client-side and fires a
  // `langChanged` event, so this must NOT be captured once at load).
  const getLang = (): string =>
    ((window as any).i18n && (window as any).i18n.getLang && (window as any).i18n.getLang())
    || document.documentElement.lang
    || container.dataset.lang
    || 'de'

  // Labels are recomputed from the current language on every render via
  // computeLabels(); declared with `let` so the closures below (modals,
  // toolbar, chips) always read the active-language value.
  let lang = getLang()
  let dayHeaders: string[] = []
  let monthNames: string[] = []
  let todayLabel = ''
  let homeLabel = ''
  let awayLabel = ''
  let loadingLabel = ''
  let subscribeLabel = ''
  let downloadLabel = ''
  let subscribeTitle = ''
  let allTeamsLabel = ''
  let eventsLabel = 'Events'
  let homeGamesLabel = ''
  let awayGamesLabel = ''
  let closuresLabel = ''
  let affectedHallsLabel = ''
  let allHallsLabel = ''

  function computeLabels(): void {
    lang = getLang()
    dayHeaders =
      lang === 'de'
        ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    monthNames =
      lang === 'de'
        ? ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
        : ['January','February','March','April','May','June','July','August','September','October','November','December']
    todayLabel = lang === 'de' ? 'Heute' : 'Today'
    homeLabel = lang === 'de' ? 'Heim' : 'Home'
    awayLabel = lang === 'de' ? 'Auswärts' : 'Away'
    loadingLabel = lang === 'de' ? 'Spiele werden geladen...' : 'Loading games...'
    subscribeLabel = lang === 'de' ? 'Abonnieren' : 'Subscribe'
    downloadLabel = lang === 'de' ? 'Herunterladen' : 'Download'
    subscribeTitle = lang === 'de' ? 'Kalender abonnieren' : 'Subscribe to Calendar'
    allTeamsLabel = lang === 'de' ? 'Alle Teams' : 'All Teams'
    eventsLabel = 'Events'
    homeGamesLabel = lang === 'de' ? 'Heimspiele' : 'Home Games'
    awayGamesLabel = lang === 'de' ? 'Auswärtsspiele' : 'Away Games'
    closuresLabel = lang === 'de' ? 'Halle geschlossen' : 'Hall closed'
    affectedHallsLabel = lang === 'de' ? 'Betroffene Hallen' : 'Affected halls'
    allHallsLabel = lang === 'de' ? 'Alle Hallen' : 'All halls'
  }
  computeLabels()

  let currentMonth = new Date()
  currentMonth.setDate(1)
  let games: DirectusGame[] = []
  let closures: DirectusClosure[] = []
  // Whole calendar dataset (games + closures) is fetched once up front, not per
  // visible month — the collections are small (a few hundred rows spanning the
  // season) so a single load makes month navigation instant with no spinner or
  // refetch. buildCalendarGrid() / closureGroupsForDay() already filter the full
  // arrays down to the rendered month, so loading everything needs no render
  // changes. Flag guards against re-fetching on navigation / language switch.
  let dataLoaded = false
  // Filter state
  let filterType = new Set(['home', 'away'])
  let filterSport = new Set(['volleyball', 'basketball'])
  let filterTeams = new Set<string>() // empty = all
  let showClosures = true // "Halle geschlossen" entries, toggleable in the toolbar

  // Teams list
  let allTeams: DirectusTeam[] = []

  // Load build-time events
  let calEvents: CalendarEvent[] = []
  const evDataEl = document.getElementById('events-data')
  if (evDataEl) {
    try {
      calEvents = JSON.parse(evDataEl.textContent || '[]')
    } catch { /* ignore */ }
  }

  // -- Date helpers --
  // Events carry a full UTC instant: an all-day event authored as Zurich
  // midnight is stored as the *previous* day 22:00Z in summer (e.g. Aug 22
  // 00:00 local → "2026-08-21T22:00:00Z"). Slicing the UTC string would bucket
  // it on the wrong day, so resolve the calendar day in the club timezone.
  // Games carry a plain `YYYY-MM-DD` date (no time) — passed through unchanged.
  function eventDateKey(iso: string): string {
    if (!iso) return ''
    if (iso.length <= 10) return iso
    // en-CA renders ISO-ordered YYYY-MM-DD; `timeZone` picks the Zurich day.
    // Locale here only shapes a machine key (not display) — display paths use de-CH.
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' })
  }
  function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1)
  }
  function endOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0)
  }
  function startOfWeek(d: Date): Date {
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  }
  function endOfWeek(d: Date): Date {
    const day = d.getDay()
    const diff = day === 0 ? 0 : 7 - day
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  }
  function toDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }
  function isSameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
  }
  function eachDay(start: Date, end: Date): Date[] {
    const days: Date[] = []
    const cur = new Date(start)
    while (cur <= end) {
      days.push(new Date(cur))
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }

  // -- Safe text helper --
  function el(tag: string, cls?: string, text?: string): HTMLElement {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text) e.textContent = text
    return e
  }

  // -- Sport ball SVG icons --
  function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }

  function sportBallIcon(sport: string): SVGElement {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'cal-sport-ball' })
    const s = '1.5' // stroke-width

    if (sport === 'basketball') {
      const c = '#1a1a1a'
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10', fill: '#F97316', stroke: c, 'stroke-width': s }))
      svg.appendChild(svgEl('path', { d: 'M4.93 4.93c4.08 2.64 8.74 3.2 14.14 0', fill: 'none', stroke: c, 'stroke-width': s, 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('path', { d: 'M4.93 19.07c4.08-2.64 8.74-3.2 14.14 0', fill: 'none', stroke: c, 'stroke-width': s, 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('line', { x1: '12', y1: '2', x2: '12', y2: '22', stroke: c, 'stroke-width': s }))
      svg.appendChild(svgEl('line', { x1: '2', y1: '12', x2: '22', y2: '12', stroke: c, 'stroke-width': s }))
    } else {
      const c = '#4A55A2'
      svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10', fill: '#FFC832', stroke: c, 'stroke-width': s }))
      svg.appendChild(svgEl('path', { d: 'M11.1 7.1a16.55 16.55 0 0 1 10.9 4', stroke: c, 'stroke-width': s, fill: 'none', 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('path', { d: 'M12 12a12.6 12.6 0 0 1-8.7 5', stroke: c, 'stroke-width': s, fill: 'none', 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('path', { d: 'M16.8 13.6a16.55 16.55 0 0 1-9 7.5', stroke: c, 'stroke-width': s, fill: 'none', 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('path', { d: 'M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10', stroke: c, 'stroke-width': s, fill: 'none', 'stroke-linecap': 'round' }))
      svg.appendChild(svgEl('path', { d: 'M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5', stroke: c, 'stroke-width': s, fill: 'none', 'stroke-linecap': 'round' }))
    }
    return svg
  }

  // -- Color helpers --
  function hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${alpha})`
  }

  function getTeamSport(g: DirectusGame): string {
    return g.kscw_team?.sport || (g.game_id?.startsWith('bb_') ? 'basketball' : 'volleyball')
  }

  // -- Fetch teams --
  async function fetchTeams(): Promise<void> {
    try {
      const filter = encodeURIComponent(JSON.stringify({ active: { _eq: true } }))
      const url = `${DIRECTUS_URL}/items/teams?fields=id,name,sport,color&sort=sport,name&limit=-1&filter=${filter}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      allTeams = data.data || []
    } catch {
      allTeams = []
    }
  }

  // -- Fetch all games + closures (once) --
  // Both collections are small and bounded to the season range, so the entire
  // dataset is loaded in one shot instead of a windowed query per visible month.
  // Month navigation then never hits the network — buildCalendarGrid() filters
  // these arrays down to the rendered grid. Runs once; the dataLoaded flag (set
  // by the caller) short-circuits any later call.
  async function fetchAllData(): Promise<void> {
    const gameFields = encodeURIComponent('id,game_id,date,time,home_team,away_team,home_score,away_score,status,type,kscw_team.id,kscw_team.name,kscw_team.sport,kscw_team.color,hall.id,hall.name,hall.address')
    const closureFields = encodeURIComponent('id,start_date,end_date,reason,source,hall.id,hall.name')
    const gamesUrl = `${DIRECTUS_URL}/items/games?limit=-1&sort=date,time&fields=${gameFields}`
    const closuresUrl = `${DIRECTUS_URL}/items/hall_closures?limit=-1&sort=start_date&fields=${closureFields}`

    const [gamesRes, closuresRes] = await Promise.allSettled([
      fetch(gamesUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch(closuresUrl).then(r => r.ok ? r.json() : Promise.reject(r.status)),
    ])
    games = gamesRes.status === 'fulfilled' ? (gamesRes.value.data || []) : []
    closures = closuresRes.status === 'fulfilled' ? (closuresRes.value.data || []) : []
  }

  // Normalize the free-text reason: the gcal feed stores "Halle Geschlossen ",
  // "Halle geschlossen " etc. — collapse those to one localized label so the
  // per-hall rows merge into a single chip. Holiday names pass through verbatim.
  function closureLabel(reason: string): string {
    const r = (reason || '').trim()
    if (/^halle\s+geschlossen$/i.test(r)) return closuresLabel
    return r || closuresLabel
  }

  // Format a closure's full span for the detail/day modals (dd.mm.yyyy).
  function formatClosureRange(startKey: string, endKey: string): string {
    const fmt = (key: string) =>
      new Date(key + 'T12:00:00').toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return startKey === endKey ? fmt(startKey) : `${fmt(startKey)} – ${fmt(endKey)}`
  }

  // -- Closure padlock icon --
  function closureIcon(): SVGElement {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', class: 'cal-closure-icon', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
    svg.appendChild(svgEl('rect', { x: '3', y: '11', width: '18', height: '11', rx: '2', ry: '2' }))
    svg.appendChild(svgEl('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }))
    return svg
  }

  // Group the raw closure rows covering `dayKey` by their display label, merging
  // the per-hall rows: collect affected halls and widen the span to the union.
  function closureGroupsForDay(dayKey: string): ClosureGroup[] {
    if (!showClosures) return []
    const groups = new Map<string, ClosureGroup>()
    for (const c of closures) {
      if (!(c.start_date <= dayKey && c.end_date >= dayKey)) continue
      const label = closureLabel(c.reason)
      let g = groups.get(label)
      if (!g) {
        g = { label, source: c.source, startDate: c.start_date, endDate: c.end_date, halls: [] }
        groups.set(label, g)
      } else {
        if (c.start_date < g.startDate) g.startDate = c.start_date
        if (c.end_date > g.endDate) g.endDate = c.end_date
      }
      const hn = c.hall?.name
      if (hn && !g.halls.includes(hn)) g.halls.push(hn)
    }
    // Suppress redundant subset closures: if a broader closure already covers a
    // narrower one's halls (e.g. a "Sommerferien / Alle Hallen" school-holiday
    // closure over a generic "Halle geschlossen / KWI A, B, C"), show only the
    // broader set. A school_holidays closure covers every hall, so it strictly
    // contains any other group on that day.
    const all = Array.from(groups.values())
    const coverage = (g: ClosureGroup): 'ALL' | Set<string> =>
      g.source === 'school_holidays' ? 'ALL'
        : new Set(g.halls.length ? g.halls : ['KWI A', 'KWI B', 'KWI C'])
    const strictlyContains = (a: 'ALL' | Set<string>, b: 'ALL' | Set<string>): boolean => {
      if (a === 'ALL') return b !== 'ALL'        // ALL contains any non-ALL set
      if (b === 'ALL') return false
      return a.size > b.size && [...b].every(h => a.has(h))
    }
    const covers = all.map(coverage)
    return all.filter((_, i) => !all.some((_, j) => j !== i && strictlyContains(covers[j], covers[i])))
  }

  // -- Filter games --
  function applyFilters(gameList: DirectusGame[]): DirectusGame[] {
    return gameList.filter(g => {
      if (!filterType.has(g.type)) return false
      const sport = getTeamSport(g)
      if (!filterSport.has(sport)) return false
      if (filterTeams.size > 0 && g.kscw_team?.id && !filterTeams.has(String(g.kscw_team.id))) return false
      return true
    })
  }

  // -- Build game entry chip --
  function gameChip(g: DirectusGame): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cal-entry'

    const isHome = g.type === 'home'
    const teamColor = g.kscw_team?.color || (isHome ? '#4A55A2' : '#d97706')
    const teamName = g.kscw_team?.name || (isHome ? g.home_team : g.away_team)

    // Use team color for chip background
    btn.style.background = hexToRgba(teamColor, 0.15)
    btn.style.borderLeft = `3px solid ${teamColor}`

    // Sport ball icon
    const sport = getTeamSport(g)
    btn.appendChild(sportBallIcon(sport))

    // Time
    if (g.time) {
      btn.appendChild(el('span', 'cal-entry-time', g.time.slice(0, 5)))
    }

    // H/A badge
    const badge = el('span', `cal-entry-badge cal-entry-badge--${isHome ? 'home' : 'away'}`, isHome ? 'H' : 'A')
    btn.appendChild(badge)

    // Team name (short)
    btn.appendChild(el('span', 'cal-entry-title', teamName))

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      showGameDetail(g)
    })

    return btn
  }

  // -- Event chip --
  function eventChip(ev: CalendarEvent): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cal-entry cal-entry--event'

    if (ev.time) {
      btn.appendChild(el('span', 'cal-entry-time', ev.time.slice(0, 5)))
    }

    btn.appendChild(el('span', 'cal-entry-title', ev.title))

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      showEventDetail(ev)
    })

    return btn
  }

  // -- Closure: affected-hall summary --
  // School-holiday closures span every hall (Directus stores one row per hall) —
  // collapse to a single "Alle Hallen" label instead of listing all ~12. gcal /
  // manual closures list their specific halls, compacted by shared prefix
  // ("KWI A","KWI B","KWI C" → "KWI A, B, C"). A gcal closure with no hall set
  // defaults to the main KWI halls.
  function closureHallsLabel(g: ClosureGroup): string {
    if (g.source === 'school_holidays') return allHallsLabel
    if (g.halls.length === 0) return 'KWI A, B, C'
    return compactHalls(g.halls)
  }

  function compactHalls(names: string[]): string {
    const sorted = [...names].sort((a, b) => a.localeCompare(b, 'de'))
    const order: string[] = []
    const byPrefix = new Map<string, string[]>()
    for (const n of sorted) {
      const sp = n.indexOf(' ')
      const prefix = sp > 0 ? n.slice(0, sp) : n
      const rest = sp > 0 ? n.slice(sp + 1) : ''
      if (!byPrefix.has(prefix)) { byPrefix.set(prefix, []); order.push(prefix) }
      if (rest) byPrefix.get(prefix)!.push(rest)
    }
    return order
      .map(p => {
        const rests = byPrefix.get(p)!
        return rests.length ? `${p} ${rests.join(', ')}` : p
      })
      .join(' · ')
  }

  // -- Full-day closure block --
  // A closure paints the whole day red (.cal-cell--closed); this is the centered
  // reason + affected-halls overlay. Clicking opens the closure detail, or the
  // day modal when the day also has games/events or multiple closures.
  function closureBlock(date: Date, dayGames: DirectusGame[], dayEvents: CalendarEvent[], groups: ClosureGroup[]): HTMLElement {
    const block = document.createElement('button')
    block.type = 'button'
    block.className = 'cal-closed-block'

    for (const g of groups) {
      const line = el('div', 'cal-closed-line')
      line.appendChild(el('div', 'cal-closed-reason', g.label))
      line.appendChild(el('div', 'cal-closed-halls', closureHallsLabel(g)))
      block.appendChild(line)
    }

    block.addEventListener('click', (e) => {
      e.stopPropagation()
      if (groups.length === 1 && dayGames.length === 0 && dayEvents.length === 0) {
        showClosureDetail(groups[0])
      } else {
        showDayModal(date, dayGames, dayEvents, groups)
      }
    })

    return block
  }

  // -- Game detail modal --
  function showGameDetail(g: DirectusGame): void {
    const overlay = el('div', 'cal-modal-overlay')
    overlay.addEventListener('click', () => overlay.remove())

    const modal = el('div', 'cal-modal')
    modal.style.maxWidth = '420px'
    modal.addEventListener('click', (e) => e.stopPropagation())

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cal-modal-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => overlay.remove())
    modal.appendChild(closeBtn)

    const isHome = g.type === 'home'
    const isBB = getTeamSport(g) === 'basketball'
    const sportLabel = isBB ? 'Basketball' : 'Volleyball'
    const typeLabel = isHome ? homeLabel : awayLabel
    const teamColor = g.kscw_team?.color || '#4A55A2'

    // Header badges
    const hdr = el('div', 'cal-modal-row-header')
    hdr.style.marginBottom = 'var(--space-sm)'
    hdr.appendChild(el('span', `cal-tooltip-sport cal-tooltip-sport--${isBB ? 'bb' : 'vb'}`, sportLabel))
    hdr.appendChild(el('span', `cal-tooltip-type cal-tooltip-type--${isHome ? 'home' : 'away'}`, typeLabel))
    if (g.kscw_team?.name) {
      const teamChip = el('span', 'cal-detail-team', g.kscw_team.name)
      teamChip.style.background = hexToRgba(teamColor, 0.15)
      teamChip.style.color = teamColor
      teamChip.style.border = `1px solid ${hexToRgba(teamColor, 0.3)}`
      hdr.appendChild(teamChip)
    }
    modal.appendChild(hdr)

    // Teams title
    modal.appendChild(el('h3', 'cal-modal-title', `${g.home_team} vs ${g.away_team}`))

    // Score (if completed)
    if (g.status === 'completed' && (g.home_score || g.away_score)) {
      const scoreDiv = el('div', 'cal-detail-score', `${g.home_score} : ${g.away_score}`)
      modal.appendChild(scoreDiv)
    }

    // Date & Time — g.date is YYYY-MM-DD; noon-anchor to avoid TZ day-shift
    const gDateOnly = g.date.length > 10 ? g.date.slice(0, 10) : g.date
    const dateObj = new Date(gDateOnly + 'T12:00:00')
    const dateStr = dateObj.toLocaleDateString('de-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const infoList = el('div', 'cal-detail-info')
    infoList.appendChild(makeInfoRow('\uD83D\uDCC5', dateStr))
    if (g.time) infoList.appendChild(makeInfoRow('\u23F0', g.time.slice(0, 5)))

    // Hall
    const hall = g.hall
    const hallName = hall?.name
    const hallAddr = [hall?.address, hall?.city].filter(Boolean).join(', ')
    if (hallName) {
      infoList.appendChild(makeInfoRow('\uD83C\uDFE2', hallName))
    }
    if (hallAddr) {
      const mapsUrl = hall?.maps_url
        || `https://maps.google.com/?q=${encodeURIComponent(hallAddr)}`
      infoList.appendChild(makeInfoRowLink('\uD83D\uDCCD', hallAddr, mapsUrl))
    }

    // Status
    if (g.status === 'postponed') {
      infoList.appendChild(makeInfoRow('\u26A0\uFE0F', lang === 'de' ? 'Verschoben' : 'Postponed'))
    }

    modal.appendChild(infoList)

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) }
    }
    document.addEventListener('keydown', escHandler)
  }

  // -- Event detail modal --
  function showEventDetail(ev: CalendarEvent): void {
    const overlay = el('div', 'cal-modal-overlay')
    overlay.addEventListener('click', () => overlay.remove())

    const modal = el('div', 'cal-modal')
    modal.style.maxWidth = '420px'
    modal.addEventListener('click', (e) => e.stopPropagation())

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cal-modal-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => overlay.remove())
    modal.appendChild(closeBtn)

    // Category badge
    const hdr = el('div', 'cal-modal-row-header')
    hdr.style.marginBottom = 'var(--space-sm)'
    const catLabel = ev.category.charAt(0).toUpperCase() + ev.category.slice(1)
    hdr.appendChild(el('span', 'cal-tooltip-sport cal-tooltip-sport--event', catLabel))
    modal.appendChild(hdr)

    // Title
    modal.appendChild(el('h3', 'cal-modal-title', ev.title))

    // Info — resolve the event's Zurich calendar day (eventDateKey), then
    // noon-anchor that day so the long-format render stays on it in any timezone.
    const dateObj = new Date(eventDateKey(ev.date) + 'T12:00:00')
    const dateStr = dateObj.toLocaleDateString('de-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const infoList = el('div', 'cal-detail-info')
    infoList.appendChild(makeInfoRow('\uD83D\uDCC5', dateStr))
    if (ev.time) infoList.appendChild(makeInfoRow('\u23F0', ev.time.slice(0, 5)))
    if (ev.location) infoList.appendChild(makeInfoRow('\uD83D\uDCCD', ev.location))
    modal.appendChild(infoList)

    // Signup CTA + live count (OpnForm via Directus proxy)
    if (ev.signupUrl && /^https?:\/\//i.test(ev.signupUrl)) {
      const slugMatch = ev.signupUrl.match(/\/forms\/([a-z0-9][a-z0-9-]{0,80})/i)
      if (slugMatch) {
        const countEl = el('div', 'cal-modal-signup-count')
        countEl.dataset.state = 'loading'
        modal.appendChild(countEl)
        fetch(`${DIRECTUS_URL}/kscw/opnform/forms/${encodeURIComponent(slugMatch[1])}/count`)
          .then((r) => r.ok ? r.json() : Promise.reject(r.status))
          .then((d) => {
            const n = Number(d?.count ?? 0)
            countEl.dataset.state = 'ok'
            countEl.textContent = lang === 'de'
              ? `${n} Anmeldung${n === 1 ? '' : 'en'}`
              : `${n} sign-up${n === 1 ? '' : 's'}`
          })
          .catch(() => { countEl.remove() })
      }

      const cta = document.createElement('a')
      cta.className = 'btn btn-primary cal-modal-signup'
      cta.href = ev.signupUrl
      cta.target = '_blank'
      cta.rel = 'noopener noreferrer'
      cta.textContent = lang === 'de' ? 'Anmelden' : 'Sign up'
      modal.appendChild(cta)
    }

    // Description
    if (ev.body) {
      const desc = document.createElement('div')
      desc.className = 'cal-modal-desc'
      // Event bodies come from the lower-trust WiediSync members app. Render as
      // plain text (textContent) — never innerHTML — so no markup can execute.
      desc.textContent = ev.body
      modal.appendChild(desc)
    }

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) }
    }
    document.addEventListener('keydown', escHandler)
  }

  // -- Closure detail modal --
  function showClosureDetail(g: ClosureGroup): void {
    const overlay = el('div', 'cal-modal-overlay')
    overlay.addEventListener('click', () => overlay.remove())

    const modal = el('div', 'cal-modal')
    modal.style.maxWidth = '420px'
    modal.addEventListener('click', (e) => e.stopPropagation())

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cal-modal-close'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => overlay.remove())
    modal.appendChild(closeBtn)

    const hdr = el('div', 'cal-modal-row-header')
    hdr.style.marginBottom = 'var(--space-sm)'
    hdr.appendChild(el('span', 'cal-tooltip-sport cal-tooltip-sport--closure', closuresLabel))
    modal.appendChild(hdr)

    // Title: the closure reason (holiday name, tournament, …). Falls back to the
    // generic localized label when the reason is itself just "Halle geschlossen".
    modal.appendChild(el('h3', 'cal-modal-title', g.label))

    const infoList = el('div', 'cal-detail-info')
    infoList.appendChild(makeInfoRow('📅', formatClosureRange(g.startDate, g.endDate)))
    infoList.appendChild(makeInfoRow('🏢', `${affectedHallsLabel}: ${closureHallsLabel(g)}`))
    modal.appendChild(infoList)

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) }
    }
    document.addEventListener('keydown', escHandler)
  }

  // -- Info row helper --
  function makeInfoRow(icon: string, text: string): HTMLElement {
    const row = el('div', 'cal-detail-row')
    row.appendChild(el('span', 'cal-detail-icon', icon))
    row.appendChild(el('span', undefined, text))
    return row
  }

  function makeInfoRowLink(icon: string, text: string, href: string): HTMLElement {
    const row = el('div', 'cal-detail-row')
    row.appendChild(el('span', 'cal-detail-icon', icon))
    const link = document.createElement('a')
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.className = 'cal-detail-link'
    link.textContent = text
    row.appendChild(link)
    return row
  }

  // -- Close all filter dropdowns --
  function closeAllDropdowns(): void {
    container!.querySelectorAll('.cal-filter-btn.open').forEach(b => b.classList.remove('open'))
    container!.querySelectorAll('.cal-filter-dropdown').forEach(d => (d as HTMLElement).style.display = 'none')
  }

  // -- Render filter toolbar --
  function renderToolbar(): HTMLElement {
    const toolbar = el('div', 'cal-toolbar')

    const filters = el('div', 'cal-filters')

    // -- Type filter (dropdown index 0) --
    filters.appendChild(makeDropdown(
      filterType.size === 2 ? `${homeLabel}, ${awayLabel}` : filterType.has('home') ? homeLabel : awayLabel,
      filterType.size < 2,
      [
        { id: 'home', label: homeLabel, checked: filterType.has('home') },
        { id: 'away', label: awayLabel, checked: filterType.has('away') },
      ],
      [],
      (id, checked) => {
        if (checked) filterType.add(id); else filterType.delete(id)
        if (filterType.size === 0) filterType.add(id) // prevent empty
        applyFilterUpdate(0)
      }
    ))

    // -- Sport filter (dropdown index 1) --
    filters.appendChild(makeDropdown(
      filterSport.size === 2 ? 'Volleyball, Basketball' : filterSport.has('volleyball') ? 'Volleyball' : 'Basketball',
      filterSport.size < 2,
      [
        { id: 'volleyball', label: 'Volleyball', checked: filterSport.has('volleyball') },
        { id: 'basketball', label: 'Basketball', checked: filterSport.has('basketball') },
      ],
      [],
      (id, checked) => {
        if (checked) filterSport.add(id); else filterSport.delete(id)
        if (filterSport.size === 0) filterSport.add(id)
        applyFilterUpdate(1)
      }
    ))

    // -- Team filter (dropdown index 2) --
    const vbTeams = allTeams.filter(t => t.sport === 'volleyball')
    const bbTeams = allTeams.filter(t => t.sport === 'basketball')
    const teamOptions = [
      ...vbTeams.map(t => ({ id: String(t.id), label: t.name, checked: filterTeams.size === 0 || filterTeams.has(String(t.id)) })),
      ...bbTeams.map(t => ({ id: String(t.id), label: t.name, checked: filterTeams.size === 0 || filterTeams.has(String(t.id)) })),
    ]
    const teamGroups = [
      { label: 'Volleyball', startIdx: 0 },
      { label: 'Basketball', startIdx: vbTeams.length },
    ]
    const teamLabel = filterTeams.size === 0
      ? allTeamsLabel
      : `${filterTeams.size} Team${filterTeams.size > 1 ? 's' : ''}`

    filters.appendChild(makeDropdown(
      teamLabel,
      filterTeams.size > 0,
      teamOptions,
      teamGroups,
      (id, checked) => {
        if (checked) {
          filterTeams.add(id)
        } else {
          // If empty set (= all), populate with all team IDs first
          if (filterTeams.size === 0) {
            for (const t of allTeams) filterTeams.add(String(t.id))
          }
          filterTeams.delete(id)
        }
        // If all teams selected, reset to empty (= all)
        if (filterTeams.size >= allTeams.length) {
          filterTeams.clear()
        }
        applyFilterUpdate(2)
      }
    ))

    // -- Closure toggle (standalone button, not a dropdown so it doesn't shift
    //    the .cal-filter-wrap indices applyFilterUpdate restores) --
    const closureToggle = document.createElement('button')
    closureToggle.type = 'button'
    closureToggle.className = 'cal-filter-btn cal-closure-toggle' + (showClosures ? '' : ' is-off')
    closureToggle.setAttribute('aria-pressed', String(showClosures))
    closureToggle.appendChild(closureIcon())
    closureToggle.appendChild(document.createTextNode(closuresLabel))
    closureToggle.addEventListener('click', () => {
      showClosures = !showClosures
      applyFilterUpdate(-1)
    })
    filters.appendChild(closureToggle)

    // -- Reset button (only show when filters are active) --
    const hasActiveFilters = filterType.size < 2 || filterSport.size < 2 || filterTeams.size > 0 || !showClosures
    if (hasActiveFilters) {
      const resetBtn = document.createElement('button')
      resetBtn.type = 'button'
      resetBtn.className = 'cal-filter-btn cal-filter-reset'
      resetBtn.textContent = lang === 'de' ? 'Zurücksetzen' : 'Reset'
      resetBtn.addEventListener('click', () => {
        filterType = new Set(['home', 'away'])
        filterSport = new Set(['volleyball', 'basketball'])
        filterTeams.clear()
        showClosures = true
        applyFilterUpdate(-1)
      })
      filters.appendChild(resetBtn)
    }

    toolbar.appendChild(filters)

    // -- Subscribe button --
    const subBtn = document.createElement('button')
    subBtn.type = 'button'
    subBtn.className = 'cal-subscribe-btn'
    // Calendar download SVG icon
    const calSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    calSvg.setAttribute('width', '16')
    calSvg.setAttribute('height', '16')
    calSvg.setAttribute('viewBox', '0 0 24 24')
    calSvg.setAttribute('fill', 'none')
    calSvg.setAttribute('stroke', 'currentColor')
    calSvg.setAttribute('stroke-width', '2')
    calSvg.setAttribute('stroke-linecap', 'round')
    calSvg.setAttribute('stroke-linejoin', 'round')
    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p1.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4')
    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    p2.setAttribute('points', '7 10 12 15 17 10')
    const p3 = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    p3.setAttribute('x1', '12'); p3.setAttribute('x2', '12')
    p3.setAttribute('y1', '15'); p3.setAttribute('y2', '3')
    calSvg.append(p1, p2, p3)
    subBtn.appendChild(calSvg)
    subBtn.appendChild(document.createTextNode(subscribeTitle))
    subBtn.addEventListener('click', () => showSubscribeModal())
    toolbar.appendChild(subBtn)

    return toolbar
  }

  // -- Generic dropdown builder --
  function makeDropdown(
    label: string,
    isActive: boolean,
    options: { id: string; label: string; checked: boolean }[],
    groups: { label: string; startIdx: number }[],
    onChange: (id: string, checked: boolean) => void
  ): HTMLElement {
    const wrap = el('div', 'cal-filter-wrap')

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cal-filter-btn' + (isActive ? ' active' : '')
    btn.textContent = label
    const arrow = el('span', 'cal-filter-arrow', '\u25BC')
    btn.appendChild(arrow)

    const dropdown = el('div', 'cal-filter-dropdown')
    dropdown.style.display = 'none'

    let groupIdx = 0
    for (let i = 0; i < options.length; i++) {
      // Insert group label if needed
      if (groups.length > 0 && groupIdx < groups.length && i === groups[groupIdx].startIdx) {
        dropdown.appendChild(el('div', 'cal-filter-group-label', groups[groupIdx].label))
        groupIdx++
      }

      const opt = options[i]
      const lbl = document.createElement('label')
      lbl.className = 'cal-filter-option'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = opt.checked
      cb.addEventListener('change', () => {
        onChange(opt.id, cb.checked)
      })
      lbl.appendChild(cb)
      lbl.appendChild(document.createTextNode(opt.label))
      dropdown.appendChild(lbl)
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isOpen = btn.classList.contains('open')
      closeAllDropdowns()
      if (!isOpen) {
        btn.classList.add('open')
        dropdown.style.display = 'block'
      }
    })

    dropdown.addEventListener('click', (e) => e.stopPropagation())

    wrap.appendChild(btn)
    wrap.appendChild(dropdown)
    return wrap
  }

  // Track which dropdown index is open so we can restore after filter update
  let openDropdownIdx = -1

  // -- Lightweight re-render for filter changes (no re-fetch, keeps dropdown open) --
  function applyFilterUpdate(dropdownIdx: number): void {
    openDropdownIdx = dropdownIdx

    // Rebuild toolbar in place
    const oldToolbar = container!.querySelector('.cal-toolbar')
    const newToolbar = renderToolbar()
    if (oldToolbar) {
      oldToolbar.replaceWith(newToolbar)
    }

    // Restore dropdown that was open
    if (openDropdownIdx >= 0) {
      const wraps = newToolbar.querySelectorAll('.cal-filter-wrap')
      if (wraps[openDropdownIdx]) {
        const btn = wraps[openDropdownIdx].querySelector('.cal-filter-btn')
        const dd = wraps[openDropdownIdx].querySelector('.cal-filter-dropdown') as HTMLElement
        if (btn && dd) {
          btn.classList.add('open')
          dd.style.display = 'block'
        }
      }
    }

    // Rebuild grid in place (everything after toolbar)
    const toolbar = container!.querySelector('.cal-toolbar')
    while (toolbar && toolbar.nextSibling) {
      toolbar.nextSibling.remove()
    }
    buildCalendarGrid()

    openDropdownIdx = -1
  }

  // -- Full render (used for month navigation, language switch and initial load) --
  async function render(): Promise<void> {
    // Re-evaluate the active language + labels on every full render so a
    // client-side language switch is reflected without a page reload.
    computeLabels()
    // Network fetch happens only on the very first render. Month navigation and
    // language switches reuse the already-loaded dataset, so they rebuild
    // instantly without a loading spinner or refetch.
    if (!dataLoaded) {
      container!.textContent = ''
      container!.appendChild(el('div', 'cal-loading', loadingLabel))
      await fetchAllData()
      dataLoaded = true
    }

    container!.textContent = ''
    container!.appendChild(renderToolbar())
    buildCalendarGrid()
  }

  // -- Build calendar header + grid and append to container --
  function buildCalendarGrid(): void {
    const mStart = startOfMonth(currentMonth)
    const mEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(mStart)
    const gridEnd = endOfWeek(mEnd)
    const days = eachDay(gridStart, gridEnd)
    const today = new Date()

    const filteredGames = applyFilters(games)

    const gamesByDate = new Map<string, DirectusGame[]>()
    for (const g of filteredGames) {
      const key = g.date.slice(0, 10)
      if (!gamesByDate.has(key)) gamesByDate.set(key, [])
      gamesByDate.get(key)!.push(g)
    }

    const eventsByDate = new Map<string, CalendarEvent[]>()
    for (const ev of calEvents) {
      const key = eventDateKey(ev.date)
      if (!eventsByDate.has(key)) eventsByDate.set(key, [])
      eventsByDate.get(key)!.push(ev)
    }

    // Header: prev / month-year + today / next
    const header = el('div', 'cal-header')

    const prevBtn = document.createElement('button')
    prevBtn.type = 'button'
    prevBtn.className = 'cal-nav-btn'
    prevBtn.setAttribute('aria-label', 'Previous month')
    const prevSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    prevSvg.setAttribute('width', '20')
    prevSvg.setAttribute('height', '20')
    prevSvg.setAttribute('viewBox', '0 0 24 24')
    prevSvg.setAttribute('fill', 'none')
    prevSvg.setAttribute('stroke', 'currentColor')
    prevSvg.setAttribute('stroke-width', '2')
    prevSvg.setAttribute('stroke-linecap', 'round')
    prevSvg.setAttribute('stroke-linejoin', 'round')
    const prevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    prevPath.setAttribute('d', 'M15 19l-7-7 7-7')
    prevSvg.appendChild(prevPath)
    prevBtn.appendChild(prevSvg)
    prevBtn.addEventListener('click', () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
      render()
    })

    const nextBtn = document.createElement('button')
    nextBtn.type = 'button'
    nextBtn.className = 'cal-nav-btn'
    nextBtn.setAttribute('aria-label', 'Next month')
    const nextSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    nextSvg.setAttribute('width', '20')
    nextSvg.setAttribute('height', '20')
    nextSvg.setAttribute('viewBox', '0 0 24 24')
    nextSvg.setAttribute('fill', 'none')
    nextSvg.setAttribute('stroke', 'currentColor')
    nextSvg.setAttribute('stroke-width', '2')
    nextSvg.setAttribute('stroke-linecap', 'round')
    nextSvg.setAttribute('stroke-linejoin', 'round')
    const nextPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    nextPath.setAttribute('d', 'M9 5l7 7-7 7')
    nextSvg.appendChild(nextPath)
    nextBtn.appendChild(nextSvg)
    nextBtn.addEventListener('click', () => {
      currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
      render()
    })

    const titleEl = el('div', 'cal-title')
    titleEl.appendChild(el('span', 'cal-month-label', `${monthNames[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`))
    const todayBtn = document.createElement('button')
    todayBtn.type = 'button'
    todayBtn.className = 'cal-today-btn'
    todayBtn.textContent = todayLabel
    todayBtn.addEventListener('click', () => {
      currentMonth = new Date()
      currentMonth.setDate(1)
      render()
    })
    titleEl.appendChild(todayBtn)

    header.appendChild(prevBtn)
    header.appendChild(titleEl)
    header.appendChild(nextBtn)
    container!.appendChild(header)

    // Day-of-week headers
    const dow = el('div', 'cal-dow')
    for (const d of dayHeaders) {
      dow.appendChild(el('div', 'cal-dow-cell', d))
    }
    container!.appendChild(dow)

    // Grid
    const grid = el('div', 'cal-grid')

    for (const date of days) {
      const key = toDateKey(date)
      const inMonth = isSameMonth(date, currentMonth)
      const isToday_ = isSameDay(date, today)
      const dayGames = gamesByDate.get(key) || []

      const cell = el('div', 'cal-cell')
      if (!inMonth) cell.classList.add('cal-cell--outside')
      if (isToday_) cell.classList.add('cal-cell--today')

      const num = el('div', 'cal-day-num', String(date.getDate()))
      if (isToday_) num.classList.add('cal-day-num--today')
      cell.appendChild(num)

      const dayEvents = eventsByDate.get(key) || []
      const dayClosures = closureGroupsForDay(key)
      const hasClosure = inMonth && dayClosures.length > 0
      if (hasClosure) cell.classList.add('cal-cell--closed')

      // Closures fill the whole cell (red block below); only games + events are
      // capped chips. They still render on a closed day so away games etc. aren't
      // hidden by the closure of a KSCW hall.
      const chipEntries = dayGames.length + dayEvents.length

      if (inMonth && chipEntries > 0) {
        const entriesDiv = el('div', 'cal-entries')
        const maxVisible = window.innerWidth < 640 ? 2 : 3
        let count = 0

        for (const g of dayGames) {
          if (count >= maxVisible) break
          entriesDiv.appendChild(gameChip(g))
          count++
        }

        for (const ev of dayEvents) {
          if (count >= maxVisible) break
          entriesDiv.appendChild(eventChip(ev))
          count++
        }

        const overflow = chipEntries - maxVisible
        if (overflow > 0) {
          const more = document.createElement('button')
          more.type = 'button'
          more.className = 'cal-overflow'
          more.textContent = `+${overflow}`
          more.addEventListener('click', (e) => {
            e.stopPropagation()
            showDayModal(date, dayGames, dayEvents, dayClosures)
          })
          entriesDiv.appendChild(more)
        }

        cell.appendChild(entriesDiv)
      }

      if (hasClosure) {
        cell.appendChild(closureBlock(date, dayGames, dayEvents, dayClosures))
      }

      grid.appendChild(cell)
    }

    container!.appendChild(grid)
  }

  // -- Day overflow modal --
  function showDayModal(date: Date, dayGames: DirectusGame[], dayEvents: CalendarEvent[] = [], dayClosures: ClosureGroup[] = []): void {
    const overlay = el('div', 'cal-modal-overlay')
    overlay.addEventListener('click', () => overlay.remove())

    const modal = el('div', 'cal-modal')
    modal.addEventListener('click', (e) => e.stopPropagation())

    const dateStr = date.toLocaleDateString('de-CH', {
      weekday: 'long', day: 'numeric', month: 'long',
    })

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cal-modal-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => overlay.remove())

    modal.appendChild(closeBtn)
    modal.appendChild(el('h3', 'cal-modal-title', dateStr))

    for (const g of dayGames) {
      const row = el('div', 'cal-modal-row')

      const isHome = g.type === 'home'
      const isBB = getTeamSport(g) === 'basketball'
      const typeLabel = isHome ? homeLabel : awayLabel

      const rowHdr = el('div', 'cal-modal-row-header')
      rowHdr.appendChild(el('span', `cal-tooltip-sport cal-tooltip-sport--${isBB ? 'bb' : 'vb'}`, isBB ? 'BB' : 'VB'))
      rowHdr.appendChild(el('span', `cal-tooltip-type cal-tooltip-type--${isHome ? 'home' : 'away'}`, typeLabel))
      if (g.time) rowHdr.appendChild(el('span', 'cal-modal-time', g.time.slice(0, 5)))
      row.appendChild(rowHdr)

      let teamsText = `${g.home_team} vs ${g.away_team}`
      if (g.status === 'completed' && (g.home_score || g.away_score)) {
        teamsText += ` \u2014 ${g.home_score}:${g.away_score}`
      }
      row.appendChild(el('div', 'cal-modal-teams', teamsText))

      const dHall = g.hall
      const dHallText = [dHall?.name, dHall?.city].filter(Boolean).join(', ')
      if (dHallText) {
        row.appendChild(el('div', 'cal-modal-hall', dHallText))
      }

      modal.appendChild(row)
    }

    for (const ev of dayEvents) {
      const row = el('div', 'cal-modal-row cal-modal-row--event')

      const rowHdr = el('div', 'cal-modal-row-header')
      const catLabel = ev.category.charAt(0).toUpperCase() + ev.category.slice(1)
      rowHdr.appendChild(el('span', 'cal-tooltip-sport cal-tooltip-sport--event', catLabel))
      if (ev.time) rowHdr.appendChild(el('span', 'cal-modal-time', ev.time.slice(0, 5)))
      row.appendChild(rowHdr)

      row.appendChild(el('div', 'cal-modal-teams', ev.title))

      if (ev.location) {
        row.appendChild(el('div', 'cal-modal-hall', ev.location))
      }

      if (ev.body) {
        const desc = document.createElement('div')
        desc.className = 'cal-modal-desc'
        // Event bodies come from the lower-trust WiediSync members app. Render as
        // plain text (textContent) — never innerHTML — so no markup can execute.
        desc.textContent = ev.body
        row.appendChild(desc)
      }

      modal.appendChild(row)
    }

    for (const c of dayClosures) {
      const row = el('div', 'cal-modal-row cal-modal-row--closure')

      const rowHdr = el('div', 'cal-modal-row-header')
      rowHdr.appendChild(el('span', 'cal-tooltip-sport cal-tooltip-sport--closure', closuresLabel))
      row.appendChild(rowHdr)

      row.appendChild(el('div', 'cal-modal-teams', c.label))
      row.appendChild(el('div', 'cal-modal-hall', formatClosureRange(c.startDate, c.endDate)))
      row.appendChild(el('div', 'cal-modal-hall', `${affectedHallsLabel}: ${closureHallsLabel(c)}`))

      modal.appendChild(row)
    }

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) }
    }
    document.addEventListener('keydown', escHandler)
  }

  // -- iCal Subscribe Modal --
  function showSubscribeModal(): void {
    closeAllDropdowns()

    const overlay = el('div', 'cal-modal-overlay')
    overlay.addEventListener('click', () => overlay.remove())

    const modal = el('div', 'cal-modal')
    modal.style.maxWidth = '520px'
    modal.addEventListener('click', (e) => e.stopPropagation())

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'cal-modal-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('click', () => overlay.remove())
    modal.appendChild(closeBtn)

    modal.appendChild(el('h3', 'cal-modal-title', subscribeTitle))

    // State for subscribe modal
    const subSources = { home: true, away: true, events: true, closures: true }
    const subSports = { volleyball: true, basketball: true }
    const subTeams = new Set<string>() // tracks EXCLUDED team IDs

    // -- Sources section --
    const srcSection = el('div', 'cal-sub-section')
    srcSection.appendChild(el('div', 'cal-sub-section-title', lang === 'de' ? 'Quellen' : 'Sources'))
    const srcChecks = el('div', 'cal-sub-checks')
    srcChecks.appendChild(makeCheckLabel(homeGamesLabel, true, (c) => { subSources.home = c }))
    srcChecks.appendChild(makeCheckLabel(awayGamesLabel, true, (c) => { subSources.away = c }))
    srcChecks.appendChild(makeCheckLabel(eventsLabel, true, (c) => { subSources.events = c }))
    srcChecks.appendChild(makeCheckLabel(closuresLabel, true, (c) => { subSources.closures = c }))
    srcSection.appendChild(srcChecks)
    modal.appendChild(srcSection)

    // -- Sport section --
    const sportSection = el('div', 'cal-sub-section')
    sportSection.appendChild(el('div', 'cal-sub-section-title', lang === 'de' ? 'Sportart' : 'Sport'))
    const sportChecks = el('div', 'cal-sub-checks')
    sportChecks.appendChild(makeCheckLabel('Volleyball', true, (c) => { subSports.volleyball = c }))
    sportChecks.appendChild(makeCheckLabel('Basketball', true, (c) => { subSports.basketball = c }))
    sportSection.appendChild(sportChecks)
    modal.appendChild(sportSection)

    // -- Teams section --
    const teamSection = el('div', 'cal-sub-section')
    teamSection.appendChild(el('div', 'cal-sub-section-title', 'Teams'))
    const teamDiv = el('div', 'cal-sub-teams')

    const vbTeams = allTeams.filter(t => t.sport === 'volleyball')
    const bbTeams = allTeams.filter(t => t.sport === 'basketball')

    if (vbTeams.length > 0) {
      teamDiv.appendChild(el('div', 'cal-filter-group-label', 'Volleyball'))
      for (const t of vbTeams) {
        teamDiv.appendChild(makeCheckLabel(t.name, true, (c) => {
          if (c) subTeams.delete(String(t.id)); else subTeams.add(String(t.id))
        }))
      }
    }
    if (bbTeams.length > 0) {
      teamDiv.appendChild(el('div', 'cal-filter-group-label', 'Basketball'))
      for (const t of bbTeams) {
        teamDiv.appendChild(makeCheckLabel(t.name, true, (c) => {
          if (c) subTeams.delete(String(t.id)); else subTeams.add(String(t.id))
        }))
      }
    }

    teamSection.appendChild(teamDiv)
    modal.appendChild(teamSection)

    // -- Action buttons --
    const actions = el('div', 'cal-sub-actions')

    const subBtnEl = document.createElement('button')
    subBtnEl.type = 'button'
    subBtnEl.className = 'btn btn-primary'
    subBtnEl.textContent = subscribeLabel
    subBtnEl.addEventListener('click', () => {
      const url = buildIcalUrl('webcal', subSources, subSports, subTeams)
      window.location.href = url
    })

    const dlBtn = document.createElement('button')
    dlBtn.type = 'button'
    dlBtn.className = 'btn btn-outline'
    dlBtn.textContent = downloadLabel
    dlBtn.addEventListener('click', () => {
      const url = buildIcalUrl('https', subSources, subSports, subTeams)
      window.open(url, '_blank')
    })

    actions.appendChild(subBtnEl)
    actions.appendChild(dlBtn)
    modal.appendChild(actions)

    overlay.appendChild(modal)
    document.body.appendChild(overlay)

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler) }
    }
    document.addEventListener('keydown', escHandler)
  }

  function makeCheckLabel(text: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
    const lbl = document.createElement('label')
    lbl.className = 'cal-sub-check'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = checked
    cb.addEventListener('change', () => onChange(cb.checked))
    lbl.appendChild(cb)
    lbl.appendChild(document.createTextNode(text))
    return lbl
  }

  function buildIcalUrl(
    protocol: string,
    sources: { home: boolean; away: boolean; events: boolean; closures: boolean },
    sports: { volleyball: boolean; basketball: boolean },
    excludedTeams: Set<string>
  ): string {
    const srcParts: string[] = []
    if (sources.home) srcParts.push('games-home')
    if (sources.away) srcParts.push('games-away')
    if (sources.events) srcParts.push('events')
    if (sources.closures) srcParts.push('closures')

    const params = new URLSearchParams()
    // Always send the explicit allowlist: the feed defaults to games-only when
    // `source` is omitted, which would silently drop events and closures.
    if (srcParts.length > 0) {
      params.set('source', srcParts.join(','))
    }

    // Sport-specific route (the feed filters games by sport via the path; events
    // and closures are returned regardless, so combining them is safe).
    const onlyVB = sports.volleyball && !sports.basketball
    const onlyBB = sports.basketball && !sports.volleyball
    let path = '/kscw/ical'
    if (onlyVB) path = '/kscw/ical/volleyball'
    else if (onlyBB) path = '/kscw/ical/basketball'

    // Team filter: include only non-excluded teams
    if (excludedTeams.size > 0) {
      const included = allTeams
        .filter(t => !excludedTeams.has(String(t.id)))
        .map(t => String(t.id))
      if (included.length > 0 && included.length < allTeams.length) {
        params.set('team', included.join(','))
      }
    }

    const baseUrl = DIRECTUS_URL.replace('https://', '')
    const qs = params.toString()
    return `${protocol}://${baseUrl}${path}${qs ? '?' + qs : ''}`
  }

  // Close dropdowns on outside click
  document.addEventListener('click', () => closeAllDropdowns())

  // Re-render in the new language when the user switches it client-side.
  // `render()` re-runs computeLabels() and rebuilds the toolbar + grid; the
  // dataLoaded flag keeps it from refetching, and calEvents stays cached, so
  // this is a pure relabel + rebuild.
  document.addEventListener('langChanged', () => { render() })

  // Initial load — wait for the i18n engine so the very first render is in the
  // active language (it may be English from a stored preference). Falls back to
  // immediate render if i18n is unavailable.
  const start = () => fetchTeams().then(() => render())
  const ready = (window as any).i18nReady
  if (ready && typeof ready.then === 'function') {
    ready.then(start, start)
  } else {
    start()
  }
}
