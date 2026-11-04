/* Comprobantes de pago: se guardan en el dispositivo (IndexedDB) y se leen en el navegador
   (texto de PDF con pdf.js u OCR de imágenes con Tesseract). Se sacan todos los datos del comprobante
   (quién pagó, a quién, CUIT, banco, CBU/CVU, alias, monto, fecha, hora, operación, concepto),
   se autocompleta el cobro y se reconoce al cliente o se lo crea en el momento. */
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
const LIBS={pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',pdfW:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',ocr:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',heic:'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'};
const esPdfF=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name||'');
const esHeicF=f=>/hei[cf]/i.test(f.type)||/\.hei[cf]$/i.test(f.name||'');
const esImgF=f=>/^image\//.test(f.type)||/\.(jpe?g|jfif|png|webp|gif|bmp|tiff?|hei[cf]|avif)$/i.test(f.name||'');
// Fotos de iPhone (HEIC): el navegador no las abre, se pasan a JPG
async function aJPG(file,prog){ prog&&prog('Convirtiendo la foto del iPhone (HEIC) a JPG…'); await cargarScript(LIBS.heic);
  const r=await heic2any({blob:file,toType:'image/jpeg',quality:0.9}); const b=Array.isArray(r)?r[0]:r; return new File([b],(file.name||'foto').replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}); }
// Prepara la imagen para el OCR: tamaño cómodo (~2000 px), gris, contraste estirado y, si es una captura oscura, invertida
async function prepararImagen(file){ let src;
  try{ src=await createImageBitmap(file,{imageOrientation:'from-image'}); }
  catch(e){ src=await new Promise((ok,ko)=>{ const im=new Image(); im.onload=()=>ok(im); im.onerror=()=>ko(new Error('el navegador no puede abrir esta imagen, probá con una foto JPG o PNG')); im.src=URL.createObjectURL(file); }); }
  const w=src.width,h=src.height; if(!w||!h) throw new Error('la imagen está vacía');
  const k=Math.min(3,Math.max(0.35,2000/Math.max(w,h))); const cv=document.createElement('canvas'); cv.width=Math.round(w*k); cv.height=Math.round(h*k);
  const g=cv.getContext('2d',{willReadFrequently:true}); g.imageSmoothingQuality='high'; g.drawImage(src,0,0,cv.width,cv.height);
  const im=g.getImageData(0,0,cv.width,cv.height),px=im.data,hist=new Array(256).fill(0); let suma=0;
  for(let i=0;i<px.length;i+=4){ const y=Math.round(px[i]*0.299+px[i+1]*0.587+px[i+2]*0.114); px[i]=y; hist[y]++; suma+=y; }
  const tot=px.length/4, osc=suma/tot<110; let lo=0,hi=255,acc=0; for(let v=0;v<256;v++){ acc+=hist[v]; if(acc>=tot*0.02){ lo=v; break; } } acc=0; for(let v=255;v>=0;v--){ acc+=hist[v]; if(acc>=tot*0.02){ hi=v; break; } }
  const rango=Math.max(1,hi-lo); for(let i=0;i<px.length;i+=4){ let y=Math.min(255,Math.max(0,(px[i]-lo)*255/rango)); if(osc) y=255-y; px[i]=px[i+1]=px[i+2]=y; }
  g.putImageData(im,0,0); return cv; }
const _scr={};
function cargarScript(url){ return _scr[url]||(_scr[url]=new Promise((ok,ko)=>{ const s=document.createElement('script'); s.src=url; s.onload=ok;
  s.onerror=()=>{ delete _scr[url]; s.remove(); ko(new Error('no se pudo descargar el lector, revisá la conexión a internet')); }; document.head.appendChild(s); })); }
async function textoOCR(img,prog){ await cargarScript(LIBS.ocr);
  const r=await Tesseract.recognize(img,'spa',{logger:m=>{ if(prog&&m.status==='recognizing text') prog('Leyendo el comprobante… '+Math.round(m.progress*100)+'%'); }});
  return (r&&r.data&&r.data.text)||''; }
// Arma los renglones según la posición de cada texto en la página: lo que está a la misma altura va junto
// y si hay un hueco grande (dos columnas, etiqueta y valor separados) se corta en renglones distintos.
function lineasPDF(items){ const its=items.filter(x=>x.str&&x.str.trim()).map(x=>({s:x.str.trim(),x:x.transform[4],y:x.transform[5],w:x.width||0,h:Math.abs(x.transform[3])||10}));
  its.sort((a,b)=>b.y-a.y||a.x-b.x); const filas=[];
  for(const it of its){ const f=filas[filas.length-1]; if(f&&Math.abs(f.y-it.y)<=Math.max(2,it.h*0.45)) f.p.push(it); else filas.push({y:it.y,p:[it]}); }
  const out=[]; for(const f of filas){ f.p.sort((a,b)=>a.x-b.x); let seg=[],fin=null;
    for(const p of f.p){ if(fin!=null&&p.x-fin>Math.max(24,p.h*2.5)){ out.push(seg.join(' ')); seg=[]; } seg.push(p.s); fin=p.x+p.w; } if(seg.length) out.push(seg.join(' ')); }
  return out.join('\n'); }
async function textoPDF(file,prog){ await cargarScript(LIBS.pdf); const lib=window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc=LIBS.pdfW;
  const pdf=await lib.getDocument({data:await file.arrayBuffer()}).promise; let t='';
  for(let i=1;i<=Math.min(pdf.numPages,4);i++){ const c=await (await pdf.getPage(i)).getTextContent(); t+=lineasPDF(c.items)+'\n'; }
  if(t.replace(/\s/g,'').length>=20) return t;
  prog&&prog('El PDF es una imagen escaneada, leyéndolo con OCR…'); // se dibuja la primera página y se lee como imagen
  const pg=await pdf.getPage(1); const vp=pg.getViewport({scale:2.5}); const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise; return textoOCR(cv,prog); }
async function leerComprobante(file,prog){ const esPdf=esPdfF(file);
  prog&&prog(esPdf?'Leyendo el PDF…':'Preparando el lector (la primera vez tarda un poco más)…');
  const texto=esPdf?await textoPDF(file,prog):await textoOCR(await prepararImagen(file),prog);
  if(!esPdf&&texto.replace(/\s/g,'').length<15) throw new Error('no encontré texto en la foto. Probá con una foto más nítida, de frente y con buena luz, o con la captura o el PDF original');
  return {texto,datos:parsearComprobante(texto)}; }

/* ---------- interpretación del texto ---------- */
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12,ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,sept:9,set:9,oct:10,nov:11,dic:12};
const BANCOS=[['mercado pago','Mercado Pago'],['mercadopago','Mercado Pago'],['uala','Ualá'],['brubank','Brubank'],['naranja x','Naranja X'],['personal pay','Personal Pay'],['cuenta dni','Cuenta DNI'],['prex','Prex'],['lemon','Lemon'],['modo','MODO'],['reba','Reba'],['wilobank','Wilobank'],
  ['santander','Santander'],['galicia','Galicia'],['bbva','BBVA'],['hsbc','HSBC'],['icbc','ICBC'],['credicoop','Credicoop'],['supervielle','Supervielle'],['comafi','Comafi'],['itau','Itaú'],['bancor','Bancor'],['openbank','Openbank'],
  // estos nombres también pueden ser calles o apellidos: cuentan solo si el renglón dice «banco»
  ['nacion','Banco Nación',1],['provincia','Banco Provincia',1],['ciudad','Banco Ciudad',1],['frances','BBVA',1],['macro','Macro',1],['patagonia','Banco Patagonia',1],['hipotecario','Hipotecario',1],['columbia','Banco Columbia',1],['cordoba','Bancor',1],
  ['santa fe','Banco de Santa Fe',1],['san juan','Banco San Juan',1],['entre rios','Banco Entre Ríos',1],['piano','Banco Piano',1],['industrial','BIND',1],['bind','BIND',1],['del sol','Banco del Sol',1],['municipal','Banco Municipal',1]];
const sinAc=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'');
const titulo=s=>s===s.toUpperCase()?s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu,m=>m.toUpperCase()):s;
function cuitValido(c){ if(!/^\d{11}$/.test(c)) return false; const m=[5,4,3,2,7,6,5,4,3,2]; let s=0; for(let i=0;i<10;i++) s+=+c[i]*m[i]; let v=11-s%11; if(v===11) v=0; return v===+c[10]||v===10; }
const cuitTxt=c=>c&&c.length===11?c.slice(0,2)+'-'+c.slice(2,10)+'-'+c[10]:(c||'');
function fechaDe(s){ let dd,mm,yy,m=s.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/);
  if(m){ dd=+m[1]; mm=+m[2]; yy=+m[3]; }
  else { // «4 de noviembre de 2026», «31/octubre/2026», «31-oct-2026», «04 nov. 2026»
    m=s.match(/\b(\d{1,2})\s*[\/\-.]?\s*(?:de\s+)?([a-z]{3,10})\.?\s*[\/\-.,]?\s*(?:del?\s+)?(\d{4})\b/); if(!m||!MESES[m[2]]) return null; dd=+m[1]; mm=MESES[m[2]]; yy=+m[3]; }
  if(yy<100) yy+=2000; if(mm<1||mm>12||dd<1||dd>31||yy<2000||yy>2100) return null; return yy+'-'+pad(mm)+'-'+pad(dd); }
const horaDe=s=>{ const m=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\b/); return m?pad(+m[1])+':'+m[2]:''; };
const bancoDe=n=>{ const b=BANCOS.find(([k,,debil])=>(!debil||/\bbanco\b|\bbco\b/.test(n))&&new RegExp('\\b'+k+'\\b').test(n)); return b?b[1]:''; };
const nomOk=s=>{ if(!s) return false; const n=sinAc(s).toLowerCase().trim(); return n.length>=5&&!/\d{3,}|\$|@|cuit|cuil|cbu|cvu|alias|cuenta|fecha|hora|transfer|operacion|comprobante|importe|monto|concepto|motivo|referencia|caja de ahorro/.test(n)&&!bancoDe(n)&&/\p{L}{2,}\s+\p{L}{2,}/u.test(s); };
const parte=()=>({nombre:'',cuit:'',banco:'',cbu:'',cvu:'',alias:'',cuenta:''});
const SEC_O=/^(de|desde|origen|cuenta (?:de )?origen|datos (?:de |del )?(?:origen|ordenante|remitente|pagador)|ordenante|remitente|pagador|enviado por|emisor|titular (?:de la cuenta )?origen|quien envia|debitado de|cuenta (?:de )?debito)\b/;
const SEC_D=/^(para|destino|cuenta (?:de )?destino|datos (?:de |del )?(?:destino|destinatario|beneficiario)|destinatario|beneficiario|receptor|enviado a|titular (?:de la cuenta )?destino|acreditado en|cuenta (?:de )?credito)\b/;

function parsearComprobante(texto){
  const lin=String(texto||'').replace(/\r/g,'').split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const N=lin.map(l=>sinAc(l).toLowerCase()); const todo=N.join('\n');
  const d={titulo:'',monto:null,fecha:null,hora:'',operacion:'',concepto:'',medio:null,origen:parte(),destino:parte(),cuits:[],nombre:''};
  const desde=(i,len)=>lin[i].slice(len).replace(/^[\s:.\-–|]+/,'').trim();
  d.titulo=lin.find((l,i)=>/(comprobante|constancia|transferencia|pago|recibo|ticket)/.test(N[i])&&l.length<=60&&!/\$/.test(l))||'';
  // monto: primero el que está junto a "monto/importe/total…", si no el mayor importe con $
  const RM=/(?:\$|\bars\b)\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i, RB=/(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})\b/;
  const aNum=s=>num(String(s).trim().replace(/\s/g,'.'));
  for(let i=0;i<N.length&&d.monto==null;i++){ if(!/(monto|importe|total|transferiste|enviaste|pagaste|recibiste|te transfirio|te envio|valor)/.test(N[i])||/(comision|impuesto|iva|saldo|disponible|limite)/.test(N[i])) continue;
    const m=N[i].match(RM)||N[i].match(RB)||(N[i+1]&&(N[i+1].match(RM)||N[i+1].match(RB))); if(m){ const v=aNum(m[1]); if(v>0) d.monto=v; } }
  if(d.monto==null){ const vs=[...todo.matchAll(new RegExp(RM.source,'gi'))].map(m=>aNum(m[1])).filter(v=>v>0); if(vs.length) d.monto=Math.max(...vs); }
  // fecha y hora: preferir la línea que dice "fecha" u "hora"
  let iF=-1; for(let i=0;i<N.length&&!d.fecha;i++) if(/fecha/.test(N[i])){ d.fecha=fechaDe(N[i]); iF=i; if(!d.fecha&&N[i+1]){ d.fecha=fechaDe(N[i+1]); iF=i+1; } }
  for(let i=0;i<N.length&&!d.fecha;i++){ d.fecha=fechaDe(N[i]); iF=i; }
  for(let i=0;i<N.length&&!d.hora;i++) if(/hora/.test(N[i])) d.hora=horaDe(N[i])||(N[i+1]?horaDe(N[i+1]):'');
  if(!d.hora&&iF>=0) d.hora=horaDe(N[iF])||(N[iF+1]?horaDe(N[iF+1]):''); for(let i=0;i<N.length&&!d.hora;i++) d.hora=horaDe(N[i]);
  // número de operación
  const tokOp=i=>{ if(i>=lin.length||/(cuit|cuil|cbu|cvu|alias|cuenta)/.test(N[i])) return '';
    return (lin[i].match(/[A-Za-z0-9][A-Za-z0-9\-]{5,}/g)||[]).find(x=>(x.match(/\d/g)||[]).length>=5&&!/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(x))||''; };
  const ETQ=[/(operacion|transaccion|referencia|identificacion|codigo de control|n[°º.]? ?de control|id de (?:la )?(?:operacion|transaccion))/,/(comprobante|n[°º]|nro|numero)/];
  for(const re of ETQ) for(let i=0;i<N.length&&!d.operacion;i++) if(re.test(N[i])) d.operacion=tokOp(i)||tokOp(i+1);
  // concepto / motivo
  for(let i=0;i<N.length&&!d.concepto;i++){ const m=N[i].match(/^(concepto|motivo|descripcion|mensaje|detalle|asunto)\b/); if(!m) continue;
    const v=desde(i,m[0].length)||(lin[i+1]&&!/:/.test(lin[i+1])?lin[i+1]:''); if(v&&v.length<=80&&!/^\$/.test(v)) d.concepto=v; }
  // datos de cada parte: se recorre el texto y cada «De / Origen» o «Para / Destino» abre una sección
  // Si el comprobante no dice «De / Para» (Mercado Pago pone «Origen y destino» y abajo los dos bloques),
  // el primer nombre seguido de sus datos (CUIT, CVU, banco…) es quien pagó y el segundo, quien recibió.
  const datoCuenta=n=>/(cuit|cuil|cvu|cbu|alias|cuenta|caja de ahorro)/.test(n)||!!bancoDe(n);
  const bloque=i=>[1,2,3].some(k=>N[i+k]&&datoCuenta(N[i+k]));
  let seq=!N.some(n=>SEC_O.test(n)&&!/^origen y destino/.test(n)||SEC_D.test(n));
  let sec=null,pend=null,ttl=0,bancoArriba='';
  for(let i=0;i<N.length;i++){ const n=N[i],l=lin[i]; let m,s=null; if(!sec&&!bancoArriba) bancoArriba=bancoDe(n); // el banco del encabezado es el que emite el comprobante
    if(/^origen y destino\b/.test(n)){ seq=true; sec=null; continue; }
    if(/(operacion|transaccion)/.test(n)) seq=false;
    if(seq&&nomOk(l)&&bloque(i)){ if(!d.origen.nombre){ d.origen.nombre=l; sec='o'; continue; } if(!d.destino.nombre){ d.destino.nombre=l; sec='d'; continue; } }
    if((m=n.match(SEC_D))||n==='a'||n==='a:'){ s='d'; } else if((m=n.match(SEC_O))){ s='o'; }
    const mr=n.match(/(?:recibiste|te transfirio|te envio|te pago|te pagaron)\b.*?\bde\s+(.+)$/); if(mr){ const v=l.slice(l.length-mr[1].length).trim(); if(nomOk(v)&&!d.origen.nombre) d.origen.nombre=v; }
    if(s){ sec=s; const P=s==='o'?d.origen:d.destino; const rest=m?desde(i,m[0].length):''; const r=rest.replace(/^(?:la cuenta|cuenta)\b\s*:?\s*/i,'');
      if(nomOk(r)&&!P.nombre) P.nombre=r; else if(!P.nombre){ pend=s; ttl=3; } }
    else if(pend&&ttl>0){ ttl--; if(nomOk(l)){ const P=pend==='o'?d.origen:d.destino; if(!P.nombre) P.nombre=l; pend=null; } }
    const P=sec==='o'?d.origen:sec==='d'?d.destino:null;
    const mn=n.match(/^(nombre(?: y apellido)?|titular|razon social|a nombre de|apellido y nombre)\b\s*:?\s*(.*)$/);
    if(mn&&P&&!P.nombre){ const v=desde(i,mn[1].length); if(nomOk(v)) P.nombre=v; else if(!v&&nomOk(lin[i+1])) P.nombre=lin[i+1]; }
    for(const c of n.matchAll(/\b(20|23|24|27|30|33|34)[-\s.]?(\d{8})[-\s.]?(\d)\b/g)){ const v=c[1]+c[2]+c[3]; if(!cuitValido(v)) continue; if(!d.cuits.includes(v)) d.cuits.push(v); if(P&&!P.cuit) P.cuit=v; }
    const cb=n.match(/(?:cbu|cvu)\s*(?:destino|origen)?\s*:?\s*([\d][\d\s-]{20,30}\d)/)||n.match(/\b(\d{22})\b/);
    if(cb&&P){ const v=cb[1].replace(/\D/g,''); if(v.length===22){ if(v.startsWith('000000')){ if(!P.cvu) P.cvu=v; } else if(!P.cbu) P.cbu=v; } }
    const al=n.match(/\balias\b(?:\s*(?:cbu|cvu))?\s*:?\s*([a-z0-9][a-z0-9.\-]{4,19})\b/); if(al&&P&&!P.alias&&!/^(cbu|cvu)$/.test(al[1])) P.alias=al[1];
    const ct=n.match(/\b(caja de ahorro|cuenta corriente|c\.?a\.?|c\.?c\.?)\s*(?:en\s*)?(?:\$|u\$s|pesos|dolares)?\s*:?\s*(?:n[°º]?\s*)?(\d[\d\-\/ ]{4,}\d)/); if(ct&&P&&!P.cuenta) P.cuenta=lin[i].slice(n.indexOf(ct[0])).slice(0,40).trim();
    if(P&&!P.banco){ const b=bancoDe(n); if(b) P.banco=b; } }
  // si no hubo secciones, el primer nombre con etiqueta conocida se toma como quien pagó
  if(!d.origen.nombre&&!d.destino.nombre){ for(let i=0;i<N.length&&!d.origen.nombre;i++){ const m=N[i].match(/^(nombre|titular|ordenante|cliente)\b/); if(m){ const v=desde(i,m[0].length); if(nomOk(v)) d.origen.nombre=v; } } }
  if(!d.origen.cuit&&d.cuits.length&&d.cuits[0]!==d.destino.cuit) d.origen.cuit=d.cuits[0];
  if(!d.origen.banco&&bancoArriba&&bancoArriba!==d.destino.banco) d.origen.banco=bancoArriba;
  ['origen','destino'].forEach(k=>{ if(d[k].nombre) d[k].nombre=titulo(d[k].nombre); });
  d.nombre=d.origen.nombre; if(d.origen.cuit) d.cuits=[d.origen.cuit].concat(d.cuits.filter(c=>c!==d.origen.cuit));
  d.medio=/mercado ?pago/.test(todo)?'Mercado Pago':/(transfer|transfiri|cbu|cvu|alias|debin)/.test(todo)||d.origen.banco?'Transferencia':null;
  return d; }

/* ---------- mostrar todos los datos leídos ---------- */
function datosHtml(d){ if(!d) return ''; const fila=(k,v)=>v?`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`:'';
  const pt=(t,P)=>{ if(!P) return ''; const h=fila('Nombre',P.nombre)+fila('CUIT / CUIL',cuitTxt(P.cuit))+fila('Banco / billetera',P.banco)+fila('CBU',P.cbu)+fila('CVU',P.cvu)+fila('Alias',P.alias)+fila('Cuenta',P.cuenta); return h?`<div class="dcol"><h3>${t}</h3>${h}</div>`:''; };
  const gen=fila('Comprobante',d.titulo)+fila('Monto',d.monto!=null?money2(d.monto):'')+fila('Fecha',d.fecha?fechaTxt(d.fecha)+(d.hora?' · '+d.hora+' hs':''):'')+fila('N° de operación',d.operacion)+fila('Medio',d.medio)+fila('Concepto',d.concepto);
  const cols=pt('Pagó',d.origen)+pt('Recibió',d.destino);
  return gen||cols?`<div class="dcomp"><div class="dcol">${gen?`<h3>Datos del pago</h3>${gen}`:''}</div>${cols}</div>`:''; }

/* ---------- reconocer al cliente ---------- */
const tokens=s=>sinAc(s).toLowerCase().split(/[^a-z]+/).filter(w=>w.length>2);
function coincide(c,d){ const cc=String(c.cuit||'').replace(/\D/g,''); if(cc&&d.cuits.includes(cc)) return 'CUIT';
  const ct=tokens(c.nombre); if(!ct.length) return null; const nt=new Set(tokens(d.nombre)); if(!nt.size) return null; const hits=ct.filter(w=>nt.has(w)).length;
  return hits>=2||(hits>=1&&(hits===ct.length||hits===nt.size))?'nombre':null; }
function sugerirCliente(d){ if(!d) return null; let r=null; for(const c of S.clientes){ const por=coincide(c,d); if(por==='CUIT') return {c,por}; if(por&&!r) r={c,por}; } return r; }

/* ---------- modal de cobro con comprobante ---------- */
const CLIP='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="vertical-align:-3px"><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15.5 7.5"/></svg>';
let CB=null;
const optsClientes=()=>[{v:'',t:'— Elegí el cliente —'}].concat(S.clientes.slice().sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(x=>{ const s=saldoCliente(x.id); return {v:x.id,t:x.nombre+(s>0?' · debe '+money(s):s<0?' · a favor '+money(-s):'')}; }));
function modalCobro(clienteId,abrirSelector){
  CB={file:null,hash:null,datos:null,texto:'',sugerido:null,fijo:clienteId||null};
  const c=clienteId?IDX.cli[clienteId]:null; const campos=[];
  if(!c) campos.push({n:'cliente',l:'Cliente',t:'select',req:true,full:true,live:'cobro-chk',o:optsClientes()});
  campos.push({n:'monto',l:'Monto cobrado ($)',t:'num',req:true,min:0.01,live:'cobro-chk'},{n:'medio',l:'Medio',t:'select',o:MEDIOS.filter(m=>m!=='Cuenta corriente')},
    {n:'fecha',l:'Fecha',t:'date',live:'cobro-chk'},{n:'operacion',l:'N° de operación',t:'text',ph:'Se completa con el comprobante',live:'cobro-chk'},{n:'nota',l:'Nota',t:'text',full:true});
  formModal('Registrar cobro'+(c?' · '+c.nombre:''),campos,{monto:c&&saldoCliente(c.id)>0?saldoCliente(c.id):'',fecha:hoy()},guardarCobro,{wide:true});
  $('#mdb').insertAdjacentHTML('afterbegin',`<div class="comp" id="compz"><input type="file" id="compf" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,.pdf" hidden>
    <button class="btn" type="button" id="compb">${CLIP} Subir comprobante</button><span class="sm muted" id="compst">Foto (JPG, PNG, HEIC del iPhone), captura o PDF del pago. También podés arrastrarlo o pegar una captura con Ctrl+V. Leo todos los datos y completo el formulario.</span><div id="compdat" style="width:100%"></div><div class="chk" id="compchk"></div></div>`);
  const z=$('#compz'), inp=$('#compf');
  $('#compb').onclick=()=>inp.click(); inp.onchange=()=>{ if(inp.files[0]) procesarComprobante(inp.files[0]); inp.value=''; };
  z.ondragover=e=>{ e.preventDefault(); z.classList.add('drag'); }; z.ondragleave=()=>z.classList.remove('drag');
  z.ondrop=e=>{ e.preventDefault(); z.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f) procesarComprobante(f); };
  pintarChequeos(); if(abrirSelector) inp.click(); }

async function procesarComprobante(file){
  if(!esImgF(file)&&!esPdfF(file)){ toast('Ese archivo no es una imagen ni un PDF. Subí una foto, una captura o el PDF del comprobante.',true); return; }
  if(file.size>25e6){ toast('El archivo es muy grande (máximo 25 MB).',true); return; }
  const yo=CB; Object.assign(yo,{file,hash:null,datos:null,texto:'',sugerido:null}); const dat=$('#compdat'); if(dat) dat.innerHTML='';
  const st=t=>{ const e=$('#compst'); if(e&&CB===yo&&yo.file===file) e.innerHTML=t; }; const b=$('#compb'); if(b) b.disabled=true;
  yo.hash=await hashArchivo(file);
  try{ if(esHeicF(file)){ const j=await aJPG(file,t=>st(esc(t))); if(CB!==yo||yo.file!==file) return; yo.file=file=j; } // se guarda el JPG para poder verlo después
    const r=await leerComprobante(file,t=>st(esc(t))); if(CB!==yo||yo.file!==file||!$('#frm')) return;
    yo.texto=r.texto; yo.datos=r.datos; const hechos=autocompletar(r.datos);
    st(`<b>${esc(file.name)}</b> · ${hechos.length?'completé '+esc(hechos.join(', '))+'. Revisá antes de guardar.':'no encontré datos para completar, cargalos a mano.'}`);
    const dd=$('#compdat'); if(dd) dd.innerHTML=datosHtml(r.datos)+`<details><summary>Ver texto leído</summary><pre>${esc(r.texto.trim()||'(sin texto)')}</pre></details>`; }
  catch(e){ st(`<b>${esc(file.name)}</b> · no pude leerlo (${esc(e.message||e)}). Completá los datos a mano: el archivo se guarda igual.`); }
  finally{ const bb=$('#compb'); if(bb&&CB===yo){ bb.disabled=false; bb.innerHTML=CLIP+' Cambiar comprobante'; } pintarChequeos(); } }

function autocompletar(d){ const f=$('#frm'); const h=[]; const set=(n,v,t)=>{ if(v!=null&&v!==''&&f.elements[n]){ f.elements[n].value=v; h.push(t); } };
  set('monto',d.monto!=null?fnum(d.monto):null,'monto'); set('fecha',d.fecha,'fecha'); set('operacion',d.operacion,'N° de operación'); set('medio',d.medio,'medio');
  if(d.concepto&&f.elements.nota&&!f.elements.nota.value) set('nota',d.concepto,'nota');
  if(!CB.fijo){ CB.sugerido=sugerirCliente(d); const sel=f.elements.cliente; const viejo=sel.querySelector('option[value="__nuevo"]'); if(viejo) viejo.remove();
    if(CB.sugerido) set('cliente',CB.sugerido.c.id,'cliente');
    else if(d.nombre){ // no es cliente todavía: se anota como cliente nuevo con los datos del comprobante
      const o=document.createElement('option'); o.value='__nuevo'; o.textContent='+ Cliente nuevo: '+d.nombre+(d.origen.cuit?' · CUIT '+cuitTxt(d.origen.cuit):''); sel.insertBefore(o,sel.options[1]||null); sel.value='__nuevo'; h.push('cliente nuevo'); } }
  return h; }

// pegar una captura (Ctrl+V) mientras está abierto el cobro
document.addEventListener('paste',e=>{ if(!$('#compz')||!CB) return; const it=[...(e.clipboardData&&e.clipboardData.items||[])].find(x=>x.kind==='file'&&/^image\//.test(x.type)); if(!it) return;
  e.preventDefault(); const b=it.getAsFile(); if(b) procesarComprobante(new File([b],'captura-'+hoy()+'.'+((b.type.split('/')[1]||'png').replace('jpeg','jpg')),{type:b.type})); });
LIVE['cobro-chk']=()=>pintarChequeos();
function dupDe(op,hash){ const o=String(op||'').trim().toLowerCase(); return {op:o?S.cobros.find(x=>x.operacion&&x.operacion.toLowerCase()===o):null,hash:hash?S.cobros.find(x=>x.hash===hash):null}; }
function pintarChequeos(){ const box=$('#compchk'),f=$('#frm'); if(!box||!f||!CB) return; const L=[]; const g=n=>f.elements[n]?f.elements[n].value.trim():'';
  const esNuevo=!CB.fijo&&g('cliente')==='__nuevo';
  const cid=CB.fijo||(esNuevo?null:+g('cliente'))||null, monto=num(g('monto')), fecha=g('fecha'), d=CB.datos, dup=dupDe(g('operacion'),CB.hash);
  if(dup.op) L.push(['bad','Ese N° de operación ya está cargado: cobro del '+fechaTxt(dup.op.fecha)+' a '+cliNom(dup.op.clienteId)+' por '+money2(dup.op.monto)+'.']);
  if(dup.hash&&dup.hash!==dup.op) L.push(['bad','Este mismo archivo ya se subió en el cobro del '+fechaTxt(dup.hash.fecha)+' a '+cliNom(dup.hash.clienteId)+'.']);
  if(d){ if(d.monto==null) L.push(['warn','No encontré el monto en el comprobante.']); if(!d.fecha) L.push(['warn','No encontré la fecha en el comprobante.']);
    const quien=d.nombre||(d.cuits[0]?'CUIT '+cuitTxt(d.cuits[0]):'');
    if(CB.fijo){ const c=IDX.cli[CB.fijo]; if(quien){ const por=coincide(c,d); L.push(por?['good','El pago es de '+c.nombre+' (coincide por '+por+').']:['warn','El comprobante parece de «'+quien+'», no de '+c.nombre+'. Revisá que sea el cliente correcto.']); } }
    else if(esNuevo) L.push(['info','Al guardar se anota a '+d.nombre+' como cliente nuevo'+(d.origen.cuit?' con CUIT '+cuitTxt(d.origen.cuit):'')+'. Si ya era cliente con otro nombre, elegilo en la lista.']);
    else if(CB.sugerido&&String(CB.sugerido.c.id)===g('cliente')) L.push(['good','Reconocí al cliente por '+CB.sugerido.por+': '+CB.sugerido.c.nombre+'.']);
    else if(quien&&!d.nombre) L.push(['info','El comprobante no trae el nombre de quien pagó (CUIT '+cuitTxt(d.cuits[0])+'). Elegí el cliente en la lista.']); }
  if(esNuevo&&monto>0) L.push(['info','Como es cliente nuevo y no tiene deuda, el pago queda como saldo a favor.']);
  if(cid&&monto!=null&&monto>0){ const s=saldoCliente(cid);
    if(monto>s+0.005) L.push(['warn',s>0.004?'Paga '+money2(r2(monto-s))+' más de lo que debe: le queda saldo a favor.':cliNom(cid)+' no tiene deuda: el pago queda como saldo a favor.']);
    else L.push(Math.abs(monto-s)<0.005?['good','Cancela todo el saldo de '+cliNom(cid)+'.']:['info','Después de este cobro, '+cliNom(cid)+' queda debiendo '+money2(r2(s-monto))+'.']); }
  if(fecha){ if(fecha>hoy()) L.push(['warn','La fecha es posterior a hoy.']); else if(difDias(hoy(),fecha)>60) L.push(['warn','El comprobante tiene más de 60 días.']); }
  box.innerHTML=L.map(([k,t])=>`<div class="${k}">${esc(t)}</div>`).join(''); }

// cliente nuevo con los datos de quien pagó (si ya hay uno con ese CUIT, se usa ese)
function clienteDesdeComprobante(d){ const ya=d.origen.cuit&&S.clientes.find(c=>String(c.cuit||'').replace(/\D/g,'')===d.origen.cuit); if(ya) return ya;
  const P=d.origen, notas=['Creado desde un comprobante',P.banco,P.cvu?'CVU '+P.cvu:P.cbu?'CBU '+P.cbu:'',P.alias?'Alias '+P.alias:''].filter(Boolean).join(' · ');
  const c={id:sig('Q'),nombre:d.nombre,telefono:'',cuit:P.cuit?cuitTxt(P.cuit):'',direccion:'',notas,creado:hoy()}; S.clientes.push(c); indexar(); return c; }

function guardarCobro(d){
  const op=(d.operacion||'').trim(), dup=dupDe(op,CB.hash);
  if(dup.op) throw new Error('Ese N° de operación ya está cargado (cobro del '+fechaTxt(dup.op.fecha)+'). Si es otro pago, revisá el número.');
  if(dup.hash) throw new Error('Este comprobante ya se cargó en el cobro del '+fechaTxt(dup.hash.fecha)+' a '+cliNom(dup.hash.clienteId)+'.');
  let cid=CB.fijo||(d.cliente==='__nuevo'?0:+d.cliente);
  if(!CB.fijo&&d.cliente==='__nuevo'){ if(!CB.datos||!CB.datos.nombre) throw new Error('Elegí el cliente.'); cid=clienteDesdeComprobante(CB.datos).id; }
  if(!cid) throw new Error('Elegí el cliente.');
  const cobro={fecha:d.fecha||hoy(),clienteId:cid,monto:d.monto,medio:d.medio,nota:d.nota}; if(op) cobro.operacion=op;
  const datos=CB.datos, desdeFicha=!!CB.fijo, hash=CB.hash;
  const fin=adj=>{ cobro.id=sig('Z'); if(adj){ cobro.comprobante=adj; if(hash) cobro.hash=hash; } if(datos) cobro.datosComp=datos; S.cobros.push(cobro);
    const c=IDX.cli[cid]; if(c&&!c.cuit&&datos&&datos.origen.cuit&&coincide(c,datos)&&!S.clientes.some(x=>String(x.cuit||'').replace(/\D/g,'')===datos.origen.cuit)) c.cuit=cuitTxt(datos.origen.cuit); // aprende el CUIT del cliente
    guardar(); cerrar(); if(typeof enCCVentas==='function'&&enCCVentas()) UI.cc={id:cid,per:UI.cc.id===cid?UI.cc.per:'0'}; refrescar();
    if(desdeFicha&&typeof volverCC==='function') volverCC(cid); toast(adj?'Cobro registrado con comprobante':'Cobro registrado'); };
  if(!CB.file) return fin(null);
  const b=$('#okb'), file=CB.file; b.disabled=true; b.textContent='Guardando…';
  adjGuardar(file).then(id=>fin({id,nombre:file.name,tipo:file.type})).catch(e=>{ b.disabled=false; b.textContent='Guardar'; const er=$('#err'); if(er) er.textContent='No se pudo guardar el archivo: '+(e&&e.message||e)+'.'; }); }

ACT['cobro-comp']=()=>modalCobro(null,true);
ACT['adj-ver']=el=>{ const cobro=S.cobros.find(x=>x.comprobante&&x.comprobante.id===el.dataset.id);
  adjLeer(el.dataset.id).then(a=>{ if(!a){ toast('El archivo no está en este dispositivo.',true); return; }
  const u=URL.createObjectURL(a.blob), img=(a.tipo||'').startsWith('image/')&&!/hei[cf]/.test(a.tipo), pdf=/pdf/.test(a.tipo||'')||/\.pdf$/i.test(a.nombre||'');
  const vista=img?`<img src="${u}" alt="${esc(a.nombre)}" style="max-width:100%;border-radius:10px;margin-top:10px">`:pdf?`<iframe src="${u}" title="${esc(a.nombre)}" style="width:100%;height:65vh;border:0;border-radius:10px;margin-top:10px"></iframe>`
    :`<div class="empty">Este tipo de archivo no se puede mostrar acá. Descargalo para abrirlo con su programa.</div>`;
  abrir((cobro?'Comprobante · ':'Archivo · ')+a.nombre,(cobro&&cobro.datosComp?datosHtml(cobro.datosComp):'')+vista,
    {wide:true,foot:`<a class="btn" href="${u}" download="${esc(a.nombre)}">Descargar</a><button class="btn pri" data-act="cerrar">Cerrar</button>`}); }).catch(e=>toast('No se pudo abrir el archivo: '+(e&&e.message||e),true)); };
