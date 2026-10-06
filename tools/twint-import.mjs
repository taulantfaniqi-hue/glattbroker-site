#!/usr/bin/env node
// TWINT-Abrechnungen (PDF) auslesen → Kundenordner sortieren + Firmenkonto befüllen.
//
//   node tools/twint-import.mjs --quelle <Ordner|ZIP|PDF …> --firma lumiere-hair \
//        --kundenordner "C:\…\Kunden\Fleta Dinaj (Lumiere Hair)" [--ordner "Claude Buchhaltung"] [--nur-lokal] [--probe]
//
// Pro Abrechnung:
//   • Kopie im Kundenordner: <kundenordner>/<ordner>/<JJJJ-MM Monat>/<JJJJ-MM-TT> TWINT Abrechnung.pdf
//   • Dokument im Firmenkonto (Ordner «Claude Buchhaltung», Einnahme, Datum = Ende des Zeitraums)
//   • Buchungen: jede Zahlung als Einnahme «Umsatz» (Zahlungszweck als Text), Gebühren als Ausgabe «Bank & Finanzen»
// Doppelte Dateien/Transaktionen werden über die Transaktionsreferenz erkannt.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(dir, '.env.local');
if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = (process.env.GLATT_BASE_URL || 'https://www.glatt-broker.ch').replace(/\/$/, '');
const KEY = process.env.GLATT_HOST_API_KEY;

const opt = { quelle: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { opt.quelle.push(a); continue; }
  const k = a.slice(2);
  if (['nur-lokal', 'probe'].includes(k)) opt[k] = true;
  else if (k === 'quelle') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) opt.quelle.push(argv[++i]); }
  else opt[k] = argv[++i];
}
const ORDNER = opt.ordner || 'Claude Buchhaltung';
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// ─── Quellen einsammeln (Ordner, ZIP, einzelne PDFs) ─────────────────
function sammle(p, out = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) sammle(path.join(p, f), out);
  else if (/\.zip$/i.test(p)) {
    const ziel = fs.mkdtempSync(path.join(os.tmpdir(), 'twint-'));
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${p.replace(/'/g, "''")}' -DestinationPath '${ziel}' -Force`]);
    sammle(ziel, out);
  } else if (/\.pdf$/i.test(p)) out.push(p);
  return out;
}

// ─── PDF lesen ───────────────────────────────────────────────────────
async function pdfText(file) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
  const zeilen = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: it.transform[4], s: it.str });
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => zeilen.push(r.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ')));
  }
  return zeilen.join('\n');
}

const zahl = (s) => Number(String(s).replace(/['’\s]/g, ''));
const iso = (d) => { const [t, m, j] = d.split('.'); return `${j}-${m}-${t}`; };

function parse(text, file) {
  const z = text.match(/Zeitraum:\s*(\d{2}\.\d{2}\.\d{4}),?\s*[\d:]+\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
  if (!/TWINT/i.test(text) || !z) throw new Error('keine TWINT-Abrechnung');
  // Mehrere Abschnitte (z.B. QR-Sticker + QR-Code) haben je ein eigenes Total → alle zusammenzählen
  const totals = [...text.matchAll(/^Total\s+(-?[\d']+\.\d{2})\s+(-?[\d']+\.\d{2})\s+(-?[\d']+\.\d{2})/gm)];
  const tot = totals.length ? [null, ...[1, 2, 3].map((i) => Math.round(totals.reduce((s, t) => s + zahl(t[i]), 0) * 100) / 100)] : null;
  // Zeilenweise: Transaktionszeile beginnt mit «TT.MM.JJJJ / hh:mm»; umgebrochene Fortsetzungen
  // (Rest der Transaktionsreferenz oder des Zahlungszwecks) werden an die vorherige Zeile gehängt.
  const tx = [];
  const kopf = /^(\d{2}\.\d{2}\.\d{4})\s*\/\s*(\d{2}:\d{2})\s+(-?[\d']+\.\d{2})\s+(-?[\d']+\.\d{2})\s+(-?[\d']+\.\d{2})\s+(\S+)\s+(.*)$/;
  let akt = null;
  const abschluss = () => {
    if (!akt) return;
    let rest = akt.rest.replace(/\s+/g, ' ').trim();
    // Referenz-Bruchstücke (z.B. «7962d414-…-8539-» + «919ed5dc2452») zusammensetzen
    rest = rest.replace(/^([0-9a-f-]+-)\s+(.*?)\s+([0-9a-f]{4,12})$/i, '$1$3 $2');
    const r = rest.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*(.*)$/i);
    tx.push({ ...akt.basis, ref: r ? r[1] : `${akt.basis.datum}-${akt.basis.zeit}-${akt.basis.brutto}`, zweck: (r ? r[2] : rest).replace(/^Zahlungszweck:\s*/i, '').trim() });
    akt = null;
  };
  for (const zeile of text.split('\n')) {
    const z2 = zeile.trim();
    const m = z2.match(kopf);
    if (m) {
      abschluss();
      akt = { basis: { datum: iso(m[1]), zeit: m[2], brutto: zahl(m[3]), gebuehr: zahl(m[4]), netto: zahl(m[5]), art: m[6] }, rest: m[7] };
    } else if (akt && /^(Total|Vielen Dank|Seite|\d+$)/i.test(z2)) abschluss();
    else if (akt && z2 && !/^Datum \/ Zeit/i.test(z2)) akt.rest += ' ' + z2;
  }
  abschluss();
  const summe = (k) => Math.round(tx.reduce((s, t) => s + t[k], 0) * 100) / 100;
  const r = {
    file, von: iso(z[1]), bis: iso(z[2]), tx,
    brutto: tot ? zahl(tot[1]) : summe('brutto'), gebuehren: tot ? zahl(tot[2]) : summe('gebuehr'), netto: tot ? zahl(tot[3]) : summe('netto'),
  };
  if (tot && Math.abs(summe('brutto') - r.brutto) > 0.05) r.warnung = `Summe Zahlungen ${summe('brutto')} ≠ Total ${r.brutto}`;
  return r;
}

// ─── API ─────────────────────────────────────────────────────────────
async function api(q, method = 'GET', body) {
  const r = await fetch(`${BASE}/api/host?${q}`, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.error || ''}`);
  return j;
}

// ─── Ablauf ──────────────────────────────────────────────────────────
const dateien = opt.quelle.flatMap((q) => sammle(q));
if (!dateien.length) { console.error('Keine PDFs gefunden. --quelle <Ordner|ZIP|PDF>'); process.exit(1); }

const abrechnungen = []; const fremd = [];
const gesehen = new Set();
for (const f of dateien) {
  try {
    const a = parse(await pdfText(f), f);
    const schluessel = a.von + a.bis + a.brutto;
    if (gesehen.has(schluessel)) continue; // doppelt geschickt
    gesehen.add(schluessel);
    abrechnungen.push(a);
  } catch (e) { fremd.push(`${path.basename(f)} (${e.message})`); }
}
abrechnungen.sort((a, b) => a.bis.localeCompare(b.bis));

const alleTx = new Map();
for (const a of abrechnungen) for (const t of a.tx) alleTx.set(t.ref, t);
const txListe = [...alleTx.values()];
const sum = (l, k) => Math.round(l.reduce((s, x) => s + x[k], 0) * 100) / 100;

console.log(`\n${abrechnungen.length} TWINT-Abrechnungen (${abrechnungen[0]?.von} bis ${abrechnungen.at(-1)?.bis}), ${txListe.length} Zahlungen`);
console.log(`Brutto CHF ${sum(abrechnungen, 'brutto').toFixed(2)} · Gebühren CHF ${sum(abrechnungen, 'gebuehren').toFixed(2)} · Netto CHF ${sum(abrechnungen, 'netto').toFixed(2)}`);
for (const a of abrechnungen) if (a.warnung) console.log('⚠', path.basename(a.file), a.warnung);
// Lücken: jeder Zeitraum beginnt dort, wo der vorherige endet
const luecken = [];
for (let i = 1; i < abrechnungen.length; i++) {
  if (abrechnungen[i].von !== abrechnungen[i - 1].bis) luecken.push(`${abrechnungen[i - 1].bis} → ${abrechnungen[i].von}`);
}
console.log(luecken.length ? `⚠ Fehlende Zeiträume: ${luecken.join(' · ')}` : '✓ Keine Lücken zwischen den Abrechnungen');
const ueberlapp = abrechnungen.filter((a, i) => i && a.von < abrechnungen[i - 1].bis);
if (ueberlapp.length) console.log('⚠ Überlappende Zeiträume:', ueberlapp.map((a) => `${a.von}–${a.bis}`).join(', '));
if (fremd.length) console.log('Nicht als TWINT-Abrechnung erkannt:', fremd.join('; '));
if (opt.probe) process.exit(0);

// 1) Kundenordner
if (opt.kundenordner) {
  const basis = path.join(opt.kundenordner, ORDNER);
  for (const a of abrechnungen) {
    const [j, m] = a.bis.split('-');
    const ziel = path.join(basis, `${j}-${m} ${MONATE[+m - 1]}`);
    fs.mkdirSync(ziel, { recursive: true });
    fs.copyFileSync(a.file, path.join(ziel, `${a.bis} TWINT Abrechnung ${a.von.slice(8, 10)}.${a.von.slice(5, 7)}.–${a.bis.slice(8, 10)}.${a.bis.slice(5, 7)}.${j}.pdf`));
  }
  const csv = ['Datum;Zeit;Brutto;Gebühren;Netto;Art;Zahlungszweck;Referenz',
    ...txListe.sort((a, b) => (a.datum + a.zeit).localeCompare(b.datum + b.zeit))
      .map((t) => [t.datum, t.zeit, t.brutto.toFixed(2), t.gebuehr.toFixed(2), t.netto.toFixed(2), t.art, `"${t.zweck.replace(/"/g, "'")}"`, t.ref].join(';'))];
  fs.writeFileSync(path.join(basis, 'TWINT Zahlungen Übersicht.csv'), '\uFEFF' + csv.join('\r\n'));
  console.log(`✓ Kundenordner: ${basis}`);
}
if (opt['nur-lokal'] || !opt.firma) process.exit(0);
if (!KEY) { console.error('GLATT_HOST_API_KEY fehlt (tools/.env.local).'); process.exit(1); }

// 2) Dokumente ins Firmenkonto (bereits vorhandene über den Dateinamen überspringen)
const jahre = [...new Set(abrechnungen.map((a) => a.bis.slice(0, 4)))];
const vorhanden = new Set();
for (const j of jahre) (await api(`action=belege&firma=${opt.firma}&jahr=${j}`)).belege.forEach((d) => vorhanden.add(d.dateiname));
let hoch = 0;
for (const a of abrechnungen) {
  const name = `${a.bis} TWINT Abrechnung.pdf`;
  if (vorhanden.has(name)) continue;
  await api('action=beleg', 'POST', {
    firma: opt.firma, ordner: ORDNER, datum: a.bis, typ: 'E', kategorie: 'Umsatz', betrag: a.brutto, lieferant: 'TWINT',
    titel: `Abrechnung ${a.von.slice(8, 10)}.${a.von.slice(5, 7)}.–${a.bis.slice(8, 10)}.${a.bis.slice(5, 7)}. · ${a.tx.length} Zahlungen · netto ${a.netto.toFixed(2)}`,
    dateiname: name, mime: 'application/pdf', daten: fs.readFileSync(a.file).toString('base64'),
  });
  hoch++;
}
console.log(`✓ ${hoch} Dokumente hochgeladen (${abrechnungen.length - hoch} waren schon da)`);

// 3) Buchungen: Zahlungen als Einnahmen, Gebühren als Ausgaben; bestehende TWINT-Buchungen des Jahres werden ersetzt
for (const j of [...new Set(txListe.map((t) => t.datum.slice(0, 4)))]) {
  const alt = (await api(`action=buchungen&firma=${opt.firma}&jahr=${j}`)).buchungen || [];
  const behalten = alt.filter((b) => b.l !== 'TWINT');
  const neu = [];
  for (const t of txListe.filter((x) => x.datum.startsWith(j))) {
    if (t.brutto >= 0) neu.push({ d: t.datum, b: t.brutto, typ: 'E', k: 'Umsatz', l: 'TWINT', t: t.zweck || 'TWINT-Zahlung' });
    else neu.push({ d: t.datum, b: -t.brutto, typ: 'A', k: 'Sonstiges', l: 'TWINT', t: 'Rückerstattung ' + (t.zweck || '') });
  }
  for (const a of abrechnungen.filter((x) => x.bis.startsWith(j) && x.gebuehren)) {
    neu.push({ d: a.bis, b: -a.gebuehren, typ: 'A', k: 'Bank & Finanzen', l: 'TWINT', t: `TWINT Gebühren ${a.von.slice(8, 10)}.${a.von.slice(5, 7)}.–${a.bis.slice(8, 10)}.${a.bis.slice(5, 7)}.` });
  }
  const r = await api('action=buchungen', 'PUT', { firma: opt.firma, jahr: Number(j), modus: 'ersetzen', quelle: 'TWINT-Abrechnungen (WhatsApp)', buchungen: [...behalten, ...neu] });
  console.log(`✓ ${j}: ${neu.length} TWINT-Buchungen (total ${r.total})`);
}
