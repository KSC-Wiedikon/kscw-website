/**
 * KSCW Website — Client Error Logger
 *
 * Catches ALL JS errors (unhandled exceptions, promise rejections, fetch failures)
 * and sends them to the Directus JSONL error log via POST /kscw/client-error.
 *
 * This makes website errors visible alongside wiedisync errors in a single
 * admin API endpoint: GET /kscw/admin/error-logs?project=kscw-website
 */
;(function () {
  'use strict'

  var API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://directus-dev.kscw.ch'
    : 'https://directus.kscw.ch'

  var ENDPOINT = API_URL + '/kscw/client-error'
  var sent = 0
  var MAX_PER_PAGE = 20 // don't flood the endpoint

  function send(entry) {
    if (sent >= MAX_PER_PAGE) return
    sent++
    try {
      entry.project = 'kscw-website'
      entry.source = 'frontend'
      entry.page = window.location.pathname
      entry.userAgent = navigator.userAgent
      // sendBeacon with a raw string sets Content-Type: text/plain, which the
      // Directus /client-error endpoint (global express.json parser) drops on the
      // floor — wrap in a Blob with an explicit JSON type so the body is parsed.
      navigator.sendBeacon
        ? navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(entry)], { type: 'application/json' }))
        : fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry),
            keepalive: true,
          }).catch(function () {})
    } catch (_) { /* never throw from error logger */ }
  }

  // ── Unhandled JS errors ──────────────────────────────────────────
  window.addEventListener('error', function (e) {
    send({
      event: 'unhandled_error',
      error: e.message || 'Unknown error',
      type: 'Error',
      stack: e.filename
        ? e.filename + ':' + e.lineno + ':' + e.colno
        : null,
    })
  })

  // ── Unhandled promise rejections ─────────────────────────────────
  window.addEventListener('unhandledrejection', function (e) {
    var msg = e.reason instanceof Error ? e.reason.message : String(e.reason || 'Promise rejected')
    var stack = e.reason instanceof Error ? e.reason.stack : null
    send({
      event: 'unhandled_rejection',
      error: msg,
      type: 'UnhandledRejection',
      stack: stack ? stack.slice(0, 2000) : null,
    })
  })

  // Strip the query string before anything is logged. `network_error` already
  // passed the ingest guard, so `doc-status?reference=…&email=…` was shipping an
  // applicant's reference and email address into a 30-day JSONL log on any
  // offline/CORS failure (audit 2026-08-08, finding 43). The path is what
  // identifies the failing endpoint; the parameters never were.
  function cleanEndpoint(url) {
    var path = String(url).replace(API_URL, '')
    var q = path.indexOf('?')
    return q === -1 ? path : path.slice(0, q)
  }

  // ── Patch fetch to catch API errors ──────────────────────────────
  var origFetch = window.fetch
  window.fetch = function (url, opts) {
    return origFetch.apply(this, arguments).then(function (res) {
      // Only log Directus API errors (not external resources)
      if (!res.ok && typeof url === 'string' && url.indexOf('directus') !== -1) {
        var endpoint = cleanEndpoint(url)
        send({
          event: 'api_error',
          endpoint: endpoint,
          method: (opts && opts.method) || 'GET',
          status: res.status,
          // ⚠ `type` and `error` are what make this survive ingestion. The
          // backend drops any body with none of error/stack/type/responseBody
          // (index.js: `return res.status(204).end()`), and api_error was the
          // ONLY class that carried none of them — so every one of these was
          // silently discarded, and the beacon is fire-and-forget so the
          // rejection was invisible. That mattered because team-page.js throws
          // on !r.ok and swallows it with a bare .catch: no unhandledrejection,
          // no console.error, and Sentry's CDN bundle only installs global
          // handlers — this beacon was the sole telemetry for a revoked
          // anonymous permission that only the static site exercises.
          type: 'ApiError',
          error: 'HTTP ' + res.status + ' ' + endpoint,
        })
      }
      return res
    }).catch(function (err) {
      // Network errors (offline, CORS, DNS)
      if (typeof url === 'string' && url.indexOf('directus') !== -1) {
        send({
          event: 'network_error',
          endpoint: cleanEndpoint(url),
          method: (opts && opts.method) || 'GET',
          error: err.message || 'Network error',
        })
      }
      throw err
    })
  }

  // ── Console.error capture (optional — catches library errors) ────
  var origConsoleError = console.error
  console.error = function () {
    origConsoleError.apply(console, arguments)
    var msg = Array.prototype.map.call(arguments, function (a) {
      return typeof a === 'string' ? a : (a instanceof Error ? a.message : '')
    }).join(' ').slice(0, 500)
    if (msg && msg.indexOf('[error-logger]') === -1) {
      send({
        event: 'console_error',
        error: msg,
      })
    }
  }
})()
