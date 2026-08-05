/* ===========================================================
   Glatt Broker AG / Baumassurance — Form-Engine (datengetrieben)
   Eine Engine rendert jedes Formular aus einer Config:
   Steps, Felder, Unterschrift, Validierung, PDF, Zusammenfassung.
   Aufruf am Seitenende:  GBForm.render(CONFIG)
   =========================================================== */
window.GB_API = window.GB_API || { endpoint: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3001' : '' }; // lokal: automatisch ans lokale CRM — im Web: 'https://api.glattbroker.ch' eintragen, leer = nur Download
(function(){
  "use strict";
  var cfg, steps, current=1;
  var sigCanvas, sigCtx, drawing=false, hasSig=false, sigRatio=1;
  var root;
  var signedAtISO=null, draftTimer=null, draftRestoring=false, submittedOnce=false, specialHooked=false;

  /* ---------- kleine Helfer ---------- */
  function E(tag, attrs, html){
    var e=document.createElement(tag);
    if(attrs) for(var k in attrs){ if(k==='class') e.className=attrs[k]; else if(k==='html') e.innerHTML=attrs[k]; else e.setAttribute(k, attrs[k]); }
    if(html!=null) e.innerHTML=html;
    return e;
  }
  function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function val(id){ var e=document.getElementById('f_'+id); return e? (e.value||'').trim() : ''; }
  function fmtDate(iso){ if(!iso) return ''; var p=iso.split('-'); return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : iso; }
  function todayISO(){ var t=new Date(); return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); }
  function optObj(o){ return (typeof o==='string') ? {value:o,label:o} : o; }

  /* ---------- Aufbau ---------- */
  window.GBForm = { render: render };

  function render(config){
    cfg = config;
    document.title = cfg.title + (cfg.subtitle?(' — '+cfg.subtitle):'') + ' | Glatt Broker AG';
    // Steps zusammensetzen. Standard: Daten → (Vertragstext) → (Unterschrift) → Abschluss.
    // Mit cfg.legalFirst: (Vertragstext+Umfang) → Daten → (Unterschrift) → Abschluss.
    var dataSteps = cfg.steps.map(function(s){ return {kind:'data', def:s}; });
    steps = [];
    if(cfg.legal && cfg.legalFirst) steps.push({kind:'legal', def:cfg.legal});
    steps = steps.concat(dataSteps);
    if(cfg.legal && !cfg.legalFirst) steps.push({kind:'legal', def:cfg.legal});
    if(cfg.signature) steps.push({kind:'sign'});
    steps.push({kind:'done'});

    root = document.getElementById('gb-root') || document.body;
    root.innerHTML = '';
    root.appendChild(buildHeader());
    var main = E('main');
    main.appendChild(buildDemoNote());
    main.appendChild(buildPills());
    var card = E('div',{class:'card'});
    steps.forEach(function(st,i){ card.appendChild(buildPanel(st,i+1)); });
    main.appendChild(card);
    root.appendChild(main);

    initSignature();
    var d=document.getElementById('f_datum'); if(d && !d.value) d.value=todayISO();
    var restored=draftRestore();
    prefillIdentity();
    if(restored) showDraftNote();
    setStep(1);
  }

  function buildHeader(){
    var h=E('header',{class:'appbar'});
    h.innerHTML =
      '<div class="appbar-inner">'+
        '<a class="brand" href="index.html"><img class="brand-logo" src="assets/logo-app.png" alt="Glatt Broker AG"><span class="brand-tag">Online-Formulare</span></a>'+
        '<a class="back" href="index.html" style="margin-left:auto">‹ Alle Formulare</a>'+
        '<div class="cobroker" style="margin-left:18px">Partner<b>Baumassurance AG</b></div>'+
      '</div>';
    return h;
  }
  function buildDemoNote(){
    var sendInfo = (window.GB_API && window.GB_API.endpoint)
      ? 'Beim Abschluss wird Ihr PDF sicher an Glatt Broker übermittelt und zusätzlich auf Ihrem Gerät gespeichert. Eingaben werden lokal zwischengespeichert (Entwurf).'
      : 'Eingaben bleiben lokal im Browser; das PDF wird direkt auf Ihrem Gerät erzeugt — es werden keine Daten versendet. '+
        'In der Live-Version kommen sichere Speicherung (CH/EU), E-Mail-Versand und Ablage in SharePoint/Monday dazu.';
    return E('div',{class:'demo-note',html:'<b>Online-Formular.</b> '+sendInfo});
  }

  function buildPills(){
    var wrap=E('div',{class:'steps',id:'gb-steps'});
    steps.forEach(function(st,i){
      var label = st.kind==='data'? st.def.label : st.kind==='legal'? (st.def.pill||st.def.title||'Bedingungen') : st.kind==='sign'? 'Unterschrift' : 'Abschluss';
      var p=E('div',{class:'step-pill'+(i===0?' active':''),'data-s':(i+1)});
      p.innerHTML='<span class="num">'+(i+1)+'</span> '+esc(label);
      wrap.appendChild(p);
    });
    return wrap;
  }

  function buildPanel(st, n){
    var sec=E('section',{class:'step-panel'+(n===1?' active':''),'data-panel':n});
    if(st.kind==='data') buildDataStep(sec, st.def);
    else if(st.kind==='legal') buildLegalStep(sec, st.def);
    else if(st.kind==='sign') buildSignStep(sec);
    else buildDoneStep(sec);
    sec.appendChild(buildNav(n));
    var err=E('div',{class:'err-msg',id:'err'+n}); err.textContent='Bitte prüfen Sie die markierten Felder.'; sec.appendChild(err);
    return sec;
  }

  function buildDataStep(sec, def){
    var head = '<h2>'+esc(def.label)+(def.subtitle?' <small>'+esc(def.subtitle)+'</small>':'')+'</h2>';
    if(def===cfg.steps[0] && !cfg.legalFirst) head = '<h2>'+esc(cfg.title)+' <small>'+esc(cfg.subtitle||def.label)+'</small></h2>';
    sec.insertAdjacentHTML('beforeend', head);
    (def.sections||[]).forEach(function(s, si){
      sec.insertAdjacentHTML('beforeend','<div class="section-label'+(si===0?' first':'')+'">'+esc(s.label||'Angaben')+'</div>');
      if(s.note) sec.insertAdjacentHTML('beforeend','<div class="section-note">'+esc(s.note)+'</div>');
      var grid=E('div',{class:'grid'});
      (s.fields||[]).forEach(function(f){ grid.appendChild(buildField(f)); });
      sec.appendChild(grid);
    });
  }

  function buildField(f){
    var col = f.col==='full'?'full':(f.col===2?'':''); // 1 oder 2 = normale Spalte
    var wrap=E('div',{class:'field'+(f.col==='full'?' full':'')});
    if(f.required) wrap.setAttribute('data-req','1');
    wrap.setAttribute('data-id', f.id);
    wrap.setAttribute('data-type', f.type||'text');
    var lab = esc(f.label||'') + (f.required?' *':'');

    if(f.type==='static'){ wrap.className='field full'; wrap.innerHTML='<p style="margin:2px 0;color:var(--muted);font-size:13.5px">'+esc(f.label)+'</p>'; return wrap; }

    if(f.type==='textarea'){
      wrap.classList.add('full');
      wrap.innerHTML='<label>'+lab+'</label><textarea id="f_'+f.id+'" rows="'+(f.rows||3)+'" placeholder="'+esc(f.placeholder||'')+'"></textarea>'+hint(f);
      return wrap;
    }
    if(f.type==='select'){
      var opts='<option value="">— bitte wählen —</option>'+(f.options||[]).map(function(o){o=optObj(o);return '<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>';}).join('');
      wrap.innerHTML='<label>'+lab+'</label><select id="f_'+f.id+'">'+opts+'</select>'+hint(f);
      return wrap;
    }
    if(f.type==='checkbox'){ // einzelne Ja/Nein-Box
      wrap.classList.add('full');
      wrap.innerHTML='<div class="choice"><label><input type="checkbox" id="f_'+f.id+'"> '+esc(f.label)+'</label></div>'+hint(f);
      return wrap;
    }
    if(f.type==='radio'){
      wrap.classList.add('full');
      var style=f.style||'inline';
      var name='f_'+f.id;
      if(style==='cards'){
        var cards=(f.options||[]).map(function(o){o=optObj(o);
          return '<label class="opt-card"><input type="radio" name="'+name+'" value="'+esc(o.value)+'"><span class="t">'+esc(o.label)+(o.desc?'<small>'+esc(o.desc)+'</small>':'')+'</span></label>';
        }).join('');
        wrap.innerHTML='<label>'+lab+'</label><div class="choice vertical" data-cards="1">'+cards+'</div>'+hint(f);
      } else {
        var rl=(f.options||['Ja','Nein']).map(function(o){o=optObj(o);
          return '<label><input type="radio" name="'+name+'" value="'+esc(o.value)+'"> '+esc(o.label)+'</label>';}).join('');
        wrap.innerHTML='<label>'+lab+'</label><div class="choice">'+rl+'</div>'+hint(f);
      }
      return wrap;
    }
    if(f.type==='checkboxgroup'){
      wrap.classList.add('full');
      var cg=(f.options||[]).map(function(o,i){o=optObj(o);
        return '<label><input type="checkbox" id="f_'+f.id+'_'+i+'" value="'+esc(o.value)+'"> '+esc(o.label)+'</label>';}).join('');
      wrap.innerHTML='<label>'+lab+'</label><div class="choice'+(f.vertical?' vertical':'')+'">'+cg+'</div>'+hint(f);
      return wrap;
    }
    if(f.type==='table'){
      wrap.classList.add('full');
      var cols=f.columns||['Spalte'];
      var th=cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('');
      var rows='';
      for(var r=0;r<(f.rows||3);r++) rows+=tableRow(f.id, cols);
      wrap.innerHTML='<label>'+lab+'</label><table class="rep" id="t_'+f.id+'"><thead><tr>'+th+'</tr></thead><tbody>'+rows+'</tbody></table>'+
        '<button type="button" class="rep-add" data-add="'+f.id+'">+ Zeile hinzufügen</button>'+hint(f);
      return wrap;
    }
    // Standard: text/email/tel/date/number
    var t=f.type||'text';
    wrap.innerHTML='<label>'+lab+'</label><input id="f_'+f.id+'" type="'+t+'" placeholder="'+esc(f.placeholder||'')+'"'+(t==='number'&&f.suffix?' inputmode="decimal"':'')+'>'+hint(f);
    return wrap;
  }
  function tableRow(id, cols){
    return '<tr>'+cols.map(function(c,ci){return '<td><input class="tc_'+id+'" data-c="'+ci+'"></td>';}).join('')+'</tr>';
  }
  function hint(f){ return f.hint? '<div class="hint">'+esc(f.hint)+'</div>' : ''; }

  function buildLegalStep(sec, def){
    sec.insertAdjacentHTML('beforeend','<h2>'+esc(def.title||'Vertragsbedingungen')+(def.subtitle?' <small>'+esc(def.subtitle)+'</small>':'')+'</h2>');
    if(def.scope){
      sec.insertAdjacentHTML('beforeend','<div class="section-label first">'+esc(def.scope.label||'Umfang')+'</div>');
      var cards=def.scope.options.map(function(o){o=optObj(o);
        return '<label class="opt-card"><input type="radio" name="f_scope" value="'+esc(o.value)+'"><span class="t">'+o.label+(o.desc?'<small>'+esc(o.desc)+'</small>':'')+'</span></label>';
      }).join('');
      sec.insertAdjacentHTML('beforeend','<div class="choice vertical" data-cards="1">'+cards+'</div>');
      if(def.scope.other) sec.insertAdjacentHTML('beforeend','<div class="field"><input id="f_scope_other" placeholder="'+esc(def.scope.other)+'" style="display:none;margin-top:8px"></div>');
    }
    sec.insertAdjacentHTML('beforeend','<div class="section-label'+(def.scope?'':' first')+'">'+esc(def.textLabel||'Vertragstext')+'</div>');
    sec.insertAdjacentHTML('beforeend','<div class="legal">'+def.html+'</div>');
    sec.insertAdjacentHTML('beforeend','<div class="confirm-box"><input type="checkbox" id="f_gelesen"><label for="f_gelesen">'+esc(def.confirm||'Ich habe den Text gelesen und verstanden.')+'</label></div>');
  }

  function buildSignStep(sec){
    sec.insertAdjacentHTML('beforeend','<h2>Unterschrift <small>Bitte mit Maus, Finger oder Stift im Feld unterschreiben</small></h2>');
    sec.insertAdjacentHTML('beforeend',
      '<div class="grid" style="margin-bottom:16px">'+
        '<div class="field" data-req="1" data-id="ort"><label>Ort *</label><input id="f_ort" placeholder="z. B. Zürich"></div>'+
        '<div class="field"><label>Datum</label><input id="f_datum" type="date"></div>'+
        '<div class="field"><label>Name (Unterzeichner/in)</label><input id="f_signer"></div>'+
        '<div class="field"><label>Funktion (optional)</label><input id="f_signer_role" placeholder="z. B. Geschäftsführer"></div>'+
      '</div>'+
      '<label style="font-size:12.5px;color:var(--muted);font-weight:600;display:block;margin-bottom:6px">Unterschrift *</label>'+
      '<div class="sig-wrap" id="sigWrap"><canvas id="sigpad"></canvas><div class="sig-base"></div><div class="sig-x">✕</div><div class="sig-placeholder" id="sigPlaceholder">Hier unterschreiben</div></div>'+
      '<div class="sig-bar"><span class="hint">Einfache elektronische Signatur (SES) — für ein Broker-Mandat (Auftrag, OR 394 ff.) rechtsgültig.</span><button type="button" class="clear" id="sigClear">Löschen</button></div>');
  }

  function buildDoneStep(sec){
    sec.insertAdjacentHTML('beforeend',
      '<div class="center"><div class="done-icon">✓</div>'+
      '<h2 style="margin-bottom:2px">'+(cfg.signature?'Unterschrieben & bereit':'Formular bereit')+'</h2>'+
      '<p style="color:var(--muted);margin-top:0">'+esc(cfg.doneText|| (cfg.signature?'Ihr Dokument ist bereit. Laden Sie das signierte PDF herunter.':'Ihre Angaben sind erfasst. Laden Sie das ausgefüllte PDF herunter.'))+'</p></div>'+
      '<div class="summary" id="gb-summary"></div>'+
      '<div class="dl-buttons">'+
        '<button type="button" class="btn btn-primary btn-block" id="btnPdf">⬇ '+(cfg.signature?'Signiertes':'Ausgefülltes')+' PDF herunterladen</button>'+
        '<button type="button" class="btn btn-ghost btn-block" onclick="window.print()">🖨 Drucken / Als PDF speichern</button>'+
      '</div>'+
      '<div class="err-msg" id="errPdf" style="text-align:center">PDF-Bibliothek nicht geladen (keine Internetverbindung?). Bitte „Drucken / Als PDF speichern" nutzen.</div>');
  }

  function buildNav(n){
    var nav=E('div',{class:'nav'});
    var last = n===steps.length;
    var first = n===1;
    nav.innerHTML =
      (first? '<span></span>' : '<button type="button" class="btn btn-ghost" data-go="'+(n-1)+'">‹ Zurück</button>')+
      (last? '<button type="button" class="btn btn-ghost" data-reset="1">Neues Formular</button>'
           : '<button type="button" class="btn btn-primary" data-go="'+(n+1)+'">'+(steps[n] && steps[n].kind==='done' ? 'Abschliessen ›':'Weiter ›')+'</button>');
    return nav;
  }

  /* ---------- Navigation / Events ---------- */
  document.addEventListener('click', function(e){
    var t=e.target.closest ? e.target.closest('[data-go],[data-reset],[data-add],#btnPdf,#sigClear') : null;
    if(!t) return;
    if(t.hasAttribute('data-go')){ var to=+t.getAttribute('data-go'); if(to>current && !validate(current)) return; setStep(to); }
    else if(t.hasAttribute('data-reset')){ resetAll(); }
    else if(t.hasAttribute('data-add')){ addRow(t.getAttribute('data-add')); }
    else if(t.id==='btnPdf'){ makePDF(); }
    else if(t.id==='sigClear'){ clearSig(); }
  });
  // Karten-Auswahl hervorheben + "Andere"-Feld
  document.addEventListener('change', function(e){
    var inp=e.target;
    if(inp.type==='radio'){
      var box=inp.closest('[data-cards]');
      if(box){ box.querySelectorAll('.opt-card').forEach(function(o){ o.classList.toggle('sel', o.querySelector('input').checked); }); }
      if(inp.name==='f_scope'){ var ot=document.getElementById('f_scope_other'); if(ot) ot.style.display = (/Andere/i.test(inp.value)&&inp.checked)?'block':'none'; }
    }
  });

  function addRow(id){
    var tb=document.querySelector('#t_'+id+' tbody'); if(!tb) return;
    var cols=tb.querySelector('tr').querySelectorAll('td').length;
    var cs=[]; for(var i=0;i<cols;i++) cs.push('');
    tb.insertAdjacentHTML('beforeend', tableRow(id, cs));
  }

  /* ---------- Entwurf-Autosave (localStorage, pro Formular) ---------- */
  function storeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function storeSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function storeDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function draftKey(){ return 'gb_draft_'+((cfg&&cfg.id)||location.pathname); }
  function draftSnapshot(){
    var snap={v:{},c:{},r:{},t:{}};
    root.querySelectorAll('input,select,textarea').forEach(function(e){
      if(e.id && e.id.indexOf('f_')===0){
        if(e.type==='checkbox') snap.c[e.id]=e.checked?1:0;
        else if(e.type!=='radio') snap.v[e.id]=e.value;
      } else if(e.type==='radio' && e.checked && e.name && e.name.indexOf('f_')===0){
        snap.r[e.name]=e.value;
      }
    });
    root.querySelectorAll('table.rep').forEach(function(tb){
      var id=tb.id.replace(/^t_/,''); var rows=[];
      tb.querySelectorAll('tbody tr').forEach(function(tr){
        rows.push(Array.prototype.map.call(tr.querySelectorAll('input'),function(i){return i.value;}));
      });
      snap.t[id]=rows;
    });
    return snap;
  }
  function draftSave(){ if(draftRestoring||!cfg) return; storeSet(draftKey(), JSON.stringify(draftSnapshot())); }
  function draftClear(){ storeDel(draftKey()); }
  function draftRestore(){
    var raw=storeGet(draftKey()); if(!raw) return false;
    var snap; try{ snap=JSON.parse(raw); }catch(e){ return false; }
    if(!snap) return false;
    draftRestoring=true;
    try{
      Object.keys(snap.t||{}).forEach(function(id){
        var tb=document.querySelector('#t_'+id+' tbody'); if(!tb) return;
        var rows=snap.t[id]||[];
        while(tb.querySelectorAll('tr').length<rows.length) addRow(id);
        tb.querySelectorAll('tr').forEach(function(tr,ri){
          var cells=tr.querySelectorAll('input');
          (rows[ri]||[]).forEach(function(v,ci){ if(cells[ci]) cells[ci].value=v; });
        });
      });
      Object.keys(snap.v||{}).forEach(function(id){ var e=document.getElementById(id); if(e) e.value=snap.v[id]; });
      Object.keys(snap.c||{}).forEach(function(id){ var e=document.getElementById(id); if(e) e.checked=!!snap.c[id]; });
      Object.keys(snap.r||{}).forEach(function(name){
        root.querySelectorAll('input[name="'+name+'"]').forEach(function(e){
          if(e.value===snap.r[name]){ e.checked=true;
            var ev=document.createEvent('HTMLEvents'); ev.initEvent('change',true,false); e.dispatchEvent(ev); }
        });
      });
    }catch(e){}
    draftRestoring=false;
    return true;
  }
  function showDraftNote(){
    var main=root.querySelector('main'); var card=root.querySelector('.card'); if(!main||!card) return;
    var n=E('div',{class:'demo-note',html:'↻ <b>Entwurf wiederhergestellt.</b> Ihre früheren Eingaben wurden geladen. <a href="#" id="gbDraftReset">Leer beginnen</a>'});
    main.insertBefore(n,card);
    var a=document.getElementById('gbDraftReset');
    if(a) a.addEventListener('click',function(ev){ ev.preventDefault(); draftClear(); location.reload(); });
  }
  function scheduleDraft(e){
    if(!cfg||draftRestoring) return;
    var t=e.target; if(!t) return;
    var ok=(t.id&&t.id.indexOf('f_')===0)||(t.name&&t.name.indexOf('f_')===0)||(t.className&&String(t.className).indexOf('tc_')===0);
    if(!ok) return;
    if(draftTimer) clearTimeout(draftTimer);
    draftTimer=setTimeout(draftSave,400);
  }
  document.addEventListener('input', scheduleDraft);
  document.addEventListener('change', scheduleDraft);

  /* ---------- Prefill aus identity-sync der Hauptwebsite ---------- */
  function prefillIdentity(){
    var raw=storeGet('glatt-customer-v1'); if(!raw) return;
    var idn; try{ idn=JSON.parse(raw); }catch(e){ return; }
    if(!idn) return;
    function put(id,v){ var e=document.getElementById('f_'+id); if(e && !e.value && v) e.value=v; }
    var fullName=idn.fullName||(((idn.firstName||'')+' '+(idn.lastName||'')).trim());
    var plzOrt=idn.plzDisplay||(((idn.plz||'')+' '+(idn.ort||'')).trim());
    put('vorname', idn.firstName); put('nachname', idn.lastName); put('name', idn.lastName);
    put('vorname_name', fullName); put('vn_vorname_name', fullName);
    put('nachname_vorname', (((idn.lastName||'')+' '+(idn.firstName||'')).trim()));
    put('email', idn.email); put('telefon', idn.phone); put('tel', idn.phone);
    put('plzort', plzOrt); put('plz_ort', plzOrt); put('vn_plz_ort', plzOrt);
    put('ort_plz', (((idn.ort||'')+' '+(idn.plz||'')).trim()));
    put('plz', idn.plz); put('ort', idn.ort);
    put('geburtsdatum', idn.birthdate); put('geb_datum', idn.birthdate); put('vn_geb_datum', idn.birthdate);
  }

  /* ---------- Versand an Glatt-Plattform (api/public/form-submit) ---------- */
  function b64FromBytes(bytes){
    var CHUNK=0x8000, idx=0, out='';
    while(idx<bytes.length){ out+=String.fromCharCode.apply(null, bytes.subarray(idx, Math.min(idx+CHUNK,bytes.length))); idx+=CHUNK; }
    return btoa(out);
  }
  function collectFlat(){
    var flat={};
    root.querySelectorAll('input,select,textarea').forEach(function(e){
      if(e.id && e.id.indexOf('f_')===0){
        if(e.type==='checkbox'){ if(e.checked) flat[e.id.slice(2)]='Ja'; }
        else if(e.type!=='radio' && e.value) flat[e.id.slice(2)]=e.value;
      } else if(e.type==='radio' && e.checked && e.name && e.name.indexOf('f_')===0){ flat[e.name.slice(2)]=e.value; }
    });
    return flat;
  }
  function submitNote(html, ok){
    var noteHost=document.querySelector('.dl-buttons'); if(!noteHost) return;
    var ex=document.getElementById('gbSubmitNote'); if(ex) ex.remove();
    var n=E('div',{id:'gbSubmitNote'});
    n.style.cssText='margin-top:10px;padding:10px 12px;border-radius:8px;font-size:13px;'+(ok?'background:#e8f7ee;color:#0c6b3d;border:1px solid #bfe6cf':'background:#fdf1e7;color:#8a4a12;border:1px solid #f3d2ae');
    n.innerHTML=html;
    noteHost.parentNode.insertBefore(n, noteHost.nextSibling);
  }
  function submitToGlatt(pdfBytes, fileName){
    var ep=(window.GB_API && window.GB_API.endpoint)||'';
    if(!ep){ submitNote('Hinweis: Das PDF wurde nur auf Ihrem Gerät gespeichert. Bitte senden Sie es per E-Mail an <b>online@glattbroker.ch</b>.', false); return; }
    var flat=collectFlat();
    var payload={
      formId:(cfg&&cfg.id)||location.pathname,
      formTitle:(cfg&&cfg.title)||document.title,
      kunde:{ vorname:flat.vorname||'', name:flat.nachname||flat.name||flat.firmenname||flat.firma||'',
              email:flat.email||'', telefon:flat.telefon||flat.tel||'',
              strasse:flat.strasse||flat.adresse||'', plz:flat.plz||'', ort:flat.ort||'', plzOrt:flat.plzort||flat.plz_ort||'' },
      fields:flat,
      pdfBase64:b64FromBytes(pdfBytes),
      fileName:fileName,
      signedAt:signedAtISO||new Date().toISOString(),
      userAgent:navigator.userAgent
    };
    try{
      var xhr=new XMLHttpRequest();
      xhr.open('POST', ep.replace(/\/$/,'')+'/api/public/form-submit', true);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.timeout=20000;
      xhr.onload=function(){
        if(xhr.status===200){ submitNote('✓ <b>An Glatt Broker übermittelt.</b> Wir melden uns bei Ihnen — das PDF bleibt zusätzlich auf Ihrem Gerät.', true); draftClear(); }
        else submitNote('Übermittlung nicht möglich (Status '+xhr.status+'). Bitte PDF per E-Mail an <b>online@glattbroker.ch</b> senden.', false);
      };
      xhr.onerror=xhr.ontimeout=function(){ submitNote('Übermittlung nicht möglich. Bitte PDF per E-Mail an <b>online@glattbroker.ch</b> senden.', false); };
      xhr.send(JSON.stringify(payload));
    }catch(e){ submitNote('Übermittlung nicht möglich. Bitte PDF per E-Mail an <b>online@glattbroker.ch</b> senden.', false); }
  }
  function hookSpecialFill(){
    if(specialHooked) return; specialHooked=true;
    ['fillMandat','fillPdfForm'].forEach(function(fn){
      var orig=window[fn]; if(typeof orig!=='function') return;
      window[fn]=function(){
        var p=orig.apply(this,arguments);
        if(p && typeof p.then==='function'){
          p.then(function(out){
            try{
              if(out && out.length && !submittedOnce){
                submittedOnce=true;
                var fname=((cfg&&cfg.id)||'formular')+(customerName().trim()?'_'+customerName().trim().replace(/\s+/g,'-'):'')+'.pdf';
                submitToGlatt(out instanceof Uint8Array ? out : new Uint8Array(out), fname);
              }
            }catch(e){}
          });
        }
        return p;
      };
    });
  }

  function setStep(n){
    current=n;
    root.querySelectorAll('.step-panel').forEach(function(p){ p.classList.toggle('active', +p.getAttribute('data-panel')===n); });
    root.querySelectorAll('.step-pill').forEach(function(p){ var s=+p.getAttribute('data-s'); p.classList.toggle('active',s===n); p.classList.toggle('done',s<n); });
    window.scrollTo({top:0,behavior:'smooth'});
    if(steps[n-1] && steps[n-1].kind==='sign') setTimeout(resizeCanvas,60);
    if(steps[n-1] && steps[n-1].kind==='done') buildSummary();
  }

  /* ---------- Validierung ---------- */
  function validate(n){
    hideErr();
    var st=steps[n-1]; var ok=true;
    if(st.kind==='data'){
      panelOf(n).querySelectorAll('.field[data-req]').forEach(function(w){
        var bad=isEmpty(w);
        w.classList.toggle('invalid',bad); if(bad) ok=false;
      });
    } else if(st.kind==='legal'){
      if(st.def.scope && !document.querySelector('input[name="f_scope"]:checked')) ok=false;
      var g=document.getElementById('f_gelesen'); if(g && !g.checked) ok=false;
      var ot=document.getElementById('f_scope_other');
      var sc=document.querySelector('input[name="f_scope"]:checked');
      if(ot && sc && /Andere/i.test(sc.value) && !ot.value.trim()) ok=false;
    } else if(st.kind==='sign'){
      var ortW=document.getElementById('f_ort').closest('.field');
      var ortBad=!val('ort'); ortW.classList.toggle('invalid',ortBad);
      var sigBad=!hasSig; document.getElementById('sigWrap').classList.toggle('invalid',sigBad);
      if(ortBad||sigBad) ok=false;
    }
    if(!ok) showErr(n);
    return ok;
  }
  function isEmpty(w){
    var id=w.getAttribute('data-id'), type=w.getAttribute('data-type');
    if(type==='radio'){ return !document.querySelector('input[name="f_'+id+'"]:checked'); }
    if(type==='checkbox'){ var c=document.getElementById('f_'+id); return c && !c.checked; }
    if(type==='email'){ var v=val(id); return !v || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
    return !val(id);
  }
  function panelOf(n){ return root.querySelector('.step-panel[data-panel="'+n+'"]'); }
  function showErr(n){ var e=document.getElementById('err'+n); if(e) e.classList.add('show'); }
  function hideErr(){ root.querySelectorAll('.err-msg').forEach(function(e){e.classList.remove('show');}); }

  /* ---------- Unterschrift ---------- */
  function initSignature(){
    sigCanvas=document.getElementById('sigpad'); if(!sigCanvas) return;
    sigCtx=sigCanvas.getContext('2d');
    var c=sigCanvas;
    c.addEventListener('mousedown',sStart); c.addEventListener('mousemove',sMove); window.addEventListener('mouseup',sEnd);
    c.addEventListener('touchstart',sStart,{passive:false}); c.addEventListener('touchmove',sMove,{passive:false}); c.addEventListener('touchend',sEnd);
    window.addEventListener('resize',function(){ if(steps[current-1]&&steps[current-1].kind==='sign') resizeCanvas(); });
    var cl=document.getElementById('sigClear'); // bound via delegation too
  }
  function resizeCanvas(){
    if(!sigCanvas) return; var rect=sigCanvas.getBoundingClientRect(); if(!rect.width) return;
    var data = hasSig ? sigCanvas.toDataURL() : null;
    sigRatio=Math.max(window.devicePixelRatio||1,1);
    sigCanvas.width=rect.width*sigRatio; sigCanvas.height=rect.height*sigRatio;
    sigCtx.setTransform(1,0,0,1,0,0); sigCtx.scale(sigRatio,sigRatio);
    sigCtx.lineWidth=2.2; sigCtx.lineCap='round'; sigCtx.lineJoin='round'; sigCtx.strokeStyle='#15181f';
    if(data){ var img=new Image(); img.onload=function(){ sigCtx.drawImage(img,0,0,rect.width,rect.height); }; img.src=data; }
  }
  function sPos(e){ var r=sigCanvas.getBoundingClientRect(); var x=(e.touches?e.touches[0].clientX:e.clientX)-r.left, y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x:x,y:y}; }
  function sStart(e){ e.preventDefault(); drawing=true; var p=sPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x,p.y); if(!hasSig){ hasSig=true; var ph=document.getElementById('sigPlaceholder'); if(ph) ph.style.display='none'; } }
  function sMove(e){ if(!drawing) return; e.preventDefault(); var p=sPos(e); sigCtx.lineTo(p.x,p.y); sigCtx.stroke(); }
  function sEnd(){ if(drawing && hasSig && !signedAtISO) signedAtISO=new Date().toISOString(); drawing=false; }
  function clearSig(){ if(!sigCtx) return; sigCtx.clearRect(0,0,sigCanvas.width,sigCanvas.height); hasSig=false; signedAtISO=null; var ph=document.getElementById('sigPlaceholder'); if(ph) ph.style.display='grid'; document.getElementById('sigWrap').classList.remove('invalid'); }

  /* ---------- Werte einsammeln ---------- */
  function collect(){
    var out=[]; // [{section, items:[[label,value]]}]
    cfg.steps.forEach(function(s){
      (s.sections||[]).forEach(function(sec){
        var items=[];
        (sec.fields||[]).forEach(function(f){
          if(f.type==='static') return;
          var v=readField(f);
          if(v!=null && v!=='' ) items.push([f.label, v]);
        });
        if(items.length) out.push({section: (s.label?s.label+' — ':'')+(sec.label||''), items:items});
      });
    });
    return out;
  }
  function readField(f){
    if(f.type==='radio'){ var r=document.querySelector('input[name="f_'+f.id+'"]:checked'); return r? r.value : ''; }
    if(f.type==='checkbox'){ var c=document.getElementById('f_'+f.id); return c && c.checked ? 'Ja' : ''; }
    if(f.type==='checkboxgroup'){ var vs=[]; (f.options||[]).forEach(function(o,i){ var b=document.getElementById('f_'+f.id+'_'+i); if(b&&b.checked) vs.push(optObj(o).value); }); return vs.join(', '); }
    if(f.type==='date'){ return fmtDate(val(f.id)); }
    if(f.type==='table'){
      var rows=[]; document.querySelectorAll('#t_'+f.id+' tbody tr').forEach(function(tr){
        var cells=Array.prototype.map.call(tr.querySelectorAll('input'),function(i){return i.value.trim();});
        if(cells.some(function(x){return x;})) rows.push((f.columns||[]).map(function(c,ci){return (cells[ci]||'')}).join(' · '));
      });
      return rows.join('\n');
    }
    var v=val(f.id); return (f.suffix && v)? v+' '+f.suffix : v;
  }
  function customerName(){
    // versucht gängige Felder zu finden für Dateiname/Zusammenfassung
    var v=val('nachname')||val('firmenname')||val('firma')||val('name');
    var vn=val('vorname');
    return (vn?vn+' ':'')+(v||'');
  }
  function scopeVal(){ var s=document.querySelector('input[name="f_scope"]:checked'); if(!s) return ''; var ot=document.getElementById('f_scope_other'); return (/Andere/i.test(s.value)&&ot&&ot.value.trim())?('Andere: '+ot.value.trim()):s.value; }

  /* ---------- Zusammenfassung ---------- */
  function buildSummary(){
    var rows=[];
    var nm=customerName(); if(nm.trim()) rows.push(['Kunde', nm]);
    if(val('email')) rows.push(['E-Mail', val('email')]);
    if(cfg.legal && cfg.legal.scope) rows.push(['Umfang', scopeVal()||'—']);
    rows.push(['Dokument', cfg.title]);
    if(cfg.signature){ rows.push(['Ort / Datum', (val('ort')||'—')+', '+fmtDate(val('datum'))]); rows.push(['Unterschrift', hasSig?'✓ erfasst':'—']); }
    var box=document.getElementById('gb-summary'); if(box) box.innerHTML=rows.map(function(r){return '<div class="row"><span>'+esc(r[0])+'</span><span>'+esc(r[1])+'</span></div>';}).join('');
  }

  /* ---------- PDF ---------- */
  function makePDF(){
    submittedOnce=false;
    // Sonderfall: Formular füllt eine Original-PDF-Vorlage (z. B. Mandat) statt generischem Layout.
    if(typeof cfg.buildPDF==='function'){
      hookSpecialFill();
      try{
        var res = cfg.buildPDF({ val:val, fmtDate:fmtDate, customerName:customerName, scopeVal:scopeVal, sigCanvas:sigCanvas, hasSig:hasSig, getValue:readField, cfg:cfg });
        if(res && typeof res.catch==='function') res.catch(function(e){ console.error(e); var el=document.getElementById('errPdf'); if(el) el.classList.add('show'); });
      }catch(e){ console.error(e); var el=document.getElementById('errPdf'); if(el) el.classList.add('show'); }
      return;
    }
    // Generischer Vorlagen-Modus: Felder via f.pdf / f.pdfMap in die Original-PDF binden.
    if(cfg.pdfTemplate){ buildTemplatePDF(); return; }
    if(!window.jspdf){ document.getElementById('errPdf').classList.add('show'); return; }
    var jsPDF=window.jspdf.jsPDF, doc=new jsPDF({unit:'pt',format:'a4'});
    var W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight(), Mg=48, maxW=W-Mg*2, y=Mg;
    function footer(){ doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(140);
      doc.text('glattbroker.ch  |  FINMA Register Nr. F01397063  |  Partner: Baumassurance AG (F01207772)', Mg, H-26); doc.setTextColor(20); }
    function ensure(h){ if(y+h>H-46){ footer(); doc.addPage(); y=Mg; } }
    function H1(t){ ensure(28); doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(204,41,54); doc.text(t,Mg,y); y+=8; doc.setDrawColor(204,41,54); doc.setLineWidth(1); doc.line(Mg,y,W-Mg,y); y+=16; doc.setTextColor(20); }
    function H2(t){ ensure(20); doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(168,31,43); doc.text(t,Mg,y); y+=14; doc.setTextColor(20); }
    function P(t,sz){ sz=sz||9; doc.setFont('helvetica','normal'); doc.setFontSize(sz); doc.splitTextToSize(t,maxW).forEach(function(ln){ ensure(sz+3); doc.text(ln,Mg,y); y+=sz+3; }); y+=3; }
    function KV(k,v){ var lines=doc.splitTextToSize(String(v||'—'),maxW-160); ensure(Math.max(14, lines.length*12)); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.text(String(k),Mg,y); doc.setFont('helvetica','normal'); doc.text(lines,Mg+160,y); y+=Math.max(14, lines.length*12); }

    doc.setFillColor(204,41,54); doc.rect(0,0,W,6,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(204,41,54); doc.text('GLATT BROKER AG', Mg, y+4);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110); doc.text('Versicherungsbroker  ·  Partner: Baumassurance AG', Mg, y+16); doc.setTextColor(20); y+=34;

    H1(cfg.title + (cfg.subtitle?(' — '+cfg.subtitle):''));
    if(cfg.legal && cfg.legal.scope){ H2(cfg.legal.scope.label||'Umfang'); P(scopeVal()||'—'); }

    collect().forEach(function(grp){ if(grp.items.length){ H2(grp.section.replace(/ — $/,'')); grp.items.forEach(function(it){ KV(it[0], it[1]); }); } });

    if(cfg.legal){ H2('Wesentliche Bestimmungen'); P(stripHtml(cfg.legal.summary || cfg.legal.html)); }

    if(cfg.signature){
      ensure(150); y+=6; doc.setDrawColor(210); doc.setLineWidth(.7); doc.line(Mg,y,W-Mg,y); y+=20;
      H2('Unterschrift'); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text('Ort, Datum: '+(val('ort')||'—')+', '+fmtDate(val('datum')), Mg, y); y+=6;
      if(hasSig){ try{ doc.addImage(sigCanvas.toDataURL('image/png'),'PNG',Mg,y,210,80); }catch(e){} }
      y+=84; doc.setDrawColor(150); doc.line(Mg,y,Mg+230,y); y+=12; doc.setFontSize(8); doc.setTextColor(110);
      doc.text('Unterschrift  ·  '+(val('signer')||customerName()||''), Mg, y);
      y+=20; doc.setFontSize(7.5); doc.setTextColor(120); doc.text('Einfache elektronische Signatur (SES), erfasst über das Online-Formular am '+new Date().toLocaleString('de-CH')+'.', Mg, y); doc.setTextColor(20);
    }
    footer();
    var fn=(cfg.id||'formular')+(customerName().trim()?'_'+customerName().trim().replace(/\s+/g,'-'):'')+'.pdf';
    doc.save(fn);
    try{ submitToGlatt(new Uint8Array(doc.output('arraybuffer')), fn); }catch(e){}
  }
  function stripHtml(h){ var d=document.createElement('div'); d.innerHTML=h; return (d.textContent||'').replace(/\s+/g,' ').trim().slice(0,1400); }

  /* ---------- Generischer Vorlagen-Modus (Original-PDF füllen) ----------
     Pro Feld optional:  pdf:'PDF-Feldname'              -> Text/Datum/Zahl
                         pdfMap:{ 'Optionswert':'CheckboxFeldname', ... }  -> radio/select/checkboxgroup
                         pdf:'CheckboxFeldname' (bei type checkbox)        -> Häkchen wenn angekreuzt
     cfg.pdfTemplate = Name der window-Variable mit Base64-Vorlage.
     cfg.signaturePlacement = [{field,dx,dyBottom,h}] für Unterschrift. */
  function eachField(cb){ cfg.steps.forEach(function(s){ (s.sections||[]).forEach(function(sec){ (sec.fields||[]).forEach(cb); }); }); }
  function buildTemplatePDF(){
    var errEl=document.getElementById('errPdf');
    try{
      var b64=window[cfg.pdfTemplate];
      if(!b64) throw new Error('Vorlage nicht geladen');
      var bin=atob(b64), tpl=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) tpl[i]=bin.charCodeAt(i);
      var spec={ texts:{}, multiline:[], checks:[], signatures:[] };
      eachField(function(f){
        var t=f.type||'text';
        if(t==='static') return;
        if(t==='radio'||t==='select'){
          var v=readField(f);
          if(f.pdfMap && f.pdfMap[v]) spec.checks.push(f.pdfMap[v]);
          else if(f.pdf && v) spec.texts[f.pdf]=v;
        } else if(t==='checkbox'){
          if(readField(f)==='Ja' && f.pdf) spec.checks.push(f.pdf);
        } else if(t==='checkboxgroup'){
          (f.options||[]).forEach(function(o,idx){ var box=document.getElementById('f_'+f.id+'_'+idx);
            if(box && box.checked){ var ov=(typeof o==='string'?o:o.value); if(f.pdfMap && f.pdfMap[ov]) spec.checks.push(f.pdfMap[ov]); else if(f.pdf) spec.texts[f.pdf]=( (spec.texts[f.pdf]?spec.texts[f.pdf]+', ':'')+ov ); } });
        } else if(f.pdf){
          var val2=readField(f);
          if(val2){ spec.texts[f.pdf]=val2; if(t==='textarea'||f.pdfMultiline) spec.multiline.push(f.pdf); }
        }
      });
      var sig=null;
      if(cfg.signature && hasSig){
        if(cfg.signaturePlacement) spec.signatures=cfg.signaturePlacement;
        if(sigCanvas){ var d=sigCanvas.toDataURL('image/png').split(',')[1]; var bb=atob(d); sig=new Uint8Array(bb.length); for(var j=0;j<bb.length;j++) sig[j]=bb.charCodeAt(j); }
      }
      window.fillPdfForm(window.PDFLib, tpl, spec, sig).then(function(out){
        var blob=new Blob([out],{type:'application/pdf'}), a=document.createElement('a');
        a.href=URL.createObjectURL(blob);
        a.download=(cfg.id||'formular')+(customerName().trim()?'_'+customerName().trim().replace(/\s+/g,'-'):'')+'.pdf';
        document.body.appendChild(a); a.click();
        if(!submittedOnce){ submittedOnce=true; try{ submitToGlatt(out instanceof Uint8Array ? out : new Uint8Array(out), a.download); }catch(e2){} }
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },1000);
      }).catch(function(e){ console.error(e); if(errEl) errEl.classList.add('show'); });
    }catch(e){ console.error(e); if(errEl) errEl.classList.add('show'); }
  }

  /* ---------- Reset ---------- */
  function resetAll(){
    draftClear();
    root.querySelectorAll('input,select,textarea').forEach(function(e){ if(e.type==='radio'||e.type==='checkbox') e.checked=false; else if(e.id!=='f_datum') e.value=''; });
    root.querySelectorAll('.opt-card').forEach(function(o){o.classList.remove('sel');});
    var ot=document.getElementById('f_scope_other'); if(ot) ot.style.display='none';
    var dn=document.getElementById('gbSubmitNote'); if(dn) dn.remove();
    clearSig(); hideErr(); setStep(1);
  }
})();
