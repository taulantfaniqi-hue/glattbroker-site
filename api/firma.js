// /api/firma — Daten des angemeldeten Firmenkontos
//   GET  ?jahr=2026                        Buchungen (+ Vorjahr) und Zähler
//   GET  ?action=dokumente&jahr=2026       Dokumente (Metadaten); Alias: belege
//   GET  ?action=beleg&id=…                Datei anzeigen / herunterladen (&download=1)
//   GET  ?action=rechnungen                offene + bezahlte Rechnungen
//   POST ?action=rechnung                  {glaeubiger, titel, betrag, faellig, prioritaet, notiz, datei?}
//   POST ?action=rechnung-status           {id, status: 'offen'|'bezahlt'}
//   POST ?action=rechnung-loeschen         {id}  (nur selbst erfasste)
//   GET  ?action=anfragen
//   POST ?action=anfrage                   {betreff, text, datei?}
//   POST ?action=antwort                   {id, text, datei?}
//   POST ?action=gelesen                   {id}
import crypto from 'node:crypto';
import {
  handler, HttpError, getJSON, redis, pipeline, key, requireFirma, cleanJahr, sendeDatei,
  speichereDokument, anhangInfo, cleanRechnung, sendeMail, heute,
} from './_lib.js';

export default handler(async (req, res) => {
  const s = requireFirma(req);
  const slug = s.firma;
  const action = req.query.action || '';
  const body = req.body || {};

  if (req.method === 'GET' && action === 'beleg') return sendeDatei(slug, String(req.query.id || ''), req, res);

  const firma = await getJSON(key.firma(slug));
  if (!firma) throw new HttpError(403, 'Dieses Firmenkonto ist nicht mehr aktiv.');

  if (req.method === 'GET') {
    if (action === 'rechnungen') return { rechnungen: await hvals(key.rechnungen(slug)) };
    if (action === 'anfragen') return { anfragen: (await hvals(key.anfragen(slug))).sort((a, b) => b.aktualisiert.localeCompare(a.aktualisiert)) };

    const jahre = ((await redis('SMEMBERS', key.jahre(slug))) || []).map(Number).sort((a, b) => b - a);
    const jahr = req.query.jahr ? cleanJahr(req.query.jahr) : (jahre[0] || new Date().getFullYear());

    if (action === 'dokumente' || action === 'belege') {
      const docs = (await hvals(key.belege(slug, jahr))).map((d) => ({ ordner: 'Belege', ...d }));
      docs.sort((a, b) => a.datum.localeCompare(b.datum) || a.hochgeladen.localeCompare(b.hochgeladen));
      return { jahr, jahre, dokumente: docs, belege: docs };
    }

    const [cur, prev, anzDok, rech, anf] = await pipeline([
      ['GET', key.buch(slug, jahr)],
      ['GET', key.buch(slug, jahr - 1)],
      ['HLEN', key.belege(slug, jahr)],
      ['HVALS', key.rechnungen(slug)],
      ['HVALS', key.anfragen(slug)],
    ]);
    const data = cur ? JSON.parse(cur) : null;
    const vor = prev ? JSON.parse(prev) : null;
    const offen = (rech || []).map((x) => JSON.parse(x)).filter((r) => r.status !== 'bezahlt');
    const anfragen = (anf || []).map((x) => JSON.parse(x));
    return {
      firma: { name: firma.name },
      benutzer: { email: s.email, name: s.name },
      jahre, jahr,
      aktualisiert: data?.aktualisiert || null,
      buchungen: data?.buchungen || [],
      vorjahr: vor ? vor.buchungen : null,
      anzBelege: anzDok,
      anzOffeneRechnungen: offen.length,
      anzUeberfaellig: offen.filter((r) => r.faellig < heute()).length,
      anzAnfragenUngelesen: anfragen.filter((a) => a.ungelesenFirma).length,
    };
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Methode nicht erlaubt.');
  const wer = s.name || s.email;

  // ─── Rechnungen ────────────────────────────────────────────────────
  if (action === 'rechnung') {
    const r = cleanRechnung(body);
    const doc = body.datei ? await speichereDokument(slug, {
      datum: heute(), ordner: 'Rechnungen', typ: 'A', betrag: r.betrag, lieferant: r.glaeubiger, titel: r.titel || 'Rechnung',
    }, body.datei, 'firma') : null;
    const id = 'r-' + crypto.randomUUID().slice(0, 12);
    const rechnung = { id, ...r, status: 'offen', von: 'firma', erfasstVon: wer, erstellt: new Date().toISOString(), anhang: anhangInfo(doc) };
    await redis('HSET', key.rechnungen(slug), id, JSON.stringify(rechnung));
    return { ok: true, rechnung };
  }

  if (action === 'rechnung-status') {
    const r = await getHash(key.rechnungen(slug), body.id, 'Rechnung');
    r.status = body.status === 'bezahlt' ? 'bezahlt' : 'offen';
    r.bezahltAm = r.status === 'bezahlt' ? heute() : null;
    r.bezahltVon = r.status === 'bezahlt' ? wer : null;
    await redis('HSET', key.rechnungen(slug), r.id, JSON.stringify(r));
    return { ok: true, rechnung: r };
  }

  if (action === 'rechnung-loeschen') {
    const r = await getHash(key.rechnungen(slug), body.id, 'Rechnung');
    if (r.von !== 'firma') throw new HttpError(403, 'Diese Rechnung wurde von Glatt Broker erfasst und kann nur dort gelöscht werden.');
    await redis('HDEL', key.rechnungen(slug), r.id);
    return { ok: true };
  }

  // ─── Anfragen ──────────────────────────────────────────────────────
  if (action === 'anfrage') {
    const betreff = String(body.betreff || '').trim().slice(0, 140);
    const text = String(body.text || '').trim().slice(0, 5000);
    if (!betreff || !text) throw new HttpError(400, 'Betreff und Nachricht ausfüllen.');
    const anhang = await anhangSpeichern(slug, body.datei, betreff);
    const jetzt = new Date().toISOString();
    const id = 'a-' + crypto.randomUUID().slice(0, 12);
    const a = {
      id, betreff, status: 'neu', erstellt: jetzt, aktualisiert: jetzt, ungelesenHost: true, ungelesenFirma: false,
      nachrichten: [{ von: 'firma', name: wer, text, zeit: jetzt, anhang }],
    };
    await redis('HSET', key.anfragen(slug), id, JSON.stringify(a));
    await benachrichtigen(firma.name, wer, `Neue Anfrage: ${betreff}`, text, !!anhang);
    return { ok: true, anfrage: a };
  }

  if (action === 'antwort') {
    const a = await getHash(key.anfragen(slug), body.id, 'Anfrage');
    const text = String(body.text || '').trim().slice(0, 5000);
    if (!text && !body.datei) throw new HttpError(400, 'Nachricht ausfüllen.');
    const anhang = await anhangSpeichern(slug, body.datei, a.betreff);
    const jetzt = new Date().toISOString();
    a.nachrichten.push({ von: 'firma', name: wer, text, zeit: jetzt, anhang });
    if (a.status === 'erledigt') a.status = 'neu';
    a.aktualisiert = jetzt; a.ungelesenHost = true; a.ungelesenFirma = false;
    await redis('HSET', key.anfragen(slug), a.id, JSON.stringify(a));
    await benachrichtigen(firma.name, wer, `Antwort zu: ${a.betreff}`, text, !!anhang);
    return { ok: true, anfrage: a };
  }

  if (action === 'gelesen') {
    const a = await getHash(key.anfragen(slug), body.id, 'Anfrage');
    if (a.ungelesenFirma) { a.ungelesenFirma = false; await redis('HSET', key.anfragen(slug), a.id, JSON.stringify(a)); }
    return { ok: true };
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

async function anhangSpeichern(slug, datei, titel) {
  if (!datei) return null;
  const doc = await speichereDokument(slug, { datum: heute(), ordner: 'Korrespondenz', titel }, datei, 'firma');
  return anhangInfo(doc);
}

async function benachrichtigen(firmaName, wer, betreff, text, mitAnhang) {
  const link = (process.env.PORTAL_URL || 'https://www.glatt-broker.ch') + '/host.html';
  await sendeMail(
    `[Firmenkonto] ${firmaName}: ${betreff}`,
    `${firmaName} (${wer}) hat im Firmenkonto geschrieben:\n\n${text}\n${mitAnhang ? '\n(mit Anhang)\n' : ''}\nBeantworten im Host-Bereich: ${link}\n`,
  );
}
