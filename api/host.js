// /api/host?action=… — Verwaltung der Firmenkonten (nur Host)
//   GET    datei      ?firma=&id=          Dokument ansehen (&download=1)
//   GET    status                          Serverstatus (Datenbank, Konfiguration, Mail)
//   GET    firmen                          Übersicht aller Firmen inkl. Logins, Jahre, offene Rechnungen, neue Anfragen
//   POST   firma      {name, slug?}        Firma anlegen
//   DELETE firma      ?slug=               Firma inkl. allem löschen
//   POST   benutzer   {firma, email, name, passwort}   Login (Benutzername oder E-Mail) anlegen / Passwort neu setzen
//   DELETE benutzer   ?email=
//   GET    buchungen  ?firma=&jahr=  ·  PUT buchungen {firma, jahr, buchungen[], modus, quelle?}  ·  DELETE ?firma=&jahr=
//   GET    belege     ?firma=&jahr=  ·  POST beleg {firma, ordner, datum, typ, …, dateiname, mime, daten}  ·  DELETE beleg ?firma=&id=
//   GET    rechnungen ?firma=        ·  POST rechnung {firma, …, datei?}  ·  PATCH rechnung {firma, id, …felder|status}  ·  DELETE rechnung ?firma=&id=
//   GET    anfragen   ?firma=        ·  GET anfragen-alle  ·  POST antwort {firma, id, text, status?, datei?}  ·  PATCH anfrage {firma, id, status}
import crypto from 'node:crypto';
import {
  handler, HttpError, redis, pipeline, getJSON, key, requireHost,
  slugify, cleanLoginName, hashPassword, cleanJahr, cleanBuchung,
  speichereDokument, sendeDatei, anhangInfo, cleanRechnung, bereichVon, filialenVon, cleanBereichName, cleanBelegMeta, STANDARD_BEREICH, ANFRAGE_STATUS, mailKonfiguriert, sendeMail, heute,
} from './_lib.js';

export default handler(async (req, res) => {
  requireHost(req);
  const { action } = req.query;
  const m = req.method;
  const body = req.body || {};

  if (action === 'status' && m === 'GET') return status(req);
  if (action === 'datei' && m === 'GET') return sendeDatei(await mustFirma(req.query.firma), String(req.query.id || ''), req, res);
  if (action === 'firmen' && m === 'GET') return listFirmen();
  if (action === 'anfragen-alle' && m === 'GET') return anfragenAlle();

  if (action === 'test-mail' && m === 'POST') {
    const ok = await sendeMail('[Firmenkonto] Testnachricht', 'Die E-Mail-Benachrichtigung des Host-Bereichs funktioniert.');
    if (!ok) throw new HttpError(502, mailKonfiguriert() ? 'Versand fehlgeschlagen (Zugangsdaten prüfen).' : 'E-Mail ist noch nicht eingerichtet.');
    return { ok: true };
  }

  if (action === 'firma' && m === 'POST') {
    const name = String(body.name || '').trim().slice(0, 100);
    const slug = slugify(body.slug || name);
    if (!name || !slug) throw new HttpError(400, 'Firmenname fehlt.');
    const ok = await redis('SET', key.firma(slug), JSON.stringify({ slug, name, erstellt: new Date().toISOString() }), 'NX');
    if (!ok) throw new HttpError(409, `Kürzel «${slug}» ist schon vergeben.`);
    await redis('SADD', key.firmen(), slug);
    return { ok: true, slug };
  }

  // Stammdaten der Firma ändern (Name, Geschäftsbeginn)
  if (action === 'firma' && m === 'PATCH') {
    const slug = await mustFirma(body.firma);
    const firma = await getJSON(key.firma(slug));
    if (body.name !== undefined) { const n = String(body.name).trim().slice(0, 100); if (n) firma.name = n; }
    if (body.geschaeftsbeginn !== undefined) {
      const g = String(body.geschaeftsbeginn || '').slice(0, 10);
      if (g && !/^\d{4}-\d{2}-\d{2}$/.test(g)) throw new HttpError(400, 'Geschäftsbeginn als Datum angeben.');
      if (g) firma.geschaeftsbeginn = g; else delete firma.geschaeftsbeginn;
    }
    await redis('SET', key.firma(slug), JSON.stringify(firma));
    return { ok: true, firma };
  }

  if (action === 'firma' && m === 'DELETE') {
    const slug = await mustFirma(req.query.slug);
    const [users, jahre] = await pipeline([['SMEMBERS', key.firmaUsers(slug)], ['SMEMBERS', key.jahre(slug)]]);
    const belegIds = (await pipeline(jahre.map((j) => ['HKEYS', key.belege(slug, j)]))).flat();
    await pipeline([
      ...users.map((e) => ['DEL', key.user(e)]),
      ...jahre.map((j) => ['DEL', key.buch(slug, j), key.belege(slug, j)]),
      ...belegIds.map((id) => ['DEL', key.belegDatei(slug, id)]),
      ['DEL', key.firma(slug), key.firmaUsers(slug), key.jahre(slug), key.rechnungen(slug), key.anfragen(slug)],
      ['SREM', key.firmen(), slug],
    ]);
    return { ok: true };
  }

  if (action === 'benutzer' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const login = cleanLoginName(body.email ?? body.benutzer);
    const pw = String(body.passwort || '');
    if (pw.length < 8) throw new HttpError(400, 'Passwort muss mindestens 8 Zeichen haben.');
    const existing = await getJSON(key.user(login));
    if (existing && existing.firma !== slug) throw new HttpError(409, 'Dieser Login gehört schon zu einer anderen Firma.');
    const user = {
      email: login, firma: slug, name: String(body.name || existing?.name || '').slice(0, 80),
      pw: hashPassword(pw), erstellt: existing?.erstellt || new Date().toISOString(),
    };
    await pipeline([['SET', key.user(login), JSON.stringify(user)], ['SADD', key.firmaUsers(slug), login]]);
    return { ok: true };
  }

  if (action === 'benutzer' && m === 'DELETE') {
    const login = String(req.query.email || '').trim().toLowerCase();
    const user = await getJSON(key.user(login));
    if (!user) throw new HttpError(404, 'Login nicht gefunden.');
    await pipeline([['DEL', key.user(login)], ['SREM', key.firmaUsers(user.firma), login]]);
    return { ok: true };
  }

  // ─── Buchhaltung ───────────────────────────────────────────────────
  if (action === 'buchungen') {
    const slug = await mustFirma(req.query.firma || body.firma);
    const jahr = cleanJahr(req.query.jahr || body.jahr);
    if (m === 'GET') return (await getJSON(key.buch(slug, jahr))) || { jahr, buchungen: [] };
    if (m === 'DELETE') {
      const [, docs] = await pipeline([['DEL', key.buch(slug, jahr)], ['HLEN', key.belege(slug, jahr)]]);
      if (!docs) await redis('SREM', key.jahre(slug), jahr);
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

  // ─── Dokumente ─────────────────────────────────────────────────────
  if (action === 'belege' && m === 'GET') {
    const slug = await mustFirma(req.query.firma);
    const jahr = cleanJahr(req.query.jahr);
    return { belege: (await hvals(key.belege(slug, jahr))).map((d) => ({ ...d, ordner: bereichVon(d.ordner) })).sort((a, b) => a.datum.localeCompare(b.datum)) };
  }

  if (action === 'beleg' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const doc = await speichereDokument(slug, body, { dateiname: body.dateiname, mime: body.mime, daten: body.daten }, 'host');
    return { ok: true, id: doc.id };
  }

  // Metadaten eines Dokuments ändern (z.B. in anderen Ordner/Bereich verschieben)
  if (action === 'beleg' && m === 'PATCH') {
    const slug = await mustFirma(body.firma);
    const id = String(body.id || '');
    const jahr = cleanJahr(id.slice(0, 4));
    const raw = await redis('HGET', key.belege(slug, jahr), id);
    if (!raw) throw new HttpError(404, 'Dokument nicht gefunden.');
    const alt = JSON.parse(raw);
    const neu = { ...alt, ...cleanBelegMeta({ ...alt, ...body, datum: alt.datum }) };
    await redis('HSET', key.belege(slug, jahr), id, JSON.stringify(neu));
    return { ok: true, dokument: neu };
  }

  // ─── Buchhaltungsbereiche / Filialen ───────────────────────────────
  if (action === 'filiale') {
    const slug = await mustFirma(body.firma || req.query.firma);
    const firma = await getJSON(key.firma(slug));
    const liste = filialenVon(firma);
    if (m === 'POST') {
      const name = cleanBereichName(body.name);
      if (liste.includes(name)) throw new HttpError(409, 'Diesen Bereich gibt es schon.');
      firma.filialen = [...liste, name];
    } else if (m === 'PATCH') {
      const alt = String(body.alt || ''); const neu = cleanBereichName(body.neu);
      if (!liste.includes(alt)) throw new HttpError(404, 'Bereich nicht gefunden.');
      if (liste.includes(neu)) throw new HttpError(409, 'Diesen Bereich gibt es schon.');
      firma.filialen = liste.map((x) => (x === alt ? neu : x));
      await bereichUmhaengen(slug, alt, neu);
    } else if (m === 'DELETE') {
      const name = String(req.query.name || '');
      if (!liste.includes(name)) throw new HttpError(404, 'Bereich nicht gefunden.');
      if (liste.length === 1) throw new HttpError(400, 'Mindestens ein Buchhaltungsbereich muss bleiben.');
      if (await bereichBenutzt(slug, name)) throw new HttpError(409, 'Im Bereich liegen noch Dokumente oder Buchungen. Bitte zuerst verschieben oder umbenennen.');
      firma.filialen = liste.filter((x) => x !== name);
    } else throw new HttpError(405, 'Methode nicht erlaubt.');
    await redis('SET', key.firma(slug), JSON.stringify(firma));
    return { ok: true, filialen: firma.filialen };
  }

  if (action === 'beleg' && m === 'DELETE') {
    const slug = await mustFirma(req.query.firma);
    const id = String(req.query.id || '');
    const jahr = cleanJahr(id.slice(0, 4));
    await pipeline([['HDEL', key.belege(slug, jahr), id], ['DEL', key.belegDatei(slug, id)]]);
    return { ok: true };
  }

  // ─── Offene Rechnungen ─────────────────────────────────────────────
  if (action === 'rechnungen' && m === 'GET') {
    const slug = await mustFirma(req.query.firma);
    return { rechnungen: await hvals(key.rechnungen(slug)) };
  }

  if (action === 'rechnung' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const r = cleanRechnung(body);
    const doc = body.datei ? await speichereDokument(slug, {
      datum: heute(), ordner: 'Rechnungen', typ: 'A', betrag: r.betrag, lieferant: r.glaeubiger, titel: r.titel || 'Rechnung',
    }, body.datei, 'host') : null;
    const id = 'r-' + crypto.randomUUID().slice(0, 12);
    const rechnung = { id, ...r, status: 'offen', von: 'host', erfasstVon: 'Glatt Broker', erstellt: new Date().toISOString(), anhang: anhangInfo(doc) };
    await redis('HSET', key.rechnungen(slug), id, JSON.stringify(rechnung));
    return { ok: true, rechnung };
  }

  if (action === 'rechnung' && m === 'PATCH') {
    const slug = await mustFirma(body.firma);
    const r = await getHash(key.rechnungen(slug), body.id, 'Rechnung');
    const neu = { ...r, ...cleanRechnung(body, r) };
    if (body.status) {
      neu.status = body.status === 'bezahlt' ? 'bezahlt' : 'offen';
      neu.bezahltAm = neu.status === 'bezahlt' ? (r.bezahltAm || heute()) : null;
      neu.bezahltVon = neu.status === 'bezahlt' ? (r.bezahltVon || 'Glatt Broker') : null;
    }
    await redis('HSET', key.rechnungen(slug), r.id, JSON.stringify(neu));
    return { ok: true, rechnung: neu };
  }

  if (action === 'rechnung' && m === 'DELETE') {
    const slug = await mustFirma(req.query.firma);
    await redis('HDEL', key.rechnungen(slug), String(req.query.id || ''));
    return { ok: true };
  }

  // ─── Anfragen ──────────────────────────────────────────────────────
  if (action === 'anfragen' && m === 'GET') {
    const slug = await mustFirma(req.query.firma);
    return { anfragen: (await hvals(key.anfragen(slug))).sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert)) };
  }

  if (action === 'antwort' && m === 'POST') {
    const slug = await mustFirma(body.firma);
    const a = await getHash(key.anfragen(slug), body.id, 'Anfrage');
    const text = String(body.text || '').trim().slice(0, 5000);
    if (!text && !body.datei) throw new HttpError(400, 'Antwort oder Anhang fehlt.');
    const doc = body.datei ? await speichereDokument(slug, { datum: heute(), ordner: 'Korrespondenz', titel: a.betreff }, body.datei, 'host') : null;
    const jetzt = new Date().toISOString();
    a.nachrichten.push({ von: 'host', name: 'Glatt Broker', text, zeit: jetzt, anhang: anhangInfo(doc) });
    if (ANFRAGE_STATUS.includes(body.status)) a.status = body.status;
    else if (a.status === 'neu') a.status = 'in Bearbeitung';
    a.aktualisiert = jetzt; a.ungelesenFirma = true; a.ungelesenHost = false;
    await redis('HSET', key.anfragen(slug), a.id, JSON.stringify(a));
    return { ok: true, anfrage: a };
  }

  if (action === 'anfrage' && m === 'PATCH') {
    const slug = await mustFirma(body.firma);
    const a = await getHash(key.anfragen(slug), body.id, 'Anfrage');
    if (body.status !== undefined) {
      if (!ANFRAGE_STATUS.includes(body.status)) throw new HttpError(400, 'Unbekannter Status.');
      if (a.status !== body.status) { a.status = body.status; a.ungelesenFirma = true; a.aktualisiert = new Date().toISOString(); }
    }
    if (body.gelesen) a.ungelesenHost = false;
    await redis('HSET', key.anfragen(slug), a.id, JSON.stringify(a));
    return { ok: true, anfrage: a };
  }

  throw new HttpError(400, 'Unbekannte Aktion.');
});

async function hvals(k) {
  return ((await redis('HVALS', k)) || []).map((x) => JSON.parse(x));
}

async function getHash(k, id, was) {
  const raw = await redis('HGET', k, String(id || ''));
  if (!raw) throw new HttpError(404, `${was} nicht gefunden.`);
  return JSON.parse(raw);
}

async function mustFirma(slug) {
  slug = slugify(slug);
  if (!slug || !(await redis('EXISTS', key.firma(slug)))) throw new HttpError(404, 'Firma nicht gefunden.');
  return slug;
}

// Alle Dokumente/Buchungen eines Bereichs auf neuen Namen umhängen
async function bereichUmhaengen(slug, alt, neu) {
  const jahre = (await redis('SMEMBERS', key.jahre(slug))) || [];
  for (const j of jahre) {
    const [docs, buchRaw] = await pipeline([['HVALS', key.belege(slug, j)], ['GET', key.buch(slug, j)]]);
    const cmds = [];
    for (const d of (docs || []).map((x) => JSON.parse(x))) {
      if (bereichVon(d.ordner) === alt) cmds.push(['HSET', key.belege(slug, j), d.id, JSON.stringify({ ...d, ordner: neu })]);
    }
    if (buchRaw) {
      const doc = JSON.parse(buchRaw);
      let n = 0;
      doc.buchungen.forEach((b) => { if ((b.f || STANDARD_BEREICH) === alt) { if (neu === STANDARD_BEREICH) delete b.f; else b.f = neu; n++; } });
      if (n) cmds.push(['SET', key.buch(slug, j), JSON.stringify(doc)]);
    }
    if (cmds.length) await pipeline(cmds);
  }
}

async function bereichBenutzt(slug, name) {
  const jahre = (await redis('SMEMBERS', key.jahre(slug))) || [];
  for (const j of jahre) {
    const [docs, buchRaw] = await pipeline([['HVALS', key.belege(slug, j)], ['GET', key.buch(slug, j)]]);
    if ((docs || []).some((x) => bereichVon(JSON.parse(x).ordner) === name)) return true;
    if (buchRaw && JSON.parse(buchRaw).buchungen.some((b) => (b.f || STANDARD_BEREICH) === name)) return true;
  }
  return false;
}

async function listFirmen() {
  const slugs = (await redis('SMEMBERS', key.firmen())) || [];
  if (!slugs.length) return { firmen: [] };
  const rows = await pipeline(slugs.flatMap((s) => [
    ['GET', key.firma(s)], ['SMEMBERS', key.firmaUsers(s)], ['SMEMBERS', key.jahre(s)],
    ['HVALS', key.rechnungen(s)], ['HVALS', key.anfragen(s)],
  ]));
  const firmen = [];
  const h = heute();
  for (let i = 0; i < slugs.length; i++) {
    const [f, users, jahre, rech, anf] = rows.slice(i * 5, i * 5 + 5);
    if (!f) continue;
    const offen = rech.map((x) => JSON.parse(x)).filter((r) => r.status !== 'bezahlt');
    const anfragen = anf.map((x) => JSON.parse(x));
    firmen.push({
      ...JSON.parse(f), filialen: filialenVon(JSON.parse(f)), benutzer: users.sort(), jahre: jahre.map(Number).sort((a, b) => b - a),
      offeneRechnungen: offen.length, ueberfaellig: offen.filter((r) => r.faellig < h).length,
      anfragenNeu: anfragen.filter((a) => a.ungelesenHost).length,
      anfragenOffen: anfragen.filter((a) => a.status !== 'erledigt').length,
    });
  }
  firmen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return { firmen };
}

async function anfragenAlle() {
  const slugs = (await redis('SMEMBERS', key.firmen())) || [];
  const rows = await pipeline(slugs.flatMap((s) => [['GET', key.firma(s)], ['HVALS', key.anfragen(s)]]));
  const out = [];
  for (let i = 0; i < slugs.length; i++) {
    const f = rows[i * 2] ? JSON.parse(rows[i * 2]) : null;
    if (!f) continue;
    for (const a of rows[i * 2 + 1].map((x) => JSON.parse(x))) {
      if (a.status === 'erledigt' && !a.ungelesenHost) continue;
      out.push({ firma: f.slug, firmaName: f.name, id: a.id, betreff: a.betreff, status: a.status, aktualisiert: a.aktualisiert, ungelesenHost: a.ungelesenHost });
    }
  }
  return { anfragen: out.sort((a, b) => (b.ungelesenHost - a.ungelesenHost) || b.aktualisiert.localeCompare(a.aktualisiert)) };
}

async function status(req) {
  const env = (n) => Boolean(process.env[n]);
  const out = {
    zeit: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'lokal',
    konfiguration: {
      SESSION_SECRET: env('SESSION_SECRET'), HOST_PASSWORD: env('HOST_PASSWORD'), HOST_API_KEY: env('HOST_API_KEY'),
      Datenbank: env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL'),
      Mail: mailKonfiguriert(), mailAn: process.env.MAIL_TO || 'online@glattbroker.ch',
    },
    datenbank: { ok: false },
  };
  try {
    const t0 = Date.now();
    const [pong, n, firmen] = await pipeline([['PING'], ['DBSIZE'], ['SCARD', key.firmen()]]);
    out.datenbank = { ok: pong === 'PONG', ms: Date.now() - t0, schluessel: n, firmen };
  } catch (e) {
    out.datenbank = { ok: false, fehler: e.message };
  }
  return out;
}
