"""
Glatt Broker — Multi-Page Build Script
======================================

Liest die bestehende Single-Page index.html (Backup unter _old/index-singlepage.html)
und baut daraus 6 dedizierte Seiten:

  /                      Privatkunden-Landing
  /krankenkasse.html     KK-Rechner + VVG-Vergleich
  /vorsorge.html         3. Säule Strategie
  /team.html             Über uns + Team + Trust + Stimmen
  /partner.html          Tippgeber + Kooperation Public
  /kontakt.html          Kontakt + 360sicht-Mandat

Shared Komponenten (HEAD, NAV, FOOTER, Modal, JS) werden aus der Quelle
extrahiert und in jede Seite injiziert. Jede Seite ist standalone HTML,
keine Build-Step im Browser nötig.

Re-run mit: python _build/build.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
SRC = ROOT / '_old' / 'index-singlepage.html'

src = SRC.read_text(encoding='utf-8')

# ─── EXTRAKTOREN ─────────────────────────────────────────────────────

def extract_head():
    """Alles von <head> bis </head>, aber Title wird ersetzbar."""
    m = re.search(r'<head>([\s\S]*?)</head>', src)
    head = m.group(1)
    # Replace the title so we can substitute per-page
    head = re.sub(r'<title>[^<]*</title>', '__PAGE_TITLE__', head)
    head = re.sub(r'<meta name="description"[^>]*>', '__PAGE_DESCRIPTION__', head)
    return head

def extract_loader():
    m = re.search(r'<!-- ─+ LOADER ─+ -->[\s\S]*?</div>\s*\n', src)
    return m.group(0) if m else ''

def extract_nav():
    """NAV + Mobile-Menü Overlay."""
    m_nav = re.search(r'<!-- ─+ NAV ─+ -->[\s\S]*?</header>', src)
    m_menu = re.search(r'<!-- Mobile-Menü Overlay -->[\s\S]*?</div>\s*</div>\s*</div>', src)
    nav = m_nav.group(0) if m_nav else ''
    menu = m_menu.group(0) if m_menu else ''
    return nav + '\n\n  ' + menu

def extract_footer():
    m = re.search(r'<!-- ─+ FOOTER ─+ -->[\s\S]*?</footer>', src)
    return m.group(0) if m else ''

def extract_modal():
    m = re.search(r'<!-- ─+ 360sicht-Modal ─+ -->[\s\S]*?</div>\s*</div>\s*</div>', src)
    return m.group(0) if m else ''

def extract_scripts():
    m = re.search(r'<!-- ─+ SCRIPTS ─+ -->[\s\S]*?</script>\s*\n', src)
    return m.group(0) if m else ''

def extract_section(section_id):
    """Extrahiert <section id="X">...</section> samt Kommentar-Marker davor."""
    pat = rf'(\s*<!-- ─+[^<]*─+ -->\s*)?<section\s+id="{section_id}"[^>]*>[\s\S]*?</section>'
    m = re.search(pat, src)
    return m.group(0) if m else f'<!-- MISSING: {section_id} -->'

def extract_hero():
    m = re.search(r'<!-- ─+ HERO ─+ -->[\s\S]*?</section>', src)
    return m.group(0) if m else ''

def extract_marquee():
    m = re.search(r'<!-- ─+ PARTNER MARQUEE ─+ -->[\s\S]*?</section>', src)
    return m.group(0) if m else ''

# ─── SHARED PIECES ───────────────────────────────────────────────────

HEAD     = extract_head()
LOADER   = extract_loader()
NAV      = extract_nav()
FOOTER   = extract_footer()
MODAL    = extract_modal()
SCRIPTS  = extract_scripts()

# Original Hero, Marquee + alle Sections nach ID
HERO_ORIG = extract_hero()
MARQUEE   = extract_marquee()

SECTIONS = {
    sid: extract_section(sid) for sid in [
        'customer', 'calculator', 'strategy', 'vvg', 'tippgeber',
        'difference', 'services', 'process', 'trust', 'team',
        'voices', 'faq', 'contact'
    ]
}

# ─── PAGE-SPECIFIC HEROES ────────────────────────────────────────────

def hero_page(eyebrow, title_html, sub):
    """Slim hero variant for sub-pages."""
    return f'''
    <!-- ───────────── HERO (Sub-Page) ───────────── -->
    <section class="relative pt-32 pb-12 lg:pt-40 lg:pb-16 overflow-hidden">
      <div class="absolute inset-0 grid-bg pointer-events-none" aria-hidden="true"></div>
      <div class="absolute -top-40 -right-40 w-[500px] h-[500px] bg-brand-100 rounded-full blur-3xl opacity-30 pointer-events-none" aria-hidden="true"></div>
      <div class="relative mx-auto max-w-[1320px] px-4 sm:px-6">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 mb-5 text-sm text-ink-700">
            <span class="pulse-dot"></span><span class="font-medium">{eyebrow}</span>
          </div>
          <h1 class="display text-[8vw] sm:text-[5.5vw] lg:text-[4.5vw] tracking-tightest">{title_html}</h1>
          <p class="mt-6 text-lg lg:text-xl text-ink-700 max-w-2xl leading-relaxed">{sub}</p>
        </div>
      </div>
    </section>'''

# Tools-Overview Karten für Home (ersetzt KK+Vorsorge+VVG für die Privatkunden-Landing)
TOOLS_OVERVIEW = '''
    <!-- ───────────── TOOLS-ÜBERSICHT (Home) ───────────── -->
    <section class="py-20 lg:py-28">
      <div class="mx-auto max-w-[1320px] px-4 sm:px-6">
        <div class="max-w-3xl mb-14">
          <div class="label text-brand-600 mb-4">— Unsere Tools für Sie</div>
          <h2 class="display text-[7vw] sm:text-[5vw] lg:text-[3.8vw] tracking-tightest">
            <span>Sofort sehen,</span> <span class="text-brand-600">was möglich ist.</span>
          </h2>
          <p class="mt-5 text-lg text-ink-700 max-w-xl">
            Drei interaktive Rechner mit echten Schweizer Daten — Sie sehen das Sparpotenzial bevor wir uns überhaupt unterhalten.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <!-- KK -->
          <a href="krankenkasse.html" class="card !rounded-3xl p-7 lg:p-8 group hover:!border-brand-600 transition-all">
            <div class="w-12 h-12 rounded-xl bg-brand-50 grid place-items-center mb-5 group-hover:bg-brand-600 transition-colors">
              <svg class="w-6 h-6 text-brand-600 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/></svg>
            </div>
            <h3 class="display text-2xl mb-2">Krankenkassen-Vergleich</h3>
            <p class="text-sm text-ink-700 leading-relaxed mb-5">Echte BAG-Daten 2026, ganze Familie auf einer Seite, alle 5 Glatt-Partner — CSS, Helsana, Swica, Concordia, Sympany.</p>
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
              <span>Familie vergleichen</span>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </span>
          </a>
          <!-- Vorsorge -->
          <a href="vorsorge.html" class="card !rounded-3xl p-7 lg:p-8 group hover:!border-brand-600 transition-all">
            <div class="w-12 h-12 rounded-xl bg-brand-50 grid place-items-center mb-5 group-hover:bg-brand-600 transition-colors">
              <svg class="w-6 h-6 text-brand-600 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="m7 17 4-7 4 4 6-9"/></svg>
            </div>
            <h3 class="display text-2xl mb-2">Vorsorge & 3. Säule</h3>
            <p class="text-sm text-ink-700 leading-relaxed mb-5">Mit unserer Strategie aus Bank- und Versicherungslösungen — animiertes Vermögensaufbau-Diagramm bis 65, Steuerersparnis live.</p>
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
              <span>Strategie ansehen</span>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </span>
          </a>
          <!-- VVG -->
          <a href="krankenkasse.html#vvg" class="card !rounded-3xl p-7 lg:p-8 group hover:!border-brand-600 transition-all">
            <div class="w-12 h-12 rounded-xl bg-brand-50 grid place-items-center mb-5 group-hover:bg-brand-600 transition-colors">
              <svg class="w-6 h-6 text-brand-600 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            </div>
            <h3 class="display text-2xl mb-2">VVG-Vergleich</h3>
            <p class="text-sm text-ink-700 leading-relaxed mb-5">Was deckt welche Zusatzversicherung wirklich? Filter nach Brille, Fitness, Alternativmedizin, Spital — direkt vergleichen.</p>
            <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
              <span>Leistungen vergleichen</span>
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </span>
          </a>
        </div>
      </div>
    </section>'''

# Mini-Contact für sub-pages (kurze CTA, nicht der ganze Contact-Block)
MINI_CONTACT = '''
    <!-- ───────────── MINI-CONTACT ───────────── -->
    <section class="py-16 lg:py-20 bg-ink-950 text-white relative overflow-hidden">
      <div class="absolute -right-40 top-0 w-[400px] h-[400px] bg-brand-600/20 blur-3xl rounded-full" aria-hidden="true"></div>
      <div class="relative mx-auto max-w-[1320px] px-4 sm:px-6">
        <div class="grid lg:grid-cols-12 gap-8 items-center">
          <div class="lg:col-span-7">
            <div class="label text-brand-500 mb-3">— Persönliches Gespräch</div>
            <h2 class="display text-3xl lg:text-4xl tracking-tightest">30 Minuten · kostenlos · unverbindlich.</h2>
            <p class="text-white/70 mt-4 max-w-xl">Antwort innerhalb eines Werktages. Telefon, Video oder vor Ort — wie es Ihnen passt.</p>
          </div>
          <div class="lg:col-span-5 flex flex-col gap-2">
            <a href="tel:+41774090519" class="group inline-flex items-center justify-between gap-4 p-4 rounded-xl border border-white/15 hover:border-brand-500 hover:bg-white/5 transition-all">
              <div>
                <div class="label text-white/50 mb-1">Telefon</div>
                <div class="display text-xl group-hover:text-brand-500 transition-colors num-tabular">+41 77 409 05 19</div>
              </div>
              <svg class="w-5 h-5 text-white/50 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
            <a href="kontakt.html" class="group inline-flex items-center justify-between gap-4 p-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white transition-all">
              <div>
                <div class="label text-white/70 mb-1">Beratung anfragen</div>
                <div class="display text-xl">Rückruf-Formular →</div>
              </div>
              <svg class="w-5 h-5 group-hover:translate-x-1 transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
          </div>
        </div>
      </div>
    </section>'''

# ─── NAV: Convert from anchor-links to page-links ────────────────────

def fix_nav_for_multipage(nav_html, current_page):
    """Replace #anchor links with page links + mark current."""
    replacements = [
        # Header-Nav (Desktop + Mobile Menu)
        ('href="#calculator"', 'href="krankenkasse.html"'),
        ('href="#strategy"',   'href="vorsorge.html"'),
        ('href="#vvg"',        'href="krankenkasse.html#vvg"'),
        ('href="#tippgeber"',  'href="partner.html"'),
        ('href="#team"',       'href="team.html"'),
        ('href="#services"',   'href="team.html#services"'),
        ('href="#difference"', 'href="team.html#difference"'),
        ('href="#process"',    'href="krankenkasse.html#process"'),
        ('href="#voices"',     'href="team.html#voices"'),
        ('href="#faq"',        'href="index.html#faq"'),
        ('href="#contact"',    'href="kontakt.html"'),
        # "#top" → home
        ('href="#top"',        'href="index.html"'),
    ]
    out = nav_html
    for old, new in replacements:
        out = out.replace(old, new)
    return out

def fix_links_in_section(html):
    """Fix inter-page #anchor references that appear inside sections."""
    return fix_nav_for_multipage(html, '')

# ─── PAGE TEMPLATE ───────────────────────────────────────────────────

def render_page(*, slug, title, description, body_html):
    head = HEAD.replace('__PAGE_TITLE__', f'<title>{title}</title>')
    head = head.replace('__PAGE_DESCRIPTION__', f'<meta name="description" content="{description}" />')
    nav = fix_nav_for_multipage(NAV, slug)
    footer = fix_links_in_section(FOOTER)
    modal = MODAL
    scripts = SCRIPTS
    body_fixed = fix_links_in_section(body_html)
    return f'''<!DOCTYPE html>
<html lang="de" class="scroll-smooth">
<head>{head}</head>
<body>
{LOADER}
{nav}

  <main id="top">
{body_fixed}
  </main>

{footer}

{modal}

{scripts}
</body>
</html>
'''

# ─── PAGE DEFINITIONEN ───────────────────────────────────────────────

# 1) HOME — Privatkunden-Landing
home_hero_text = '''<span data-i18n="hero.title.1">Versicherung,</span><br>
<span data-i18n="hero.title.2">die zu Ihnen </span><span class="text-brand-600" data-i18n="hero.title.3">passt</span><span data-i18n="hero.title.4">.</span>'''
home_body = HERO_ORIG + MARQUEE + TOOLS_OVERVIEW + SECTIONS['difference'] + SECTIONS['trust'] + SECTIONS['voices'] + SECTIONS['faq'] + MINI_CONTACT

# 2) KRANKENKASSE
kk_hero = hero_page(
    'Krankenkassen-Vergleich · BAG-Daten 2026',
    '<span>Wie viel könnte Ihre </span><span class="text-brand-600">Familie</span><span> sparen?</span>',
    'Echte Schweizer Prämiendaten für 2026 — alle Familienmitglieder auf einer Seite, sofortiger Vergleich mit den 5 Glatt-Partner-Krankenkassen.'
)
kk_body = kk_hero + SECTIONS['customer'] + SECTIONS['calculator'] + SECTIONS['vvg'] + SECTIONS['process'] + MINI_CONTACT

# 3) VORSORGE
vorsorge_hero = hero_page(
    '3. Säule · Glatt-Strategie',
    '<span>Was bringt Ihnen die </span><span class="text-brand-600">3. Säule</span><span> wirklich?</span>',
    'Animierter Vermögensaufbau bis 65 mit echten Stadt-Zürich-Steuersätzen, Bank- und Versicherungs-Mix, Staffelungs-Vorteil bei Auszahlung.'
)
vorsorge_body = vorsorge_hero + SECTIONS['customer'] + SECTIONS['strategy'] + MINI_CONTACT

# 4) TEAM
team_hero = hero_page(
    'Über uns · Team · Werte',
    '<span>7 Menschen.</span> <span class="text-brand-600">1 Versprechen.</span>',
    'Boutique heisst: ein Berater kennt Ihren Fall persönlich. Aussendienst kommt zu Ihnen, Innendienst hält Ihnen den Rücken frei.'
)
team_body = team_hero + SECTIONS['team'] + SECTIONS['trust'] + SECTIONS['difference'] + SECTIONS['services'] + SECTIONS['voices'] + MINI_CONTACT

# 5) PARTNER
partner_hero = hero_page(
    'Partner-Programme',
    '<span>Empfehlen oder beraten —</span><br><span class="text-brand-600">wir profitieren gemeinsam.</span>',
    'Tippgeber empfehlen Kunden aus ihrem Netzwerk (CHF 10/Pt). Kooperationspartner beraten direkt unter unserer Lizenz (CHF 25–45/Pt).'
)
# Login-Hinweis-Card (für Partner-Page oben)
partner_login_hint = '''
    <section class="py-8">
      <div class="mx-auto max-w-[1320px] px-4 sm:px-6">
        <div class="rounded-2xl bg-ink-950 text-white p-5 lg:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="grid place-items-center w-10 h-10 rounded-full bg-brand-600">
              <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <div class="font-semibold">Bereits Partner?</div>
              <div class="text-sm text-cream-50/70">Login zu Ihrem Dashboard mit Lead-Pipeline und Provisionen</div>
            </div>
          </div>
          <a href="partner/login.html" class="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-ink-950 hover:bg-brand-500 hover:text-white px-5 py-3 font-medium transition-colors">
            <span>Zum Partner-Login</span>
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </a>
        </div>
      </div>
    </section>'''
partner_body = partner_hero + partner_login_hint + SECTIONS['tippgeber']

# 6) KONTAKT
kontakt_hero = hero_page(
    'Kontakt',
    '<span>Lassen Sie</span> <span class="text-brand-600">uns reden.</span>',
    '30 Minuten, kostenlos und unverbindlich. Antwort innerhalb eines Werktages.'
)
kontakt_body = kontakt_hero + SECTIONS['contact']

# ─── BUILD ───────────────────────────────────────────────────────────

pages = [
    ('index.html',        'Glatt Broker AG · Versicherung, Vorsorge, Steuern',     'FINMA-zertifizierte unabhängige Versicherungs-, Vorsorge- und Steuerberatung in der Schweiz. KK-Familienvergleich, 3. Säule Strategie, VVG-Leistungen.', home_body),
    ('krankenkasse.html', 'Krankenkassen-Vergleich · Familie · Glatt Broker',      'Echte BAG-Prämiendaten 2026 für die ganze Familie. Vergleich mit CSS, Helsana, Swica, Concordia, Sympany.', kk_body),
    ('vorsorge.html',     '3. Säule & Vorsorge-Strategie · Glatt Broker',          'Animierte Vermögensaufbau-Strategie bis Pensionierung. Bank- und Versicherungs-Mix, Steueroptimierung mit Stadt-Zürich-Sätzen.', vorsorge_body),
    ('team.html',         'Über uns · Team · Glatt Broker AG',                     'Sieben Menschen, ein Versprechen: persönliche Boutique-Beratung statt Versicherungs-Fabrik. FINMA-registriert, Cicero-zertifiziert.', team_body),
    ('partner.html',      'Partner-Programme · Tippgeber & Kooperation · Glatt Broker', 'Tippgeber empfehlen Kunden (CHF 10/Pt). Kooperationspartner beraten unter unserer FINMA-Lizenz (CHF 25–45/Pt). Mit Punkte-Rechner.', partner_body),
    ('kontakt.html',      'Kontakt · Glatt Broker AG',                             'Persönliche Beratung in der Schweiz. 30 Minuten, kostenlos, unverbindlich. Antwort innerhalb eines Werktages.', kontakt_body),
]

for slug, title, desc, body in pages:
    out_path = ROOT / slug
    html = render_page(slug=slug, title=title, description=desc, body_html=body)
    out_path.write_text(html, encoding='utf-8')
    size_kb = len(html) / 1024
    print(f'{slug:24s}  {size_kb:6.0f} KB')

print(f'\nDone. {len(pages)} pages written to {ROOT}')
