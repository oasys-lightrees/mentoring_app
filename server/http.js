/**
 * HTTP layer (Web-standard Request → Response), shared by the Supabase Edge Function and the tests.
 *   POST <url>   body: JSON { action, token?, ... }  (sent as text/plain so browsers skip the CORS preflight)
 *   GET  <url>   health check: { ok, service, version }
 * CORS: allowed origins come from ALLOWED_ORIGINS (comma-separated); "*" or empty allows any origin, which is safe
 * here because sign-in uses a bearer token in the body, never cookies.
 */
const MAX_BODY = 2 * 1024 * 1024; // 2 MB: 500 records per batch fits comfortably

export function createHandler(api, opts) {
  opts = opts || {};
  const allowed = String(opts.allowedOrigins || '').split(',').map(function (s) { return s.trim().replace(/\/$/, ''); }).filter(Boolean);
  const anyOrigin = !allowed.length || allowed.indexOf('*') >= 0;
  const service = opts.service || 'lightech-mentoring-app';

  function cors(req) {
    const origin = req.headers.get('origin') || '';
    const h = { 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
    if (anyOrigin) h['Access-Control-Allow-Origin'] = '*';
    else if (allowed.indexOf(origin) >= 0) h['Access-Control-Allow-Origin'] = origin;
    return h;
  }
  function json(req, status, obj) {
    return new Response(JSON.stringify(obj), { status: status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, cors(req)) });
  }

  return async function handle(req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method === 'GET') return json(req, 200, { ok: true, service: service, version: opts.version || '' });
    if (req.method !== 'POST') return json(req, 405, { ok: false, error: 'invalid', message: 'Use POST.' });
    const origin = req.headers.get('origin');
    if (origin && !anyOrigin && allowed.indexOf(origin) < 0) return json(req, 403, { ok: false, error: 'forbidden', message: 'Origin not allowed.' });
    let text = '';
    try { text = await req.text(); } catch (e) { return json(req, 400, { ok: false, error: 'invalid', message: 'Bad request.' }); }
    if (text.length > MAX_BODY) return json(req, 413, { ok: false, error: 'invalid', message: 'Request too large.' });
    let body;
    try { body = JSON.parse(text || '{}'); } catch (e) { return json(req, 200, { ok: false, error: 'invalid', message: 'Bad JSON.' }); }
    const res = await api(body);
    return json(req, 200, res);
  };
}
