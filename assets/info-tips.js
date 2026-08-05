/* =====================================================================
   Glatt Broker — Info-«i»-System
   Zeigt verständliche Erklärungen, wo Kunden unsicher sein könnten.
   Markup:  <button class="gb-i" data-term="kgv" type="button"></button>
            ODER ein beliebiges Element mit data-term="...".
   Quelle der Texte: window.GB_GLOSSAR (finanz-glossar.js).
   Klick = öffnen/schliessen (mobil-tauglich), Klick ausserhalb = zu,
   Esc = zu. Keine Abhängigkeiten.
   ===================================================================== */
(function () {
  'use strict';
  if (window.__gbInfoInit) return;
  window.__gbInfoInit = true;

  var STYLE =
    '.gb-i{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;'+
    'border-radius:50%;border:1px solid currentColor;color:#CC2936;font:600 11px/1 system-ui,sans-serif;'+
    'cursor:pointer;vertical-align:middle;margin-left:5px;opacity:.85;user-select:none;flex:none}'+
    '.gb-i:hover{opacity:1;background:#CC2936;color:#fff;border-color:#CC2936}'+
    '.gb-i::before{content:"i";font-style:normal}'+
    '.gb-pop{position:absolute;z-index:9999;max-width:300px;background:#fff;color:#15181f;'+
    'border:1px solid #e6e6e2;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);'+
    'padding:13px 15px;font:400 13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}'+
    '.gb-pop h4{margin:0 0 5px;font-size:13.5px;font-weight:600;color:#15181f}'+
    '.gb-pop .gb-bsp{margin-top:7px;padding-top:7px;border-top:1px solid #f0f0ee;color:#6b7280;font-size:12.5px}'+
    '.gb-pop .gb-bsp b{color:#15181f;font-weight:600}'+
    '.gb-pop-x{position:absolute;top:7px;right:9px;cursor:pointer;color:#9ca3af;font-size:15px;line-height:1}';

  function injectStyle() {
    if (document.getElementById('gb-i-style')) return;
    var s = document.createElement('style');
    s.id = 'gb-i-style';
    s.textContent = STYLE;
    (document.head || document.documentElement).appendChild(s);
  }

  var openPop = null;
  function closePop() {
    if (openPop && openPop.parentNode) openPop.parentNode.removeChild(openPop);
    openPop = null;
  }

  function showPop(anchor, term) {
    closePop();
    var g = (window.GB_GLOSSAR || {})[term];
    if (!g) { return; }
    var pop = document.createElement('div');
    pop.className = 'gb-pop';
    var html =
      '<span class="gb-pop-x" aria-label="Schliessen">&times;</span>' +
      '<h4>' + esc(g.title || term) + '</h4>' +
      '<div>' + esc(g.def || '') + '</div>';
    if (g.beispiel) html += '<div class="gb-bsp"><b>Beispiel:</b> ' + esc(g.beispiel) + '</div>';
    pop.innerHTML = html;
    document.body.appendChild(pop);

    // Positionieren unterhalb des «i», innerhalb des Viewports
    var r = anchor.getBoundingClientRect();
    var sx = window.pageXOffset, sy = window.pageYOffset;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = sx + r.left;
    if (left + pw > sx + document.documentElement.clientWidth - 12) {
      left = sx + document.documentElement.clientWidth - pw - 12;
    }
    if (left < sx + 8) left = sx + 8;
    var top = sy + r.bottom + 7;
    // Wenn unten kein Platz: oberhalb zeigen
    if (r.bottom + ph + 12 > document.documentElement.clientHeight && r.top - ph - 7 > 0) {
      top = sy + r.top - ph - 7;
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';

    pop.querySelector('.gb-pop-x').addEventListener('click', function (e) {
      e.stopPropagation(); closePop();
    });
    openPop = pop;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Klick-Delegation: öffnet/schliesst Tooltip
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-term]') : null;
    if (t) {
      e.preventDefault(); e.stopPropagation();
      var term = t.getAttribute('data-term');
      // Toggle: gleicher Begriff nochmal → schliessen
      if (openPop && openPop.getAttribute('data-term') === term) { closePop(); return; }
      showPop(t, term);
      if (openPop) openPop.setAttribute('data-term', term);
      return;
    }
    if (openPop && !e.target.closest('.gb-pop')) closePop();
  });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });
  window.addEventListener('resize', closePop);
  window.addEventListener('scroll', closePop, true);

  injectStyle();
})();
