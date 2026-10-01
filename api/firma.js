// /api/firma — Daten des angemeldeten Firmenkontos
//   GET ?jahr=2026                  Buchungen (+ Vorjahr zum Vergleich)
//   GET ?action=belege&jahr=2026    Belegliste (Metadaten)
//   GET ?action=beleg&id=…          Belegdatei anzeigen / herunterladen
import {
  handler, HttpError, getJSON, redis, pipeline, key, requireFirma, cleanJahr, BELEG_TYPEN,
} from './_lib.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Methode nicht erlaubt.');
  const s = requireFirma(req);
  const slug = s.firma;

  if (req.query.action === 'beleg') return belegDatei(slug, String(req.query.id || ''), req, res);

  const firma = await getJSON(key.firma(slug));
  if (!firma) throw new HttpError(403, 'Dieses Firmenkonto ist nicht mehr aktiv.');

  const jahre = ((await redis('SMEMBERS', key.jahre(slug))) || []).map(Number).sort((a, b) => b - a);
  const jahr = req.query.jahr ? cleanJahr(req.query.jahr) : (jahre[0] || new Date().getFullYear());

  if (req.query.action === 'belege') {
    const h = (await redis('HVALS', key.belege(slug, jahr))) || [];
    const belege = h.map((x) => JSON.parse(x)).sort((a, b) => a.datum.localeCompare(b.datum) || a.hochgeladen.localeCompare(b.hochgeladen));
    return { jahr, jahre, belege };
  }

  const [cur, prev, anzBelege] = await pipeline([
    ['GET', key.buch(slug, jahr)],
    ['GET', key.buch(slug, jahr - 1)],
    ['HLEN', key.belege(slug, jahr)],
  ]);
  const data = cur ? JSON.parse(cur) : null;
  const vor = prev ? JSON.parse(prev) : null;

  return {
    firma: { name: firma.name },
    benutzer: { email: s.email, name: s.name },
    jahre,
    jahr,
    aktualisiert: data?.aktualisiert || null,
    buchungen: data?.buchungen || [],
    vorjahr: vor ? vor.buchungen : null,
    anzBelege,
  };
});

async function belegDatei(slug, id, req, res) {
  if (!/^[a-z0-9-]{8,40}$/.test(id)) throw new HttpError(400, 'Ungültige Beleg-ID.');
  const jahr = cleanJahr(id.slice(0, 4));
  const [metaRaw, b64] = await pipeline([
    ['HGET', key.belege(slug, jahr), id],
    ['GET', key.belegDatei(slug, id)],
  ]);
  if (!metaRaw || !b64) throw new HttpError(404, 'Beleg nicht gefunden.');
  const meta = JSON.parse(metaRaw);
  const mime = BELEG_TYPEN[meta.mime] ? meta.mime : 'application/octet-stream';
  const name = (meta.dateiname || `beleg-${id}.${BELEG_TYPEN[mime] || 'bin'}`).replace(/[^\w.\- ]/g, '_');
  const art = req.query.download ? 'attachment' : 'inline';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${art}; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(Buffer.from(b64, 'base64'));
}
