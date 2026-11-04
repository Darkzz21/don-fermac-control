/* Comprobantes de pago: se guardan en el dispositivo (IndexedDB) y se leen en el navegador
   (texto de PDF con pdf.js u OCR de imágenes con Tesseract) para autocompletar y chequear el cobro. */
'use strict';

/* ---------- archivos en IndexedDB (localStorage no alcanza para imágenes) ---------- */
function adjDB(){ return new Promise((ok,ko)=>{ if(!window.indexedDB) return ko(new Error('este navegador no permite guardar archivos'));
  const r=indexedDB.open('gestia_archivos',1); r.onupgradeneeded=()=>r.result.createObjectStore('adjuntos',{keyPath:'id'}); r.onsuccess=()=>ok(r.result); r.onerror=()=>ko(r.error); }); }
async function adjTx(modo,fn){ const db=await adjDB(); return new Promise((ok,ko)=>{ const t=db.transaction('adjuntos',modo); const r=fn(t.objectStore('adjuntos'));
  t.oncomplete=()=>{ db.close(); ok(r&&r.result); }; t.onerror=()=>ko(t.error); t.onabort=()=>ko(t.error||new Error('falta espacio en el dispositivo')); }); }
function adjGuardar(file){ const id='A'+uid(); return adjTx('readwrite',st=>st.put({id,nombre:file.name,tipo:file.type,blob:file,fecha:hoy()})).then(()=>id); }
const adjLeer=id=>adjTx('readonly',st=>st.get(id));
async function hashArchivo(file){ try{ const b=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }catch(e){ return null; } }

/* ---------- lectura: PDF con texto, PDF escaneado o imagen ---------- */
const LIBS={pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',pdfW:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',ocr:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'};
const _scr={};
function cargarScript(url){ return _scr[url]||(_scr[url]=new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=url; s.onload=ok;
  s.onerror=()=>{ delete _scr[url]; s.remove(); ko(new Error('no se pudo descargar el lector, revisá la conexión a internet')); }; document.head.appendChild(s); })); }
async function textoOCR(img,prog){ await cargarScript(LIBS.ocr);
  const r=await Tesseract.recognize(img,'spa',{logger:m=>{ if(prog&&m.status==='recognizing text') prog('Leyendo el comprobante… '+Math.round(m.progress*100)+'%'); }});
  return (r&&r.data&&r.data.text)||''; }
async function textoPDF(file,prog){ await cargarScript(LIBS.pdf); const lib=window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc=LIBS.pdfW;
  const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise; let t='';
  for(let i=1;i<=Math.min(pdf.numPages,3);i++){ const c=await (await pdf.getPage(i)).getTextContent(); t+=c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n'; }
  if(t.replace(/\s/g,'').length>=20) return t;
  prog&&prog('El PDF es una imagen escaneada, leyéndolo con OCR…'); // se dibuja la primera página y se lee como imagen
  const pg=await pdf.getPage(1); const vp=pg.getViewport({scale:2}); const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise; return textoOCR(cv,prog); }
async function leerComprobante(file,prog){ const esPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
  prog&&prog(esPdf?'Leyendo el PDF…':'Preparando el lector (la primera vez tarda un poco más)…');
  const texto=esPdf?await textoPDF(file,prog):await textoOCR(file,prog); return {texto,datos:parsearComprobante(texto)}; }

/* ---------- interpretación del texto ---------- */
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12,ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,sept:9,set:9,oct:10,nov:11,dic:12};
const sinAc=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'');
function cuitValido(c){ if(!/^\d{11}$/.test(c)) return false; const m=[5,4,3,2,7,6,5,4,3,2]; let s=0; for(let i=0;i<10;i++) s+=+c[i]*m[i]; let v=11-s%11; if(v===11) v=0; return v===+c[10]||v===10; }
function fechaDe(s){ let dd,mm,yy,m=s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/);
  if(m){ dd=+m[1]; mm=+m[2]; yy=+m[3]; }
  else { m=s.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\b/); if(!m||!MESES[m[2]]) return null; dd=+m[1]; mm=MESES[m[2]]; yy=+m[3]; }
  if(yy<100) yy+=2000; if(mm<1||mm>12||dd<1||dd>31||yy<2000||yy>2100) return null; return yy+'-'+pad(mm)+'-'+pad(dd); }
function parsearComprobante(texto){
  const lin=String(texto||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const N=lin.map(l=>sinAc(l).toLowerCase()); const todo=N.join('\n');
  const d={monto:null,fecha:null,operacion:'',cuits:[],nombre:'',medio:null};
  // monto: primero el que está junto a "monto/importe/total…", si no el mayor importe con $
  const RM=/(?:\$|\bars\b)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i, RB=/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})\b/;
  const aNum=s=>num(String(s).trim().replace(/\s/g,'.'));
  for(let i=0;i<N.length&&d.monto==null;i++){ if(!/(monto|importe|total|transferiste|enviaste|pagaste|recibiste|valor)/.test(N[i])||/(comision|impuesto|iva|saldo|disponible)/.test(N[i])) continue;
    const m=N[i].match(RM)||N[i].match(RB)||(N[i+1]&&(N[i+1].match(RM)||N[i+1].match(RB))); if(m){ const v=aNum(m[1]); if(v>0) d.monto=v; } }
  if(d.monto==null){ const vs=[...todo.matchAll(new RegExp(RM.source,'gi'))].map(m=>aNum(m[1])).filter(v=>v>0); if(vs.length) d.monto=Math.max(...vs); }
  // fecha: preferir la línea que dice "fecha"
  for(let i=0;i<N.length&&!d.fecha;i++) if(/fecha/.test(N[i])) d.fecha=fechaDe(N[i])||(N[i+1]?fechaDe(N[i+1]):null);
  for(let i=0;i<N.length&&!d.fecha;i++) d.fecha=fechaDe(N[i]);
  // número de operación
  const tokOp=i=>{ if(i>=lin.length||/(cuit|cuil|cbu|cvu|alias|cuenta)/.test(N[i])) return '';
    return (lin[i].match(/[A-Za-z0-9][A-Za-z0-9\-]{5,}/g)||[]).find(x=>(x.match(/\d/g)||[]).length>=5&&!/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(x))||''; };
  const ETQ=[/(operacion|transaccion|referencia|identificacion|codigo de control|n[°º.]? ?de control)/,/(comprobante|n[°º]|nro|numero)/];
  for(const re of ETQ) for(let i=0;i<N.length&&!d.operacion;i++) if(re.test(N[i])) d.operacion=tokOp(i)||tokOp(i+1);
  // CUIT / CUIL
  for(const m of todo.matchAll(/\b(20|23|24|27|30|33|34)[-\s.]?(\d{8})[-\s.]?(\d)\b/g)){ const c=m[1]+m[2]+m[3]; if(cuitValido(c)&&!d.cuits.includes(c)) d.cuits.push(c); }
  // nombre de quien pagó (en el renglón "De:" u "Ordenante:", o en el siguiente)
  const LN=/^(de|desde|origen|ordenante|remitente|pagador|enviado por|emisor|titular(?: de la cuenta)?(?: origen)?|nombre(?: del (?:ordenante|titular|remitente))?)\b\s*:?\s*(.*)$/;
  const nomOk=s=>!!s&&s.length>=5&&!/\d{3,}|\$|cuit|cuil|cbu|cvu|alias|cuenta|banco|mercado ?pago|fecha|transfer|operacion|comprobante/.test(sinAc(s).toLowerCase())&&/[a-z]{2,}\s+[a-z]{2,}/i.test(sinAc(s));
  for(let i=0;i<N.length&&!d.nombre;i++){ const m=N[i].match(LN); if(!m) continue; const resto=lin[i].slice(lin[i].length-m[2].length).trim();
    if(nomOk(resto)) d.nombre=resto; else if(!m[2]&&nomOk(lin[i+1])) d.nombre=lin[i+1]; }
  d.medio=/mercado ?pago/.test(todo)?'Mercado Pago':/(transfer|cbu|cvu|alias|debin)/.test(todo)?'Transferencia':null;
  return d; }

/* ---------- reconocer al cliente ---------- */
const tokens=s=>sinAc(s).toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2);
function coincide(c,d){ const cc=String(c.cuit||'').replace(/\D/g,''); if(cc&&d.cuits.includes(cc)) return 'CUIT';
  const ct=tokens(c.nombre); if(!ct.length) return null; const nt=new Set(tokens(d.nombre)); const hits=ct.filter(w=>nt.has(w)).length;
  return hits>=Math.min(2,ct.length)&&(ct.length>1||nt.size===1)?'nombre':null; }
function sugerirCliente(d){ if(!d) return null; let r=null; for(const c of S.clientes){ const por=coincide(c,d); if(por==='CUIT') return {c,por}; if(por&&!r) r={c,por}; } return r; }

/* ---------- modal de cobro con comprobante ---------- */
const CLIP='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7.5"/></svg>';
let CB=null;
function modalCobro(clienteId,abrirSelector){
  CB={file:null,hash:null,datos:null,texto:'',sugerido:null,fijo:clienteId||null};
  const c=clienteId?IDX.cli[clienteId]:null; const campos=[];
  if(!c) campos.push({n:'cliente',l:'Cliente',t:'select',req:true,full:true,live:'cobro-chk',o:[{v:'',t:'— Elegí el cliente —'}].concat(S.clientes.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>{ const s=saldoCliente(x.id); return {v:x.id,t:x.nombre+(s>0?' · debe '+money(s):'')}; }))});
  campos.push({n:'monto',l:'Monto cobrado ($)',t:'num',req:true,min:0.01,live:'cobro-chk'},{n:'medio',l:'Medio',t:'select',o:MEDIOS.filter(m=>m!=='Cuenta corriente')},
    {n:'fecha',l:'Fecha',t:'date',live:'cobro-chk'},{n:'operacion',l:'N° de operación',t:'text',ph:'Se completa con el comprobante',live:'cobro-chk'},{n:'nota',l:'Nota',t:'text',full:true});
  formModal('Registrar cobro'+(c?' · '+c.nombre:''),campos,{monto:c?saldoCliente(c.id):'',fecha:hoy()},guardarCobro);
  $('#mdb').insertAdjacentHTML('afterbegin',`<div class="comp" id="compz"><input type="file" id="compf" accept="image/*,application/pdf" hidden>
    <button class="btn" type="button" id="compb">${CLIP} Subir comprobante</button><span class="sm muted" id="compst">Foto, captura o PDF del pago. Leo los datos y completo el formulario.</span><div class="chk" id="compchk"></div></div>`);
  const z=$('#compz'), inp=$('#compf');
  $('#compb').onclick=()=>inp.click(); inp.onchange=()=>{ if(inp.files[0]) procesarComprobante(inp.files[0]); inp.value=''; };
  z.ondragover=e=>{ e.preventDefault(); z.classList.add('drag'); }; z.ondragleave=()=>z.classList.remove('drag');
  z.ondrop=e=>{ e.preventDefault(); z.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f) procesarComprobante(f); };
  pintarChequeos(); if(abrirSelector) inp.click(); }

async function procesarComprobante(file){
  if(!/^image\//.test(file.type)&&!(file.type==='application/pdf'||/\.pdf$/i.test(file.name))){ toast('Subí una imagen o un PDF.',true); return; }
  if(file.size>15e6){ toast('El archivo es muy grande (máximo 15 MB).',true); return; }
  const yo=CB; Object.assign(yo,{file,hash:null,datos:null,texto:'',sugerido:null});
  const st=t=>{ const e=$('#compst'); if(e&&CB===yo&&yo.file===file) e.innerHTML=t; }; const b=$('#compb'); if(b) b.disabled=true;
  yo.hash=await hashArchivo(file);
  try{ const r=await leerComprobante(file,t=>st(esc(t))); if(CB!==yo||yo.file!==file||!$('#frm')) return;
    yo.texto=r.texto; yo.datos=r.datos; const hechos=autocompletar(r.datos);
    st(`<b>${esc(file.name)}</b> · ${hechos.length?'completé '+esc(hechos.join(', '))+'. Revisá antes de guardar.':'no encontré datos para completar, cargalos a mano.'}
      <details><summary>Ver texto leído</summary><pre>${esc(r.texto.trim()||'(sin texto)')}</pre></details>`); }
  catch(e){ st(`<b>${esc(file.name)}</b> · no pude leerlo (${esc(e.message||e)}). Completá los datos a mano: el archivo se guarda igual.`); }
  finally{ const bb=$('#compb'); if(bb&&CB===yo){ bb.disabled=false; bb.innerHTML=CLIP+' Cambiar comprobante'; } pintarChequeos(); } }

function autocompletar(d){ const f=$('#frm'); const h=[]; const set=(n,v,t)=>{ if(v!=null&&v!==''&&f.elements[n]){ f.elements[n].value=v; h.push(t); } };
  set('monto',d.monto!=null?fnum(d.monto):null,'monto'); set('fecha',d.fecha,'fecha'); set('operacion',d.operacion,'N° de operación'); set('medio',d.medio,'medio');
  if(!CB.fijo){ CB.sugerido=sugerirCliente(d); if(CB.sugerido) set('cliente',CB.sugerido.c.id,'cliente'); } return h; }

LIVE['cobro-chk']=()=>pintarChequeos();
function dupDe(op,hash){ const o=String(op||'').trim().toLowerCase(); return {op:o?S.cobros.find(x=>x.operacion&&x.operacion.toLowerCase()===o):null,hash:hash?S.cobros.find(x=>x.hash===hash):null}; }
function pintarChequeos(){ const box=$('#compchk'),f=$('#frm'); if(!box||!f||!CB) return; const L=[]; const g=n=>f.elements[n]?f.elements[n].value.trim():'';
  const cid=CB.fijo||+g('cliente')||null, monto=num(g('monto')), fecha=g('fecha'), d=CB.datos, dup=dupDe(g('operacion'),CB.hash);
  if(dup.op) L.push(['bad','Ese N° de operación ya está cargado: cobro del '+fechaTxt(dup.op.fecha)+' a '+cliNom(dup.op.clienteId)+' por '+money2(dup.op.monto)+'.']);
  if(dup.hash&&dup.hash!==dup.op) L.push(['bad','Este mismo archivo ya se subió en el cobro del '+fechaTxt(dup.hash.fecha)+' a '+cliNom(dup.hash.clienteId)+'.']);
  if(d){ if(d.monto==null) L.push(['warn','No encontré el monto en el comprobante.']); if(!d.fecha) L.push(['warn','No encontré la fecha en el comprobante.']);
    const quien=d.nombre||(d.cuits[0]?'CUIT '+d.cuits[0]:'');
    if(CB.fijo){ const c=IDX.cli[CB.fijo]; if(quien){ const por=coincide(c,d); L.push(por?['good','El pago es de '+c.nombre+' (coincide por '+por+').']:['warn','El comprobante parece de «'+quien+'», no de '+c.nombre+'. Revisá que sea el cliente correcto.']); } }
    else if(CB.sugerido) L.push(['good','Reconocí al cliente por '+CB.sugerido.por+': '+CB.sugerido.c.nombre+'.']);
    else if(quien) L.push(['warn','No encontré un cliente que coincida con «'+quien+'». Elegilo a mano.']); }
  if(cid&&monto!=null&&monto>0){ const s=saldoCliente(cid);
    if(monto>s+0.005) L.push(['bad','El monto supera lo que debe '+cliNom(cid)+' ('+money2(s)+').']);
    else L.push(Math.abs(monto-s)<0.005?['good','Cancela todo el saldo de '+cliNom(cid)+'.']:['info','Después de este cobro, '+cliNom(cid)+' queda debiendo '+money2(r2(s-monto))+'.']); }
  if(fecha){ if(fecha>hoy()) L.push(['warn','La fecha es posterior a hoy.']); else if(difDias(hoy(),fecha)>60) L.push(['warn','El comprobante tiene más de 60 días.']); }
  box.innerHTML=L.map(([k,t])=>`<div class="${k}">${esc(t)}</div>`).join(''); }

function guardarCobro(d){ const cid=CB.fijo||+d.cliente; if(!cid) throw new Error('Elegí el cliente.');
  const s=saldoCliente(cid); if(d.monto>s+0.005) throw new Error('El cobro supera el saldo de '+cliNom(cid)+' ('+money2(s)+').');
  const op=(d.operacion||'').trim(), dup=dupDe(op,CB.hash);
  if(dup.op) throw new Error('Ese N° de operación ya está cargado (cobro del '+fechaTxt(dup.op.fecha)+'). Si es otro pago, revisá el número.');
  if(dup.hash) throw new Error('Este comprobante ya se cargó en el cobro del '+fechaTxt(dup.hash.fecha)+' a '+cliNom(dup.hash.clienteId)+'.');
  const cobro={fecha:d.fecha||hoy(),clienteId:cid,monto:d.monto,medio:d.medio,nota:d.nota}; if(op) cobro.operacion=op;
  const fin=adj=>{ cobro.id=sig('Z'); if(adj){ cobro.comprobante=adj; if(CB.hash) cobro.hash=CB.hash; } S.cobros.push(cobro); guardar(); cerrar(); refrescar(); toast(adj?'Cobro registrado con comprobante':'Cobro registrado'); };
  if(!CB.file) return fin(null);
  const b=$('#okb'), file=CB.file; b.disabled=true; b.textContent='Guardando…';
  adjGuardar(file).then(id=>fin({id,nombre:file.name,tipo:file.type})).catch(e=>{ b.disabled=false; b.textContent='Guardar'; const er=$('#err'); if(er) er.textContent='No se pudo guardar el archivo: '+(e&&e.message||e)+'.'; }); }

ACT['cobro-comp']=()=>{ if(!S.clientes.length){ toast('Primero cargá al cliente.',true); return; } modalCobro(null,true); };
ACT['adj-ver']=el=>{ adjLeer(el.dataset.id).then(a=>{ if(!a){ toast('El archivo no está en este dispositivo.',true); return; }
  const u=URL.createObjectURL(a.blob), img=(a.tipo||'').startsWith('image/');
  abrir('Comprobante · '+a.nombre,img?`<img src="${u}" alt="Comprobante" style="max-width:100%;border-radius:10px">`:`<iframe src="${u}" title="Comprobante" style="width:100%;height:70vh;border:0;border-radius:10px"></iframe>`,
    {wide:true,foot:`<a class="btn" href="${u}" download="${esc(a.nombre)}">Descargar</a><button class="btn pri" data-act="cerrar">Cerrar</button>`}); }).catch(e=>toast('No se pudo abrir el archivo: '+(e&&e.message||e),true)); };
