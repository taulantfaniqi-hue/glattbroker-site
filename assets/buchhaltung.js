// Buchhaltung: Kategorien, automatische Zuordnung und CSV-Einlesen.
// Wird im Browser (host.html, firmenkonto.html) und im Import-Werkzeug (tools/) genutzt.

// Ausgaben-Kategorien. «bereich» fasst sie für die Monatsübersicht zusammen.
export const KATEGORIEN = [
  { name: 'Personal & Löhne',          farbe: '#2E5EAA', bereich: 'Personal', emoji: '👥' },
  { name: 'Sozialversicherungen',      farbe: '#CC2936', bereich: 'Sozialversicherungen', emoji: '🛡️' },
  { name: 'Miete & Raum',              farbe: '#7A4FB0', bereich: 'Betrieb', emoji: '🏠' },
  { name: 'Material & Waren',          farbe: '#5C940D', bereich: 'Betrieb', emoji: '📦' },
  { name: 'Essen & Verpflegung',       farbe: '#E07A2F', bereich: 'Betrieb', emoji: '🍽️' },
  { name: 'Fahrzeuge & Transport',     farbe: '#1F9E89', bereich: 'Betrieb', emoji: '🚗' },
  { name: 'Reisen & Spesen',           farbe: '#3BA3D9', bereich: 'Betrieb', emoji: '✈️' },
  { name: 'Sachversicherungen',        farbe: '#F06574', bereich: 'Betrieb', emoji: '☂️' },
  { name: 'Energie & Unterhalt',       farbe: '#D9A400', bereich: 'Betrieb', emoji: '⚡' },
  { name: 'Büro & Verwaltung',         farbe: '#8C6D46', bereich: 'Betrieb', emoji: '🗂️' },
  { name: 'IT, Software & Telefon',    farbe: '#4C6EF5', bereich: 'Betrieb', emoji: '💻' },
  { name: 'Marketing & Werbung',       farbe: '#D63384', bereich: 'Betrieb', emoji: '📣' },
  { name: 'Beratung & Treuhand',       farbe: '#6F7F99', bereich: 'Betrieb', emoji: '🤝' },
  { name: 'Bank & Finanzen',           farbe: '#495057', bereich: 'Betrieb', emoji: '🏦' },
  { name: 'Abschreibungen',            farbe: '#9AA0A6', bereich: 'Betrieb', emoji: '📉' },
  { name: 'Sonstiges',                 farbe: '#C3C8CE', bereich: 'Betrieb', emoji: '🔹' },
  { name: 'Steuern',                   farbe: '#A61E4D', bereich: 'Steuern', emoji: '🏛️' },
];

// Einnahmen-Kategorien (typ 'E')
export const EINNAHMEN = [
  { name: 'Umsatz',                farbe: '#1F9E89', emoji: '💇' },
  { name: 'Sonstige Einnahmen',    farbe: '#63C7B2', emoji: '➕' },
];

// Privat: Bewegungen ohne Geschäftsbezug (z.B. Privateinlage), zählen nicht in Umsatz/Ausgaben
export const PRIVAT = { name: 'Privat', farbe: '#9AA0A6', emoji: '👤' };

const FARBEN = Object.fromEntries([...KATEGORIEN, ...EINNAHMEN, PRIVAT].map((k) => [k.name, k.farbe]));
const BEREICH = Object.fromEntries(KATEGORIEN.map((k) => [k.name, k.bereich]));
export const farbe = (k) => FARBEN[k] || '#C3C8CE';
const EMOJIS = Object.fromEntries([...KATEGORIEN, ...EINNAHMEN, PRIVAT].map((k) => [k.name, k.emoji]));
export const emoji = (k) => EMOJIS[k] || '🔹';
export const bereich = (b) => (b.typ === 'E' ? 'Einnahmen' : b.typ === 'P' ? 'Privat' : BEREICH[b.k] || 'Betrieb');

// Stichworte → Kategorie (erste Übereinstimmung gewinnt, Reihenfolge zählt)
const REGELN = [
  ['Bank & Finanzen', ['migros bank', 'coop finance', 'bankgebühr', 'kontoführung', 'kontofuehrung']],
  ['Steuern', ['steueramt', 'steuerverwaltung', 'estv', 'mwst', 'mehrwertsteuer', 'staatssteuer', 'bundessteuer', 'gemeindesteuer', 'quellensteuer']],
  ['Sozialversicherungen', ['ausgleichskasse', 'ahv', 'sva ', 'sozialversicherung', 'familienausgleich', 'familienzulage', 'fak ', 'pensionskasse', 'bvg', 'sammelstiftung', 'vorsorgestiftung', 'personalvorsorge', 'suva', 'uvg', 'unfallversicherung', 'ktg', 'krankentaggeld', 'taggeld']],
  ['Personal & Löhne', ['lohn', 'löhne', 'salär', 'salaer', 'gehalt', 'personalaufwand', 'lohnzahlung', 'temporär', 'adecco', 'manpower', 'randstad']],
  ['Sachversicherungen', ['versicherung', 'prämie', 'praemie', 'axa', 'allianz', 'zurich', 'mobiliar', 'helvetia', 'baloise', 'bâloise', 'generali', 'vaudoise', 'css ', 'sanitas', 'helsana', 'swica', 'visana', 'groupe mutuel', 'concordia', 'atupri', 'smile.direct', 'tcs']],
  ['Essen & Verpflegung', ['restaurant', 'ristorante', 'pizzeria', 'pizza', 'sushi', 'kebab', 'döner', 'burger', 'mcdonald', 'burger king', 'starbucks', 'café', 'cafe ', 'kaffee', 'bäckerei', 'baeckerei', 'confiserie', 'sprüngli', 'kantine', 'mensa', 'verpflegung', 'mittagessen', 'znüni', 'apéro', 'apero', 'catering', 'take away', 'takeaway', 'uber eats', 'just eat', 'eat.ch', 'smood', 'dean&david', 'tibits', 'coop', 'migros', 'denner', 'lidl', 'aldi', 'volg', 'spar ', 'manor food', 'globus', 'avec', 'k kiosk', 'kiosk', 'valora', 'brezelkönig']],
  ['Fahrzeuge & Transport', ['shell', 'avia', 'socar', 'tamoil', 'migrol', 'agrola', 'eni ', 'bp ', 'esso', 'ruedi rüssel', 'tankstelle', 'benzin', 'diesel', 'tesla supercharger', 'ladestation', 'parking', 'parkgeb', 'parkhaus', 'parkplatz', 'parkuhr', 'garage', 'amag', 'emil frey', 'pneu', 'reifen', 'autowasch', 'vignette', 'strassenverkehrsamt', 'leasing', 'mobility', 'dhl', 'dpd', 'ups ', 'fedex', 'planzer', 'kurier']],
  ['Reisen & Spesen', ['sbb', 'cff', 'postauto', 'zvv', 'bls', 'swiss int', 'swiss.com', 'easyjet', 'edelweiss', 'lufthansa', 'flughafen', 'airport', 'hotel', 'booking.com', 'airbnb', 'expedia', 'uber', 'taxi', 'bolt', 'reisespesen', 'spesenabrechnung']],
  ['IT, Software & Telefon', ['swisscom', 'sunrise', 'salt ', 'salt.', 'wingo', 'yallo', 'quickline', 'init7', 'microsoft', 'office 365', 'google', 'apple.com', 'icloud', 'adobe', 'hostpoint', 'infomaniak', 'cyon', 'metanet', 'amazon web services', 'aws', 'github', 'openai', 'anthropic', 'claude', 'chatgpt', 'zoom', 'dropbox', 'notion', 'slack', 'canva', 'bexio', 'abacus', 'banana', 'run my accounts', 'klara', 'monday.com', 'hubspot', 'wix', 'squarespace', 'vercel', 'software', 'lizenz', 'domain']],
  ['Marketing & Werbung', ['facebook', 'meta platforms', 'instagram', 'linkedin', 'google ads', 'tiktok', 'werbung', 'inserat', 'anzeige', 'flyer', 'druckerei', 'onlineprinters', 'vistaprint', 'flyerline', 'printzessin', 'sponsoring', 'messe', 'marketing']],
  ['Miete & Raum', ['miete', 'mietzins', 'nebenkosten', 'liegenschaft', 'immobilien', 'büromiete', 'parkplatzmiete', 'coworking', 'regus', 'impact hub']],
  ['Energie & Unterhalt', ['ewz', 'ekz', 'bkw', 'axpo', 'ckw', 'iwb', 'ewb', 'sak', 'romande energie', 'strom', 'energie', 'gas ', 'wasser', 'entsorgung', 'kehricht', 'reinigung', 'hauswart', 'reparatur', 'unterhalt', 'handwerker', 'hornbach', 'jumbo', 'bauhaus', 'obi ']],
  ['Beratung & Treuhand', ['treuhand', 'anwalt', 'rechtsanwalt', 'notar', 'beratung', 'revision', 'buchhaltung', 'handelsregister', 'betreibungsamt', 'kanzlei']],
  ['Büro & Verwaltung', ['die post', 'schweizerische post', 'post ch', 'porto', 'briefmarken', 'office world', 'papeterie', 'büromaterial', 'bueromaterial', 'ikea', 'digitec', 'galaxus', 'brack', 'interdiscount', 'mediamarkt', 'media markt', 'fust', 'ochsner', 'amazon', 'zalando', 'manor']],
  ['Bank & Finanzen', ['gebühr', 'gebuehr', 'spesen bank', 'kontoführung', 'kontofuehrung', 'zins', 'ubs', 'credit suisse', 'raiffeisen', 'zkb', 'zürcher kantonalbank', 'postfinance', 'kantonalbank', 'valiant', 'migros bank', 'cler', 'sumup', 'stripe', 'payrexx', 'twint fee', 'kreditkarte', 'jahresgebühr']],
];

// Kontenrahmen KMU (Schweiz) → Kategorie
function nachKonto(nr) {
  const n = parseInt(String(nr).replace(/\D/g, ''), 10);
  if (!n || n < 3000 || n > 9999) return null;
  if (n < 4000) return 'Einnahme';
  if (n < 5000) return 'Material & Waren';
  if (n >= 5700 && n < 5800) return 'Sozialversicherungen';
  if (n >= 5800 && n < 5900) return 'Reisen & Spesen';
  if (n < 6000) return 'Personal & Löhne';
  if (n < 6100) return 'Miete & Raum';
  if (n < 6200) return 'Energie & Unterhalt';
  if (n < 6300) return 'Fahrzeuge & Transport';
  if (n < 6400) return 'Sachversicherungen';
  if (n < 6500) return 'Energie & Unterhalt';
  if (n >= 6510 && n < 6520) return 'IT, Software & Telefon';
  if (n >= 6530 && n < 6540) return 'Beratung & Treuhand';
  if (n >= 6570 && n < 6580) return 'IT, Software & Telefon';
  if (n < 6600) return 'Büro & Verwaltung';
  if (n >= 6640 && n < 6650) return 'Reisen & Spesen';
  if (n < 6700) return 'Marketing & Werbung';
  if (n < 6800) return 'Sonstiges';
  if (n < 6900) return 'Abschreibungen';
  if (n < 7000) return 'Bank & Finanzen';
  if (n >= 8900 && n < 9000) return 'Steuern';
  return 'Sonstiges';
}

// Freie Kategorienamen aus Fremd-Exporten auf unsere Kategorien abbilden
function nachName(k) {
  const s = String(k || '').trim().toLowerCase();
  if (!s) return null;
  const exakt = KATEGORIEN.find((x) => x.name.toLowerCase() === s);
  if (exakt) return exakt.name;
  for (const [kat, worte] of REGELN) if (worte.some((w) => s.includes(w.trim()))) return kat;
  if (/essen|lebensmittel|food|gastro/.test(s)) return 'Essen & Verpflegung';
  if (/auto|fahrzeug|treibstoff|transport/.test(s)) return 'Fahrzeuge & Transport';
  if (/reise|spesen/.test(s)) return 'Reisen & Spesen';
  if (/sozial|ahv|bvg|uvg|pensionskasse/.test(s)) return 'Sozialversicherungen';
  if (/versicherung/.test(s)) return 'Sachversicherungen';
  if (/personal|lohn/.test(s)) return 'Personal & Löhne';
  if (/raum|miete/.test(s)) return 'Miete & Raum';
  if (/büro|buero|verwaltung/.test(s)) return 'Büro & Verwaltung';
  if (/informatik|\bit\b|telefon|software/.test(s)) return 'IT, Software & Telefon';
  if (/werbung|marketing/.test(s)) return 'Marketing & Werbung';
  if (/abschreibung/.test(s)) return 'Abschreibungen';
  return null;
}

export function kategorisiere({ text = '', lieferant = '', konto = '', kategorie = '' } = {}) {
  const k = nachName(kategorie);
  if (k) return k;
  const s = ' ' + (lieferant + ' ' + text).toLowerCase() + ' ';
  for (const [kat, worte] of REGELN) if (worte.some((w) => s.includes(w))) return kat;
  const kk = nachKonto(konto);
  if (kk && kk !== 'Einnahme') return kk;
  return 'Sonstiges';
}

// ─── Leistungen (Zahlungszweck → saubere Bezeichnung) ────────────────
// Reihenfolge zählt: Kombinationen zuerst, dann einzelne Leistungen.
const LEISTUNGEN = [
  { name: 'Farbe & Schnitt', emoji: '🎨✂️', re: /(farb|faeb|färb|color).*(schnitt|cut)|(schnitt|cut).*(farb|faeb|färb|color)/ },
  { name: 'Haarverlängerung / Extensions', emoji: '💁‍♀️', re: /verl[äa]nger|exten|extenshion/ },
  { name: 'Balayage & Strähnen', emoji: '🌟', re: /balayage|m[eè]ch|meges|str[äa]hn|highlight/ },
  { name: 'Herrenschnitt', emoji: '💈', re: /herren|m[äa]nner|barber|bart/ },
  { name: 'Haarschnitt', emoji: '✂️', re: /schn[iy]t|schni|cut|schneid|hasrschnitt/ },
  { name: 'Haarfarbe', emoji: '🎨', re: /farb|f[äa]rb|faeb|colou?r|t[öo]nung|ansatz/ },
  { name: 'Föhnen & Styling', emoji: '💨', re: /f[öo]hn|styling|frisur|hochsteck|locken|gl[äa]tt/ },
  { name: 'Pflege & Treatment', emoji: '🧴', re: /pflege|kur\b|treatment|olaplex|keratin|maske/ },
  { name: 'Gutschein', emoji: '🎁', re: /gutschein|geschenk/ },
  { name: 'Produkte', emoji: '🛍️', re: /produkt|shampoo|spray|verkauf/ },
];
export function leistung(text) {
  const s = String(text || '').toLowerCase().replace(/^zahlungszweck:\s*/, '').replace(/\s+/g, ' ').trim();
  if (s) for (const l of LEISTUNGEN) if (l.re.test(s)) return { name: l.name, emoji: l.emoji };
  return { name: 'Weitere Leistungen', emoji: '✨' };
}

// ─── CSV ─────────────────────────────────────────────────────────────
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const SPALTEN = {
  datum: /^(datum|date|buchungsdatum|buchungstag|valuta|valutadatum|belegdatum|transaktionsdatum)/,
  betrag: /^(betrag|amount|chf|total|summe|wert|betrag chf)/,
  soll: /^(soll|belastung|ausgabe|ausgang|debit|lastschrift)/,
  haben: /^(haben|gutschrift|einnahme|eingang|credit)/,
  text: /^(text|buchungstext|beschreibung|description|verwendungszweck|mitteilung|details|bemerkung|zahlungszweck)/,
  lieferant: /^(lieferant|kreditor|empfänger|empfaenger|zahlungsempfänger|händler|haendler|merchant|partner|gegenpartei|name)/,
  kategorie: /^(kategorie|category|aufwandart|kostenart)/,
  konto: /^(konto|kontonr|sollkonto|account|aufwandkonto|gegenkonto)/,
};

export function erkenneSpalten(header) {
  const map = {};
  header.forEach((h, i) => {
    const s = String(h).trim().toLowerCase();
    for (const [feld, re] of Object.entries(SPALTEN)) if (map[feld] == null && re.test(s)) { map[feld] = i; break; }
  });
  return map;
}

export function parseBetrag(v) {
  if (v == null) return NaN;
  let s = String(v).replace(/chf|fr\.|sfr/gi, '').replace(/[\s'’]/g, '').trim();
  if (!s) return NaN;
  const neg = /^-|-$|^\(.*\)$/.test(s);
  s = s.replace(/[()\-+]/g, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return neg ? -n : n;
}

export function parseDatum(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function lieferantAusText(t) {
  return String(t || '')
    .replace(/\b(kauf|einkauf|zahlung|dienstleistung|belastung|debitkarte|kartenzahlung|e-banking|twint|lastschrift|dauerauftrag|gutschrift|auftrag)\b/gi, ' ')
    .replace(/\b(nr\.?|karte|kartennummer)\s*[\dx*]+/gi, ' ')
    .replace(/\d{2}[./]\d{2}[./]\d{2,4}/g, ' ')
    .replace(/[|:;,].*$/, '')
    .replace(/\s+/g, ' ').trim()
    .split(' ').slice(0, 4).join(' ');
}

// CSV-Text → Buchungen im Speicherformat
export function csvZuBuchungen(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { buchungen: [], fehler: 'Keine Daten gefunden.' };
  let h = 0;
  while (h < Math.min(rows.length, 15) && erkenneSpalten(rows[h]).datum == null) h++;
  if (h >= Math.min(rows.length, 15)) return { buchungen: [], fehler: 'Keine Datum-Spalte erkannt.' };
  const sp = erkenneSpalten(rows[h]);
  if (sp.betrag == null && sp.soll == null && sp.haben == null) return { buchungen: [], fehler: 'Keine Betrag-Spalte erkannt.' };

  const data = rows.slice(h + 1);
  const betraege = sp.betrag != null ? data.map((r) => parseBetrag(r[sp.betrag])).filter(Number.isFinite) : [];
  const vorzeichen = betraege.some((b) => b < 0); // Bankexport: negativ = Ausgabe

  const buchungen = [];
  for (const r of data) {
    const d = parseDatum(r[sp.datum]);
    if (!d) continue;
    let b, typ = 'A';
    if (sp.soll != null || sp.haben != null) {
      const soll = parseBetrag(r[sp.soll]);
      const haben = parseBetrag(r[sp.haben]);
      if (Number.isFinite(soll) && soll !== 0) b = Math.abs(soll);
      else if (Number.isFinite(haben) && haben !== 0) { b = Math.abs(haben); typ = 'E'; }
    } else {
      const v = parseBetrag(r[sp.betrag]);
      if (Number.isFinite(v)) { b = Math.abs(v); if (vorzeichen && v > 0) typ = 'E'; }
    }
    if (!b) continue;
    const t = (r[sp.text] || '').trim();
    const konto = sp.konto != null ? r[sp.konto] : '';
    if (nachKonto(konto) === 'Einnahme') typ = 'E';
    const l = (sp.lieferant != null ? r[sp.lieferant] : '').trim() || lieferantAusText(t);
    const k = typ === 'E' ? 'Umsatz' : kategorisiere({ text: t, lieferant: l, konto, kategorie: sp.kategorie != null ? r[sp.kategorie] : '' });
    buchungen.push({ d, b: Math.round(b * 100) / 100, k, l, t, typ });
  }
  return { buchungen, spalten: sp, kopfzeile: rows[h] };
}
