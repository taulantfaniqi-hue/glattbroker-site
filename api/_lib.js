// Gemeinsame Helfer für die Vercel-Funktionen (Firmenkonto + Host).
// Datenhaltung: Upstash Redis über die REST-API (keine Abhängigkeiten).
import crypto from 'node:crypto';

const P = 'gb:'; // Schlüssel-Präfix, damit die DB mit anderen Projekten geteilt werden kann

// ─── Redis ───────────────────────────────────────────────────────────
function redisConf() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new HttpError(503, 'Datenbank ist noch nicht verbunden (Upstash Redis).');
  return { url: url.replace(/\/$/, ''), token };
}

export async function redis(...cmd) {
  const { url, token } = redisConf();
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
  return j.result;
}

export async function pipeline(cmds) {
  if (!cmds.length) return [];
  const { url, token } = redisConf();
  const r = await fetch(url + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  const j = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(j)) throw new Error('Redis-Pipeline: ' + r.status);
  return j.map((x) => {
    if (x.error) throw new Error('Redis: ' + x.error);
    return x.result;
  });
}

export const key = {
  firmen: () => P + 'firmen',
  firma: (slug) => P + 'firma:' + slug,
  firmaUsers: (slug) => P + 'firma:' + slug + ':users',
  jahre: (slug) => P + 'jahre:' + slug,
  buch: (slug, jahr) => P + 'buch:' + slug + ':' + jahr,
  belege: (slug, jahr) => P + 'belege:' + slug + ':' + jahr,   // HASH id → Metadaten
  belegDatei: (slug, id) => P + 'belegdatei:' + slug + ':' + id, // Base64-Inhalt
  user: (email) => P + 'user:' + email,
  rate: (what, ip) => P + 'rl:' + what + ':' + ip,
};

export async function getJSON(k) {
  const v = await redis('GET', k);
  return v ? JSON.parse(v) : null;
}

// ─── Fehler / Antworten ──────────────────────────────────────────────
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function handler(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const ct = String(req.headers['content-type'] || '');
        if (!ct.includes('application/json')) throw new HttpError(415, 'JSON erwartet.');
      }
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? 'Interner Fehler.' : e.message });
    }
  };
}

// ─── Sessions (signierte Cookies) ────────────────────────────────────
const COOKIE = { firma: 'gb_firma', host: 'gb_host' };
const MAX_AGE = { firma: 60 * 60 * 24 * 7, host: 60 * 60 * 12 };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new HttpError(503, 'SESSION_SECRET ist nicht gesetzt.');
  return s;
}

const b64u = (b) => Buffer.from(b).toString('base64url');

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (!safeEqual(mac, expect)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? p : null;
}

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

export function setSession(res, kind, data) {
  const token = sign({ ...data, kind, exp: Date.now() + MAX_AGE[kind] * 1000 });
  appendCookie(res, `${COOKIE[kind]}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE[kind]}`);
}

export function clearSession(res, kind) {
  appendCookie(res, `${COOKIE[kind]}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function appendCookie(res, c) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [].concat(prev, c) : c);
}

export function session(req, kind) {
  const p = verify(cookies(req)[COOKIE[kind]]);
  return p && p.kind === kind ? p : null;
}

export function requireFirma(req) {
  const s = session(req, 'firma');
  if (!s) throw new HttpError(401, 'Bitte anmelden.');
  return s;
}

// Host: Cookie-Login im Browser oder API-Schlüssel (Import-Werkzeug)
export function requireHost(req) {
  const auth = String(req.headers.authorization || '');
  const apiKey = process.env.HOST_API_KEY;
  if (apiKey && auth.startsWith('Bearer ') && safeEqual(auth.slice(7), apiKey)) return { via: 'api' };
  const s = session(req, 'host');
  if (!s) throw new HttpError(401, 'Bitte als Host anmelden.');
  return s;
}

// ─── Passwörter ──────────────────────────────────────────────────────
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function checkPassword(pw, stored) {
  const [alg, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 32);
  return crypto.timingSafeEqual(h, Buffer.from(hash, 'base64'));
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ─── Login-Bremse ────────────────────────────────────────────────────
export async function rateLimit(req, what, max = 10, windowSec = 900) {
  const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();
  const k = key.rate(what, ip);
  const [n] = await pipeline([['INCR', k], ['EXPIRE', k, windowSec, 'NX']]);
  if (n > max) throw new HttpError(429, 'Zu viele Versuche. Bitte in 15 Minuten erneut probieren.');
}

// ─── Validierung ─────────────────────────────────────────────────────
export const normEmail = (e) => String(e || '').trim().toLowerCase();

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function cleanJahr(j) {
  const n = Number(j);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new HttpError(400, 'Ungültiges Jahr.');
  return n;
}

// ─── Belege ──────────────────────────────────────────────────────────
export const BELEG_TYPEN = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/gif': 'gif',
};
export const BELEG_MAX = 3 * 1024 * 1024; // 3 MB pro Datei (Vercel-Limit 4.5 MB inkl. Base64)

export function cleanBelegMeta(x) {
  const d = String(x.datum || x.d || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Belegdatum fehlt (JJJJ-MM-TT).');
  const betrag = x.betrag === '' || x.betrag == null ? null : Math.round(Math.abs(Number(x.betrag)) * 100) / 100;
  return {
    datum: d,
    typ: x.typ === 'E' || x.typ === 'einnahme' ? 'E' : 'A',
    kategorie: String(x.kategorie || '').slice(0, 60),
    betrag: Number.isFinite(betrag) ? betrag : null,
    lieferant: String(x.lieferant || '').slice(0, 80),
    titel: String(x.titel || '').slice(0, 120),
  };
}

// Eine Buchung: { d: 'YYYY-MM-DD', b: Betrag (positiv), k: Kategorie, l: Lieferant/Ort, t: Text, typ: 'A' | 'E' }
export function cleanBuchung(x) {
  const d = String(x.d || x.datum || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const b = Math.round(Math.abs(Number(x.b ?? x.betrag)) * 100) / 100;
  if (!Number.isFinite(b) || b === 0) return null;
  const typ = (x.typ === 'E' || x.typ === 'einnahme') ? 'E' : 'A';
  return {
    d, b, typ,
    k: String(x.k || x.kategorie || 'Sonstiges').slice(0, 60),
    l: String(x.l || x.lieferant || '').slice(0, 80),
    t: String(x.t || x.text || '').slice(0, 160),
  };
}
