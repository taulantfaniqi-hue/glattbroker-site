#!/usr/bin/env node
// Import-Werkzeug für Firmenkonten (Buchungen + Belege) über die Host-API.
//
//   node tools/glatt-import.mjs firmen
//   node tools/glatt-import.mjs buchungen --firma muster-ag --jahr 2026 --datei export.csv [--modus anfuegen]
//   node tools/glatt-import.mjs buchungen --firma muster-ag --jahr 2026 --json buchungen.json [--modus anfuegen]
//   node tools/glatt-import.mjs beleg --firma muster-ag --datei rechnung.pdf --datum 2026-03-14 --typ A \
//        --kategorie "Essen & Verpflegung" --betrag 84.50 --lieferant "Restaurant Krone" [--titel "Teamessen"]
//   node tools/glatt-import.mjs belege --firma muster-ag --json belege.json   (Liste wie bei «beleg», Feld «datei»)
//
// Konfiguration (tools/.env.local, nicht im Git):
//   GLATT_HOST_API_KEY=…            muss HOST_API_KEY in Vercel entsprechen
//   GLATT_BASE_URL=https://www.glatt-broker.ch   (optional)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvZuBuchungen, kategorisiere } from '../assets/buchhaltung.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(dir, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const BASE = (process.env.GLATT_BASE_URL || 'https://www.glatt-broker.ch').replace(/\/$/, '');
const KEY = process.env.GLATT_HOST_API_KEY;
if (!KEY) { console.error('GLATT_HOST_API_KEY fehlt (tools/.env.local).'); process.exit(1); }

const [cmd, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') ? true : rest[++i];

async function api(q, method = 'GET', body) {
  const r = await fetch(`${BASE}/api/host?${q}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.error || ''}`);
  return j;
}

const MIME = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic', '.gif': 'image/gif' };

async function beleg(b) {
  const file = b.datei;
  const mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error(`Dateityp nicht erlaubt: ${file}`);
  const buf = fs.readFileSync(file);
  if (buf.length > 3 * 1024 * 1024) throw new Error(`Grösser als 3 MB: ${file}`);
  const typ = b.typ === 'E' ? 'E' : 'A';
  return api('action=beleg', 'POST', {
    firma: b.firma, datum: b.datum, typ,
    kategorie: b.kategorie || (typ === 'E' ? 'Umsatz' : kategorisiere({ text: b.titel || '', lieferant: b.lieferant || '' })),
    betrag: b.betrag ?? '', lieferant: b.lieferant || '', titel: b.titel || '',
    dateiname: path.basename(file), mime, daten: buf.toString('base64'),
  });
}

try {
  if (cmd === 'firmen') {
    const { firmen } = await api('action=firmen');
    for (const f of firmen) console.log(`${f.slug.padEnd(28)} ${f.name.padEnd(32)} Logins: ${f.benutzer.length}  Jahre: ${f.jahre.join(', ') || '–'}`);
  } else if (cmd === 'buchungen') {
    if (!opt.firma || !opt.jahr) throw new Error('--firma und --jahr nötig');
    let buchungen;
    if (opt.json) buchungen = JSON.parse(fs.readFileSync(opt.json, 'utf8'));
    else if (opt.datei) {
      const r = csvZuBuchungen(fs.readFileSync(opt.datei, 'utf8'));
      if (r.fehler) throw new Error(r.fehler);
      buchungen = r.buchungen;
    } else throw new Error('--datei (CSV) oder --json nötig');
    const r = await api('action=buchungen', 'PUT', {
      firma: opt.firma, jahr: Number(opt.jahr), modus: opt.modus === 'anfuegen' ? 'anfuegen' : 'ersetzen',
      quelle: path.basename(opt.datei || opt.json), buchungen,
    });
    console.log(`Gespeichert: ${r.gespeichert} · verworfen (anderes Jahr/ungültig): ${r.verworfen} · total ${r.total}`);
  } else if (cmd === 'beleg') {
    const r = await beleg(opt);
    console.log('Beleg hochgeladen:', r.id);
  } else if (cmd === 'belege') {
    const list = JSON.parse(fs.readFileSync(opt.json, 'utf8'));
    const base = path.dirname(path.resolve(opt.json));
    for (const b of list) {
      try {
        const r = await beleg({ firma: opt.firma, ...b, datei: path.resolve(base, b.datei) });
        console.log('✓', b.datum, b.datei, r.id);
      } catch (e) { console.log('✗', b.datei, e.message); }
    }
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n'));
  }
} catch (e) {
  console.error('Fehler:', e.message);
  process.exit(1);
}
