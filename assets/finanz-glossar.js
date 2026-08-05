/* =====================================================================
   Glatt Broker — Finanz-Glossar (verständliche Erklärungen für Kunden)
   Quelle Anlage-/Kennzahlen-Begriffe: Wissensbasis «Grundlagen der
   Aktienanalyse» (NotebookLM-Extrakt, 2026-05). Vorsorge-/Versicherungs-
   Begriffe: Schweizer Standard (BVG/KVG/VVG).
   Nutzung: window.GB_GLOSSAR['kgv'] → { title, def, beispiel }
   Wird vom Info-«i»-System (info-tips.js) angezeigt.
   ===================================================================== */
window.GB_GLOSSAR = {
  /* ---------- Vorsorge / 3. Säule ---------- */
  'saeule-3a': {
    title: 'Säule 3a (gebundene Vorsorge)',
    def: 'Freiwilliges Sparen fürs Alter mit Steuervorteil. Einzahlungen dürfen Sie vom steuerbaren Einkommen abziehen. Das Geld ist bis kurz vor der Pensionierung gebunden (Ausnahmen: Wohneigentum, Selbstständigkeit, Wegzug).',
    beispiel: '2026 maximal CHF 7’258 mit Pensionskasse. Bei 25 % Grenzsteuersatz spart das rund CHF 1’800 Steuern pro Jahr.'
  },
  '3a-bank': {
    title: '3a-Bank-Lösung',
    def: 'Säule-3a-Konto oder -Wertschriftendepot bei einer Bank. Flexibel: Sie bestimmen die Einzahlung jedes Jahr neu und können in Fonds/ETF anlegen. Kein Versicherungsschutz inbegriffen.',
    beispiel: 'Gut für Leute, die maximale Flexibilität und tiefe Kosten wollen.'
  },
  '3a-versicherung': {
    title: '3a-Versicherungs-Lösung',
    def: 'Säule 3a kombiniert mit Schutz: Bei Tod oder Erwerbsunfähigkeit zahlt die Versicherung weiter ein oder eine Summe aus. Dafür ist man an eine feste Jahresprämie über die Laufzeit gebunden.',
    beispiel: 'Sinnvoll für Familien mit Kindern oder Hypothek, die das Sparziel absichern wollen.'
  },
  'vers-anteil': {
    title: 'Versicherungs-Anteil',
    def: 'Wie viel Ihres 3a-Sparens in die Versicherungs-Lösung (mit Schutz) statt in die reine Bank-Lösung fliesst. Mehr Versicherung = mehr Absicherung, weniger Flexibilität.',
    beispiel: 'Empfehlung Glatt Broker: 30–50 % Versicherung, Rest Bank — kombiniert Schutz mit Flexibilität.'
  },
  'koordinationsabzug': {
    title: 'Koordinationsabzug',
    def: 'Betrag, der in der Pensionskasse (2. Säule) vom Lohn abgezogen wird, weil dieser Teil bereits über die AHV versichert ist. Dadurch ist nur der Lohn darüber BVG-versichert.',
    beispiel: 'Tieflöhne und Teilzeit sind oft schlecht versichert — ein häufiger Grund für eine 3a-Beratung.'
  },
  'deckungsluecke': {
    title: 'Vorsorge-/Deckungslücke',
    def: 'Differenz zwischen dem Einkommen, das Sie im Alter oder bei Invalidität brauchen, und dem, was AHV + Pensionskasse tatsächlich zahlen. Die 3. Säule schliesst diese Lücke.',
    beispiel: 'Faustregel: Renten aus 1. und 2. Säule decken oft nur ~60 % des letzten Lohns.'
  },

  /* ---------- Krankenkasse / Versicherung ---------- */
  'kvg': {
    title: 'KVG — Grundversicherung',
    def: 'Obligatorische Krankenversicherung. Leistungen sind gesetzlich für alle gleich — nur Prämie und Franchise unterscheiden sich je Kasse.',
    beispiel: 'Ein Kassenwechsel spart bei gleichen Leistungen oft mehrere hundert Franken pro Jahr.'
  },
  'vvg': {
    title: 'VVG — Zusatzversicherung',
    def: 'Freiwillige Zusatzdeckung über die Grundversicherung hinaus (z. B. Spitalabteilung, Zahn, Ausland, Alternativmedizin). Leistungen und Aufnahme sind je Anbieter verschieden.',
    beispiel: 'Hier lohnt sich ein Vergleich besonders, weil die Anbieter sehr unterschiedlich sind.'
  },
  'franchise': {
    title: 'Franchise',
    def: 'Betrag, den Sie pro Jahr selbst zahlen, bevor die Kasse zahlt. Höhere Franchise = tiefere Prämie, aber mehr Eigenrisiko.',
    beispiel: 'Wer selten zum Arzt geht, fährt mit der höchsten Franchise (CHF 2’500) meist günstiger.'
  },

  /* ---------- Anlage-Kennzahlen (Quelle: Aktienanalyse-Wissensbasis) ---------- */
  'kgv': {
    title: 'KGV — Kurs-Gewinn-Verhältnis',
    def: 'Aktienkurs geteilt durch den Gewinn pro Aktie. Zeigt, wie teuer eine Aktie im Verhältnis zum Gewinn ist. Ein tiefes KGV deutet auf eine mögliche Unterbewertung hin.',
    beispiel: 'Kurs 100, Gewinn 5 pro Aktie → KGV 20: Sie zahlen das 20-Fache eines Jahresgewinns.'
  },
  'kbv': {
    title: 'KBV — Kurs-Buchwert-Verhältnis',
    def: 'Börsenwert geteilt durch den Buchwert (Eigenkapital) der Firma. Ein tiefes KBV kann auf ein unterbewertetes Unternehmen hindeuten.',
    beispiel: 'KBV unter 1 heisst: die Börse bewertet die Firma tiefer als ihr bilanziertes Eigenkapital.'
  },
  'dividendenrendite': {
    title: 'Dividendenrendite',
    def: 'Jährliche Dividende geteilt durch den Aktienkurs, in Prozent. Zeigt, wie viel laufenden Ertrag eine Aktie abwirft — ähnlich einem «Zins» auf die Anlage.',
    beispiel: 'Dividende CHF 3 bei Kurs CHF 100 → 3 % Dividendenrendite.'
  },
  'beta': {
    title: 'Beta (Schwankungsmass)',
    def: 'Misst, wie stark eine Anlage im Vergleich zum Gesamtmarkt schwankt. Beta über 1 = schwankt stärker als der Markt, Beta unter 1 = ruhiger.',
    beispiel: 'Beta 1,3 bedeutet: Steigt der Markt 10 %, steigt die Aktie tendenziell ~13 % (und umgekehrt).'
  },
  'volatilitaet': {
    title: 'Volatilität',
    def: 'Mass für die Schwankungsbreite einer Anlage. Hohe Volatilität = grössere Ausschläge nach oben und unten = mehr Risiko, aber auch mehr Chance.',
    beispiel: 'Aktien schwanken stärker als Obligationen — darum mischt man je nach Risikotyp.'
  },
  'diversifikation': {
    title: 'Diversifikation (Streuung)',
    def: 'Das Vermögen auf viele verschiedene Anlagen verteilen, damit nicht ein einzelner Verlust alles trifft. Reduziert das Risiko, ohne die erwartete Rendite stark zu senken.',
    beispiel: 'Ein Index-Fonds (ETF) enthält hunderte Firmen auf einmal — automatische Streuung.'
  },
  'index-strategie': {
    title: 'Index-Strategie / ETF',
    def: 'Anlegen in einen ganzen Markt-Index (z. B. SMI, Welt) statt einzelne Aktien zu wählen. Breit gestreut, tiefe Kosten, transparent.',
    beispiel: 'Die 3a-Anlagepläne von Generali und Swiss Life basieren auf solchen breit gestreuten Index-Strategien.'
  },
  'systematisches-risiko': {
    title: 'Systematisches vs. unsystematisches Risiko',
    def: 'Systematisch = Marktrisiko, das alle trifft (z. B. Krise) und sich nicht wegstreuen lässt. Unsystematisch = firmenspezifisch und durch Streuung (Diversifikation) vermeidbar.',
    beispiel: 'Eine einzelne Firma kann pleitegehen (unsystematisch) — ein ganzer ETF nicht so leicht.'
  },
  'gewinnrendite': {
    title: 'Gewinnrendite',
    def: 'Kehrwert des KGV (Gewinn pro Aktie geteilt durch Kurs, mal 100). Zeigt die Verzinsung des eingesetzten Kapitals. Je höher, desto eher lohnt sich der Kauf.',
    beispiel: 'KGV 20 → Gewinnrendite 5 % (1 geteilt durch 20).'
  },
  'barwert': {
    title: 'Barwert-Konzept (Diskontierung)',
    def: 'Künftiges Geld ist heute weniger wert als der gleiche Betrag sofort. Der «Barwert» rechnet zukünftige Erträge auf heute zurück — Grundlage jeder seriösen Bewertung.',
    beispiel: 'CHF 1’000 in 10 Jahren sind bei 3 % heute nur rund CHF 744 wert.'
  },

  /* ---------- Steuern ---------- */
  'verrechnungssteuer': {
    title: 'Verrechnungssteuer (35 %)',
    def: 'Der Bund behält auf Dividenden und Zinsen 35 % ein. Diese bekommen Sie zurück, sofern Sie die Erträge in der Steuererklärung korrekt deklarieren.',
    beispiel: 'CHF 100 Dividende → CHF 65 ausbezahlt, CHF 35 zurück über die Steuererklärung.'
  },
  'grenzsteuersatz': {
    title: 'Grenzsteuersatz',
    def: 'Der Steuersatz auf dem zuletzt verdienten (oder gesparten) Franken. Entscheidend dafür, wie viel ein 3a-Abzug wirklich an Steuern spart.',
    beispiel: 'Bei 25 % Grenzsteuersatz spart eine 3a-Einzahlung von CHF 7’258 rund CHF 1’800.'
  },
  'kapitalbezugssteuer': {
    title: 'Kapitalbezugssteuer',
    def: 'Einmalige, reduzierte Steuer, wenn Vorsorgekapital (3a oder Pensionskasse) als Kapital bezogen wird — getrennt vom übrigen Einkommen.',
    beispiel: 'Mehrere 3a-Konten gestaffelt über verschiedene Jahre zu beziehen senkt diese Steuer (Progression brechen).'
  }
};
