/**
 * Directus REST API — thin, typed fetch wrapper.
 * No @directus/sdk dependency — plain fetch only.
 *
 * All data access for the kscw-website should go through this module.
 */

// ── URL detection ──────────────────────────────────────────────────────────

export function getDirectusUrl(): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1') return 'https://directus-dev.kscw.ch'
    return 'https://directus.kscw.ch'
  }
  return import.meta.env.DIRECTUS_URL || 'https://directus.kscw.ch'
}

/** Build-time constant — use getDirectusUrl() for runtime-detected URL. */
export const DIRECTUS_URL = getDirectusUrl()

/** The Directus a build must not silently render the site without. */
const PROD_DIRECTUS = 'https://directus.kscw.ch'

/**
 * True when a failed build-time fetch has to ABORT the build rather than let the
 * page render without its data.
 *
 * The build-time fetches all degrade gracefully — a page that loses Directus
 * still ships, with its static fallback, and the client-side refresh usually
 * repairs it in the browser. That is the right behaviour everywhere except one
 * place: the production build. On 13.08.2026 the prod build's three `teams`
 * queries came back "You don't have permission to access collection teams", the
 * basketball youth page shipped ten generic fallback cards — no squad names, no
 * coaches, no training times, plus a card for a team that no longer exists — and
 * it stayed live for an hour, because a degraded page looks exactly like a
 * successful deploy. Failing here keeps the LAST GOOD deploy up instead.
 *
 * Deliberately narrow, so this cannot break the work it is meant to protect:
 *   • `astro dev` keeps degrading — an offline afternoon must not stop the dev server.
 *   • dev/preview builds keep degrading. They target directus-dev, where the
 *     anonymous role is restricted by design ("items is a restricted resource"),
 *     so a strict dev build would fail every single time and teach everyone to
 *     ignore it.
 *   • DIRECTUS_STRICT=0 turns it off, for the day a prod deploy has to go out
 *     while Directus is down.
 */
export function strictBuildData(): boolean {
  if (typeof window !== 'undefined') return false
  if (!import.meta.env.PROD) return false
  if (import.meta.env.DIRECTUS_STRICT === '0') return false
  return getDirectusUrl() === PROD_DIRECTUS
}

// ── Query param helpers ────────────────────────────────────────────────────

interface QueryParams {
  filter?: Record<string, unknown>
  sort?: string[]
  fields?: string[]
  limit?: number
  offset?: number
}

function buildQueryString(params: QueryParams): string {
  const parts: string[] = []

  if (params.filter) {
    parts.push(`filter=${encodeURIComponent(JSON.stringify(params.filter))}`)
  }
  if (params.sort?.length) {
    parts.push(`sort=${encodeURIComponent(params.sort.join(','))}`)
  }
  if (params.fields?.length) {
    parts.push(`fields=${encodeURIComponent(params.fields.join(','))}`)
  }
  if (params.limit !== undefined) {
    parts.push(`limit=${params.limit}`)
  }
  if (params.offset !== undefined) {
    parts.push(`offset=${params.offset}`)
  }

  return parts.length ? `?${parts.join('&')}` : ''
}

// ── Core fetch ─────────────────────────────────────────────────────────────

export interface DirectusFetchOptions extends RequestInit {
  token?: string
}

/**
 * Core JSON fetch wrapper. All requests go through here except FormData uploads.
 * Sets Content-Type: application/json and unwraps { data: T }.
 */
export async function directusFetch<T>(
  path: string,
  options: DirectusFetchOptions = {},
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options
  const url = `${getDirectusUrl()}${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extraHeaders as Record<string, string> | undefined ?? {}),
  }

  const res = await fetch(url, { ...rest, headers })

  if (!res.ok) {
    let message = `Directus ${path}: ${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.errors?.[0]?.message) message = body.errors[0].message
    } catch { /* ignore parse error */ }
    throw new Error(message)
  }

  // Some responses (DELETE 204) have no body
  if (res.status === 204) return undefined as unknown as T

  const json = await res.json() as { data: T }
  return json.data
}

// ── Collection helpers ─────────────────────────────────────────────────────

/** Fetch a list of items from a collection. */
export async function fetchItems<T = Record<string, unknown>>(
  collection: string,
  params: QueryParams = {},
): Promise<T[]> {
  const qs = buildQueryString(params)
  return directusFetch<T[]>(`/items/${collection}${qs}`)
}

/** Fetch all items with limit: -1 (no pagination). */
export async function fetchAllItems<T = Record<string, unknown>>(
  collection: string,
  params: Omit<QueryParams, 'limit' | 'offset'> = {},
): Promise<T[]> {
  return fetchItems<T>(collection, { ...params, limit: -1 })
}

/** Fetch a single item by ID. */
export async function fetchItem<T = Record<string, unknown>>(
  collection: string,
  id: string | number,
  fields?: string[],
): Promise<T> {
  const qs = fields?.length ? buildQueryString({ fields }) : ''
  return directusFetch<T>(`/items/${collection}/${id}${qs}`)
}

// ── Mutation helpers ───────────────────────────────────────────────────────

/**
 * Create a record. Supports FormData for file uploads — when data is FormData,
 * the Content-Type header is omitted so the browser sets the multipart boundary.
 */
export async function createRecord<T = Record<string, unknown>>(
  collection: string,
  data: Record<string, unknown> | FormData,
  token: string,
): Promise<T> {
  const url = `${getDirectusUrl()}/items/${collection}`
  const isFormData = data instanceof FormData

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: isFormData ? data : JSON.stringify(data),
  })

  if (!res.ok) {
    let message = `Directus POST /items/${collection}: ${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.errors?.[0]?.message) message = body.errors[0].message
    } catch { /* ignore */ }
    throw new Error(message)
  }

  const json = await res.json() as { data: T }
  return json.data
}

/**
 * Update a record by ID. Supports FormData for file uploads.
 */
export async function updateRecord<T = Record<string, unknown>>(
  collection: string,
  id: string | number,
  data: Record<string, unknown> | FormData,
  token: string,
): Promise<T> {
  const url = `${getDirectusUrl()}/items/${collection}/${id}`
  const isFormData = data instanceof FormData

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: isFormData ? data : JSON.stringify(data),
  })

  if (!res.ok) {
    let message = `Directus PATCH /items/${collection}/${id}: ${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.errors?.[0]?.message) message = body.errors[0].message
    } catch { /* ignore */ }
    throw new Error(message)
  }

  const json = await res.json() as { data: T }
  return json.data
}

/** Delete a record by ID. */
export async function deleteRecord(
  collection: string,
  id: string | number,
  token: string,
): Promise<void> {
  await directusFetch<void>(`/items/${collection}/${id}`, {
    method: 'DELETE',
    token,
  })
}

// ── Auth ───────────────────────────────────────────────────────────────────

export interface DirectusAuthResponse {
  access_token: string
  refresh_token: string
  expires: number
}

/** POST /auth/login */
export async function login(
  email: string,
  password: string,
): Promise<DirectusAuthResponse> {
  return directusFetch<DirectusAuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

/** POST /auth/refresh */
export async function refreshToken(
  token: string,
): Promise<DirectusAuthResponse> {
  return directusFetch<DirectusAuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: token }),
  })
}

export interface DirectusUser {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  role: {
    name: string
  } | null
  [key: string]: unknown
}

/** GET /users/me — includes role.name expansion. */
export async function getCurrentUser(token: string): Promise<DirectusUser> {
  return directusFetch<DirectusUser>('/users/me?fields=*,role.name', { token })
}

// ── Assets ─────────────────────────────────────────────────────────────────

/**
 * Construct a Directus asset URL for a file ID.
 * @param fileId  Directus file UUID
 * @param transforms  Optional query string (e.g. "width=640&quality=80")
 */
export function assetUrl(
  fileId: string | null | undefined,
  transforms?: string,
): string {
  if (!fileId) return ''
  const base = `${getDirectusUrl()}/assets/${fileId}`
  return transforms ? `${base}?${transforms}` : base
}

// ── Custom KSCW endpoints ──────────────────────────────────────────────────

/**
 * Call a custom KSCW endpoint at /kscw/*.
 * Auth token is optional — pass it when the endpoint requires authentication.
 */
export async function kscwApi<T = unknown>(
  path: string,
  options: {
    method?: string
    body?: unknown
    token?: string
    headers?: Record<string, string>
  } = {},
): Promise<T> {
  const url = `${getDirectusUrl()}/kscw${path}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...options.headers,
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })

  if (!res.ok) throw new Error(`KSCW API ${path}: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}
