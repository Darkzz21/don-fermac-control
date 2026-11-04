/* Etiquetas de precio para imprimir: góndola en hoja A4, grandes o en rollo para impresora de etiquetas.
   El código de barras se dibuja con JsBarcode (se descarga la primera vez que se usa). */
'use strict';
const JSBARCODE='https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
const ET_TAM={gondola:{t:'Góndola · 3 por fila en hoja A4 (63 × 38 mm)',w:63.5,h:38,cols:3,hoja:'A4'},
  grande:{t:'Grande · 2 por fila en hoja A4 (99 × 67 mm)',w:99,h:67,cols:2,hoja:'A4'},
  rollo:{t:'Rollo para impresora de etiquetas (50 × 30 mm)',w:50,h:30,cols:1,hoja:'rollo'}};
const ET={sel:{},q:'',cat:'',tam:'gondola',barras:true,negocio:true};

function codigoEtiqueta(p){ const b=String(p.barras||'').trim();
  if(/^\d{13}$/.test(b)&&ean13ok(b)) return {v:b,f:'EAN13'}; if(/^\d{8}$/.test(b)) return {v:b,f:'EAN8'}; if(b) return {v:b,f:'CODE128'}; return {v:p.codigo,f:'CODE128'}; }
function svgBarras(p,alto){ if(typeof JsBarcode==='undefined') return ''; const c=codigoEtiqueta(p); const s=document.createElementNS('http://www.w3.org/2000/svg','svg');
  try{ JsBarcode(s,c.v,{format:c.f,height:alto,width:1.6,margin:0,fontSize:11,textMargin:1,displayValue:true}); }catch(e){ try{ JsBarcode(s,p.codigo,{format:'CODE128',height:alto,width:1.6,margin:0,fontSize:11,textMargin:1}); }catch(_){ return ''; } }
  s.setAttribute('preserveAspectRatio','xMidYMid meet'); return s.outerHTML; }
function etiquetaHtml(p,T){ const kg=p.unidad==='kg'; const ent=Math.floor(p.precio), dec=Math.round((p.precio-ent)*100);
  return `<div class="et" style="width:${T.w}mm;height:${T.h}mm">${ET.negocio?`<div class="et-neg">${esc(S.config.nombre)}</div>`:''}<div class="et-nom">${esc(p.nombre)}</div>
    <div class="et-pr"><span class="et-m">${esc(S.config.moneda)}</span>${fmt(ent,0)}${dec?`<sup>,${pad(dec)}</sup>`:''}<span class="et-u">${kg?'/ kg':'c/u'}</span></div>
    ${ET.barras?`<div class="et-bc">${svgBarras(p,T.h>=50?42:T.h>=35?26:18)}</div>`:''}<div class="et-pie"><span>${esc(p.codigo)}${p.plu?' · PLU '+esc(p.plu):''}</span><span>${fechaTxt(hoy())}</span></div></div>`; }
const ET_CSS=`.et{box-sizing:border-box;border:1px dashed #bbb;padding:2mm 2.5mm;display:flex;flex-direction:column;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#000;background:#fff;page-break-inside:avoid;break-inside:avoid}
.et-neg{font-size:7pt;text-transform:uppercase;letter-spacing:.05em;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.et-nom{font-weight:700;font-size:10pt;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.et-pr{font-weight:800;font-size:20pt;line-height:1.05;margin-top:auto;white-space:nowrap}.et-pr sup{font-size:55%;vertical-align:.7em}.et-m{font-size:60%;margin-right:1mm}.et-u{font-size:40%;font-weight:600;margin-left:1.2mm;color:#333}
.et-bc{display:flex;justify-content:center;min-height:0}.et-bc svg{max-width:100%;height:auto;max-height:100%}
.et-pie{display:flex;justify-content:space-between;font-size:6pt;color:#555;gap:2mm}`;

function etLista(){ const q=sinAc(ET.q).toLowerCase().trim();
  return S.productos.filter(p=>p.activo&&(!ET.cat||p.categoria===ET.cat)&&(!q||sinAc(p.nombre).toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q)||(p.barras||'').includes(q))).sort((a,b)=>a.nombre.localeCompare(b.nombre)); }
const etTotal=()=>Object.values(ET.sel).reduce((a,n)=>a+n,0);
function etFilas(){ const l=etLista(); return l.length?l.map(p=>{ const n=ET.sel[p.id]||0; return `<label class="etrow"><input type="checkbox" data-chg="et-chk" data-id="${p.id}" ${n?'checked':''}>
  <span class="etn"><b>${esc(p.nombre)}</b><span class="sm muted">${esc(p.codigo)}${p.categoria?' · '+esc(p.categoria):''}</span></span><span class="n">${money2(p.precio)}${p.unidad==='kg'?' / kg':''}</span>
  <input class="etc" data-chg="et-cant" data-id="${p.id}" value="${n||1}" inputmode="numeric" aria-label="Copias de ${esc(p.nombre)}" ${n?'':'disabled'}></label>`; }).join(''):vacioHtml('No hay productos con esa búsqueda.'); }
function etPintar(){ const r=$('#etlist'); if(r) r.innerHTML=etFilas(); etResumen(); }
function etResumen(){ const t=etTotal(),k=Object.keys(ET.sel).length; const e=$('#etres'); if(e) e.textContent=t?k+' producto'+(k>1?'s':'')+' · '+t+' etiqueta'+(t>1?'s':''):'Elegí los productos'; const b=$('#etprint'); if(b) b.disabled=!t;
  const pv=$('#etprev'); if(pv){ const ids=Object.keys(ET.sel).slice(0,3); pv.innerHTML=ids.length?ids.map(id=>etiquetaHtml(prod(+id),ET_TAM[ET.tam])).join(''):'<span class="sm muted">La vista previa aparece cuando elegís productos.</span>'; } }

ACT['prod-etiquetas']=()=>{ if(!S.productos.some(p=>p.activo)){ toast('Todavía no hay productos.',true); return; }
  abrir('Imprimir etiquetas de precio',`<style>${ET_CSS}</style><div class="filters" style="margin:0 0 10px"><label class="field">Buscar<input id="etq" data-live="et-q" value="${esc(ET.q)}" placeholder="Nombre o código"></label>
   <label class="field">Categoría<select data-chg="et-cat"><option value="">Todas</option>${opts(cats(),ET.cat)}</select></label>
   <label class="field">Tamaño<select data-chg="et-tam">${opts(Object.entries(ET_TAM).map(([v,o])=>({v,t:o.t})),ET.tam)}</select></label></div>
   <div class="bar" style="margin-bottom:8px;flex-wrap:wrap;gap:8px"><button class="btn sm" type="button" data-act="et-todos">Elegir los de la lista</button><button class="btn sm" type="button" data-act="et-stock">Solo los que tienen stock</button><button class="btn sm ghost" type="button" data-act="et-ninguno">Ninguno</button>
   <label class="field inline"><input type="checkbox" data-chg="et-opt" data-k="barras" ${ET.barras?'checked':''}> Código de barras</label><label class="field inline"><input type="checkbox" data-chg="et-opt" data-k="negocio" ${ET.negocio?'checked':''}> Nombre del negocio</label></div>
   <div class="etgrid"><div class="etlist" id="etlist">${etFilas()}</div><div><div class="sm muted" style="margin-bottom:6px">Vista previa</div><div class="etprev" id="etprev"></div></div></div>`,
   {wide:true,noFocus:true,foot:`<span class="sm muted" id="etres" style="margin-right:auto"></span><button class="btn" data-act="cerrar">Cerrar</button><button class="btn pri" id="etprint" data-act="et-imprimir">Imprimir</button>`});
  etResumen(); if(ET.barras) cargarScript(JSBARCODE).then(etResumen).catch(()=>{}); };
LIVE['et-q']=el=>{ ET.q=el.value; const r=$('#etlist'); if(r) r.innerHTML=etFilas(); };
CHG['et-cat']=el=>{ ET.cat=el.value; etPintar(); };
CHG['et-tam']=el=>{ ET.tam=el.value; etResumen(); };
CHG['et-opt']=el=>{ ET[el.dataset.k]=el.checked; if(ET.barras) cargarScript(JSBARCODE).then(etResumen).catch(()=>{}); etResumen(); };
CHG['et-chk']=el=>{ const id=+el.dataset.id, c=el.closest('.etrow').querySelector('.etc'); if(el.checked){ ET.sel[id]=Math.max(1,parseInt(c.value)||1); c.disabled=false; } else { delete ET.sel[id]; c.disabled=true; } etResumen(); };
CHG['et-cant']=el=>{ const id=+el.dataset.id, n=parseInt(el.value); if(!(n>0)||n>500){ toast('Poné entre 1 y 500 copias.',true); el.value=ET.sel[id]||1; return; } ET.sel[id]=n; etResumen(); };
ACT['et-todos']=()=>{ etLista().forEach(p=>{ if(!ET.sel[p.id]) ET.sel[p.id]=1; }); etPintar(); };
ACT['et-stock']=()=>{ ET.sel={}; etLista().filter(p=>stockDe(p.id)>0).forEach(p=>ET.sel[p.id]=1); etPintar(); };
ACT['et-ninguno']=()=>{ ET.sel={}; etPintar(); };
ACT['et-imprimir']=async()=>{ const T=ET_TAM[ET.tam]; const ids=Object.keys(ET.sel); if(!ids.length) return;
  if(ET.barras){ try{ await cargarScript(JSBARCODE); }catch(e){ toast('No se pudo descargar el generador de códigos de barras. Se imprimen sin código.',true); } }
  const html=[]; ids.forEach(id=>{ const p=prod(+id); if(!p) return; const e=etiquetaHtml(p,T); for(let i=0;i<ET.sel[id];i++) html.push(e); });
  const pagina=T.hoja==='rollo'?`@page{size:${T.w}mm ${T.h}mm;margin:0}body{margin:0}.et{border:0;page-break-after:always}`:`@page{size:A4;margin:8mm}body{margin:0}.hoja{display:grid;grid-template-columns:repeat(${T.cols},${T.w}mm);gap:0;justify-content:center}`;
  try{ const f=document.createElement('iframe'); f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f); const d=f.contentWindow.document;
    d.open(); d.write(`<html><head><title>Etiquetas</title><style>${ET_CSS}${pagina}</style></head><body><div class="hoja">${html.join('')}</div></body></html>`); d.close();
    setTimeout(()=>{ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Este navegador no permite imprimir desde acá.',true); } setTimeout(()=>f.remove(),2000); },300);
    toast(html.length+' etiqueta'+(html.length>1?'s':'')+' enviadas a imprimir'); }catch(e){ toast('No se pudo preparar la impresión.',true); } };
