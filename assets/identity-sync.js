/* ──────────────────────────────────────────────────────────────────
 * Identity-Sync — automatisches Vorausfüllen über alle Formulare
 *
 * Liest/schreibt `window.glattCustomer` (localStorage: glatt-customer-v1).
 * Sobald ein Identity-Feld ausgefüllt wird, ist es auf allen anderen
 * Seiten/Formularen vorausgefüllt.
 *
 * Mapping: Form-Field-ID → glattCustomer-Key
 * ────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const KEY = 'glatt-customer-v1';

  // Sicherstellen dass glattCustomer existiert (falls Page-Script noch nicht lief)
  if (!window.glattCustomer) {
    try { window.glattCustomer = JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { window.glattCustomer = {}; }
  }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(window.glattCustomer)); } catch {}
    try { window.dispatchEvent(new CustomEvent('glatt:customer')); } catch {}
  }

  // Form-Field-IDs → kanonischer Key in glattCustomer
  // Hinweis: tgKundeName / tgKundeTel sind Daten des EMPFOHLENEN Kunden,
  // nicht des Tippgebers selbst → bewusst NICHT gemappt.
  const MAP = [
    // Krankenkassen-Rechner (auf mehreren Seiten eingebettet)
    ['custFirst', 'firstName'],
    ['custLast',  'lastName'],
    ['custEmail', 'email'],
    ['custBirth', 'birthdate'],
    ['custPlz',   'plzDisplay'],
    // Vorsorge-Strategie (zweite Eingabespalte)
    ['sFirst',    'firstName'],
    ['sLast',     'lastName'],
    ['sBirth',    'birthdate'],
    ['sPlz',      'plzDisplay'],
    // Tippgeber-Programm (partner.html)
    ['tgFirst',   'firstName'],
    ['tgLast',    'lastName'],
    ['tgEmail',   'email'],
    // Kontakt-Formular (kontakt.html — Vor- + Nachname als ein Feld)
    ['fname',     'fullName'],
    ['femail',    'email'],
    ['fphone',    'phone'],
  ];

  function fullNameOrSplit() {
    const c = window.glattCustomer;
    if (c.fullName) return c.fullName;
    return [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null;
  }

  function apply() {
    const c = window.glattCustomer;
    MAP.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el || el.value) return;             // nur leere Felder vorausfüllen
      let v = (key === 'fullName') ? fullNameOrSplit() : c[key];
      if (v) {
        el.value = v;
        // existing handlers benachrichtigen (z.B. age-Berechnung bei Birthday)
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      }
    });
  }

  function bind() {
    MAP.forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const handler = () => {
        const v = (el.value || '').trim();
        if (!v) return;
        if (key === 'fullName') {
          window.glattCustomer.fullName = v;
          const parts = v.split(/\s+/);
          if (!window.glattCustomer.firstName && parts.length >= 1) window.glattCustomer.firstName = parts[0];
          if (!window.glattCustomer.lastName  && parts.length >= 2) window.glattCustomer.lastName  = parts.slice(1).join(' ');
        } else {
          window.glattCustomer[key] = v;
          // Wenn first/last separat eingegeben, fullName aktuell halten
          if (key === 'firstName' || key === 'lastName') {
            const fn = [window.glattCustomer.firstName, window.glattCustomer.lastName].filter(Boolean).join(' ').trim();
            if (fn) window.glattCustomer.fullName = fn;
          }
        }
        persist();
      };
      el.addEventListener('change', handler);
      // Auch auf 'blur' speichern, falls 'change' nicht feuert (manche Browser)
      el.addEventListener('blur', handler);
    });
  }

  function init() { apply(); bind(); }

  // Auch auf glatt:customer-Events reagieren (wenn andere Sektion auf gleicher Seite was speichert)
  window.addEventListener('glatt:customer', apply);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
