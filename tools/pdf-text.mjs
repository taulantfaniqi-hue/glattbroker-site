// Hilfswerkzeug: Text eines PDFs zeilenweise ausgeben (zum Prüfen von Auslese-Regeln)
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), useSystemFonts: true, verbosity: 0 }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  const rows = new Map();
  for (const it of tc.items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    const k = [...rows.keys()].find((x) => Math.abs(x - y) <= 2) ?? y;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push({ x: it.transform[4], s: it.str });
  }
  console.log(`--- Seite ${p}`);
  [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([y, r]) => console.log(y, '|', r.sort((a, b) => a.x - b.x).map((x) => x.s).join(' ')));
}
