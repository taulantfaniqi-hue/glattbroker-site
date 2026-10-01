// /api/host?action=… — Verwaltung der Firmenkonten (nur Host)
//   GET    firmen                          Übersicht aller Firmen inkl. Benutzer und Jahre
//   POST   firma      {name, slug?}        Firma anlegen
//   DELETE firma      ?slug=               Firma inkl. Benutzer und Daten löschen
//   POST   benutzer   {firma, email, name, passwort}   Login anlegen / Passwort neu setzen
//   DELETE benutzer   ?email=
//   GET    buchungen  ?firma=&jahr=
//   PUT    buchungen  {firma, jahr, buchungen[], modus: 'ersetzen'|'anfuegen', quelle?}
//   DELETE buchungen  ?firma=&jahr=
//   GET    belege     ?firma=&jahr=
//   POST   beleg      {firma, datum, typ, kategorie, betrag, lieferant, titel, dateiname, mime, daten (Base64)}
//   DELETE beleg      ?firma=&id=
import crypto from 'node:crypto';
import {
  handler, HttpError, redis, pipeline, getJSON, key, requireHost,
  slugify, normEmail, hashPassword, cleanJahr, cleanBuchung, cleanBelegMeta, BELEG_TYPEN, BELEG_MAX,
} from './_lib.js';

export default handler(async (req) => {
  requireHost(req);
  const { action } = req.query;
  const m = req.method;
  const body = req.body || {};

  if (action === 'firmen' && m === 'GET') return listFirmen();

  if (action === 'firma' && m === 'POST') {
    const name = String(body.name || '').trim().slice(0, 100);
    const slug = slugify(body.slug || name);
    if (!name || !slug) throw new HttpError(400, 'Firmenname fehlt.');
    const ok = await redis('SET', key.firma(slug), JSON.stringify({ slug, name, erstellt: new Date().toISOString() }), 'NX');
    if (!ok) throw new HttpError(409, `Kürzel «${slug}» ist schon vergeben.`);
    await redis('SADD', key.firmen(), slug);
    return { ok: true, slug };
  }

  if (action === 'firma' && m === 'DELETE') {
    const slug = await mustFirma(req.query.slug);
    const [users, jahre] = await pipeline([['SMEMBERS', key.firmaUsers(slug)], ['SMEMBERS', key.jahre(slug)]]);
    const belegIds = (await pipeline(jahre.map((j) => ['HKEYS', key.belege(slug, j)]))).flat();
    await pipeline([
      ...users.map((e) => ['DEL', key.user(e)]),
      ...jahre.map((j) => ['DEL', key.buch(slug, j), key.belege(slug, j)]),
      ...belegIds.map((id) => ['DEL', key.belegDatei(slug, id)]),
      ['DEL', key.firma(slug), key.firmaUsers(slug), key.jahre(slug)],
      ['SREM', key.firmen(), slug],
    ]);
    return { ok: true };
  }

  if (action === 'benutzer' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const email = normEmail(body.email);
    const pw = String(body.passwort || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Ungültige E-Mail.');
    if (pw.length < 10) throw new HttpError(400, 'Passwort muss mindestens 10 Zeichen haben.');
    const existing = await getJSON(key.user(email));
    if (existing && existing.firma !== slug) throw new HttpError(409, 'Diese E-Mail gehört schon zu einer anderen Firma.');
    const user = {
      email, firma: slug, name: String(body.name || existing?.name || '').slice(0, 80),
      pw: hashPassword(pw), erstellt: existing?.erstellt || new Date().toISOString(),
    };
    await pipeline([['SET', key.user(email), JSON.stringify(user)], ['SADD', key.firmaUsers(slug), email]]);
    return { ok: true };
  }

  if (action === 'benutzer' && m === 'DELETE') {
    const email = normEmail(req.query.email);
    const user = await getJSON(key.user(email));
    if (!user) throw new HttpError(404, 'Benutzer nicht gefunden.');
    await pipeline([['DEL', key.user(email)], ['SREM', key.firmaUsers(user.firma), email]]);
    return { ok: true };
  }

  if (action === 'buchungen') {
    const slug = await mustFirma(req.query.firma || body.firma);
    const jahr = cleanJahr(req.query.jahr || body.jahr);

    if (m === 'GET') return (await getJSON(key.buch(slug, jahr))) || { jahr, buchungen: [] };

    if (m === 'DELETE') {
      const [, belege] = await pipeline([['DEL', key.buch(slug, jahr)], ['HLEN', key.belege(slug, jahr)]]);
      if (!belege) await redis('SREM', key.jahre(slug), jahr);
      return { ok: true };
    }

    if (m === 'PUT') {
      if (!Array.isArray(body.buchungen)) throw new HttpError(400, 'buchungen[] fehlt.');
      const neu = body.buchungen.map(cleanBuchung).filter((b) => b && b.d.startsWith(String(jahr)));
      const alt = body.modus === 'anfuegen' ? ((await getJSON(key.buch(slug, jahr)))?.buchungen || []) : [];
      const buchungen = [...alt, ...neu].sort((a, b) => a.d.localeCompare(b.d));
      const doc = { jahr, aktualisiert: new Date().toISOString(), quelle: String(body.quelle || '').slice(0, 120), buchungen };
      await pipeline([['SET', key.buch(slug, jahr), JSON.stringify(doc)], ['SADD', key.jahre(slug), jahr]]);
      return { ok: true, gespeichert: neu.length, verworfen: body.buchungen.length - neu.length, total: buchungen.length };
    }
  }

  if (action === 'belege' && m === 'GET') {
    const slug = await mustFirma(req.query.firma);
    const jahr = cleanJahr(req.query.jahr);
    const h = (await redis('HVALS', key.belege(slug, jahr))) || [];
    return { belege: h.map((x) => JSON.parse(x)).sort((a, b) => a.datum.localeCompare(b.datum)) };
  }

  if (action === 'beleg' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const meta = cleanBelegMeta(body);
    const mime = String(body.mime || '');
    if (!BELEG_TYPEN[mime]) throw new HttpError(400, 'Dateityp nicht erlaubt (PDF, JPG, PNG, WEBP, HEIC, GIF).');
    const daten = String(body.daten || '').replace(/^data:[^,]*,/, '');
    const groesse = Math.floor(daten.length * 3 / 4);
    if (!groesse) throw new HttpError(400, 'Datei fehlt.');
    if (groesse > BELEG_MAX) throw new HttpError(413, 'Datei ist grösser als 3 MB.');
    const jahr = Number(meta.datum.slice(0, 4));
    const id = `${jahr}-${crypto.randomUUID().slice(0, 13)}`;
    const doc = {
      id, ...meta, mime, groesse,
      dateiname: String(body.dateiname || '').slice(0, 120),
      hochgeladen: new Date().toISOString(),
    };
    await pipeline([
      ['SET', key.belegDatei(slug, id), daten],
      ['HSET', key.belege(slug, jahr), id, JSON.stringify(doc)],
      ['SADD', key.jahre(slug), jahr],
    ]);
    return { ok: true, id };
  }

  if (action === 'beleg' && m === 'DELETE') {
    const slug = await mustFirma(req.query.firma);
    const id = String(req.query.id || '');
    const jahr = cleanJahr(id.slice(0, 4));
    await pipeline([['HDEL', key.belege(slug, jahr), id], ['DEL', key.belegDatei(slug, id)]]);
    return { ok: true };
  }

  throw new HttpError(400, 'Unbekannte Aktion.');
});

async function mustFirma(slug) {
  slug = slugify(slug);
  if (!slug || !(await redis('EXISTS', key.firma(slug)))) throw new HttpError(404, 'Firma nicht gefunden.');
  return slug;
}

async function listFirmen() {
  const slugs = (await redis('SMEMBERS', key.firmen())) || [];
  if (!slugs.length) return { firmen: [] };
  const rows = await pipeline(slugs.flatMap((s) => [
    ['GET', key.firma(s)], ['SMEMBERS', key.firmaUsers(s)], ['SMEMBERS', key.jahre(s)],
  ]));
  const firmen = [];
  for (let i = 0; i < slugs.length; i++) {
    const f = rows[i * 3] ? JSON.parse(rows[i * 3]) : null;
    if (!f) continue;
    firmen.push({ ...f, benutzer: rows[i * 3 + 1].sort(), jahre: rows[i * 3 + 2].map(Number).sort((a, b) => b - a) });
  }
  firmen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { firmen };
}
