/* ===========================================================
   PDF-Befüllung — füllt eine ORIGINAL-Vorlage (AcroForm) unverändert:
   Text in benannte Felder, Checkboxen ankreuzen, Unterschrift als Bild
   auf definierte Linien legen, dann flatten. Identische Struktur für alle
   Formulare. Umgebungs-agnostisch: window.* (Browser) / globalThis (Node).

   Generisch:  fillPdfForm(PDFLib, tplBytes, spec, sigPngBytes?) -> Uint8Array
     spec = { texts:{feldname:wert}, multiline:[feldname],
              checks:[checkboxname], fontSize:Number,
              signatures:[{field, dx, dyBottom, h}] }
   Mandat-Wrapper: fillMandat(PDFLib, tplBytes, values, sigPngBytes?)
   =========================================================== */
(function(root){

  async function fillPdfForm(PDFLib, templateBytes, spec, sigPngBytes){
    var PDFDocument = PDFLib.PDFDocument;
    var pdf = await PDFDocument.load(templateBytes);
    var form = pdf.getForm();
    var size = spec.fontSize || 9.5;
    var ml = spec.multiline || [];

    function setText(name, value){
      try{ var f = form.getTextField(name);
        if(ml.indexOf(name) >= 0) f.enableMultiline();
        f.setFontSize(size);
        f.setText(value == null ? '' : String(value));
      }catch(e){}
    }
    var texts = spec.texts || {};
    Object.keys(texts).forEach(function(k){ setText(k, texts[k]); });
    (spec.checks || []).forEach(function(n){ try{ form.getCheckBox(n).check(); }catch(e){} });

    if(sigPngBytes && sigPngBytes.length && spec.signatures){
      var png = await pdf.embedPng(sigPngBytes);
      var pages = pdf.getPages();
      spec.signatures.forEach(function(p){
        try{
          var f = form.getField(p.field);
          var w = f.acroField.getWidgets()[0];
          var r = w.getRectangle();
          var pref = w.P(); var page = null;
          for(var i=0;i<pages.length;i++){ if(pages[i].ref === pref){ page = pages[i]; break; } }
          if(!page) return;
          var rx = r.x, rw = Math.abs(r.width), ry = Math.min(r.y, r.y + r.height);
          var h = p.h || 46, dw = h * (png.width / png.height), x = rx + (p.dx || 0);
          var maxW = (rx + rw) - x - 2;
          if(dw > maxW){ dw = maxW; h = dw * (png.height / png.width); }
          page.drawImage(png, { x:x, y: ry + (p.dyBottom || 0), width: dw, height: h });
        }catch(e){}
      });
    }
    try{ form.flatten(); }catch(e){}
    return await pdf.save();
  }

  // --- Mandat-spezifischer Wrapper (Umfang-Checkbox + zusammengesetzte Kunde-Box) ---
  var SCOPE_CB = { ein:'Kontrollkästchen1', aus:'Kontrollkästchen2', allein:'Kontrollkästchen3', andere:'Kontrollkästchen4' };
  var KUNDE = 'Kunde  Kundin Mandatsgeberin Name Adresse Stempel';

  async function fillMandat(PDFLib, templateBytes, v, sigPngBytes){
    var spec = {
      multiline: [KUNDE],
      texts: {},
      checks: (v.scopeKey && SCOPE_CB[v.scopeKey]) ? [SCOPE_CB[v.scopeKey]] : [],
      signatures: [
        { field:'Verantwortliche Personen', dx:80, dyBottom:0,   h:46 }, // S.2 Kunde-Linie
        { field:'Unterschriften',           dx:80, dyBottom:-14, h:44 }  // S.3 Kunde-Linie
      ]
    };
    spec.texts[KUNDE]        = v.kundeBox || '';
    spec.texts['Ort Datum']  = v.ortDatum;
    spec.texts['Ort Datum_4']= v.ortDatum;
    spec.texts['Name']       = v.person1;
    spec.texts['Name_2']     = v.person2;
    if(v.scopeKey === 'andere') spec.texts['Andere'] = v.andereText;
    return fillPdfForm(PDFLib, templateBytes, spec, sigPngBytes);
  }

  root.fillPdfForm = fillPdfForm;
  root.fillMandat  = fillMandat;
})(typeof window !== 'undefined' ? window : globalThis);
