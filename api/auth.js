// /api/auth?action=login | host-login | logout | me
import {
  handler, HttpError, getJSON, key, normEmail, rateLimit,
  checkPassword, safeEqual, setSession, clearSession, session,
} from './_lib.js';

export default handler(async (req, res) => {
  const action = req.query.action;

  if (action === 'me' && req.method === 'GET') {
    const kind = req.query.kind === 'host' ? 'host' : 'firma';
    const s = session(req, kind);
    if (!s) throw new HttpError(401, 'Nicht angemeldet.');
    return kind === 'host' ? { host: true } : { email: s.email, firma: s.firma, name: s.name };
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');
  const body = req.body || {};

  if (action === 'login') {
    await rateLimit(req, 'firma');
    const email = normEmail(body.email);
    const user = email ? await getJSON(key.user(email)) : null;
    if (!user || !checkPassword(String(body.passwort || ''), user.pw)) {
      throw new HttpError(401, 'E-Mail oder Passwort ist falsch.');
    }
    const firma = await getJSON(key.firma(user.firma));
    if (!firma) throw new HttpError(403, 'Dieses Firmenkonto ist nicht mehr aktiv.');
    setSession(res, 'firma', { email, firma: user.firma, name: user.name || '' });
    return { ok: true, firma: firma.name };
  }

  if (action === 'host-login') {
    await rateLimit(req, 'host', 5);
    const pw = process.env.HOST_PASSWORD;
    if (!pw) throw new HttpError(503, 'HOST_PASSWORD ist nicht gesetzt.');
    if (!safeEqual(String(body.passwort || ''), pw)) throw new HttpError(401, 'Passwort ist falsch.');
    setSession(res, 'host', { host: true });
    return { ok: true };
  }

  if (action === 'logout') {
    clearSession(res, body.kind === 'host' ? 'host' : 'firma');
    return { ok: true };
  }

  throw new HttpError(400, 'Unbekannte Aktion.');
});
