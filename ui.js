/* Interfaz: ayudantes, modales, navegación, Panel, Ventas (punto de venta) y Caja. */
'use strict';
const UI={vista:'panel',ventasTab:'vender',invTab:null,compTab:'lista',provTab:'prov',
  f:{prod:{q:'',cat:'',prov:'',ver:'',est:'activos'},hist:{q:'',desde:'',hasta:''},mov:{q:'',tipo:'',desde:''},comp:{q:'',desde:''},cli:{q:''},gas:{q:'',desde:''},pos:{q:'',cat:''},pre:{q:'',ver:''},ccv:{q:'',ver:'saldo'}},
  caja:{fecha:null},rep:{per:'mes',desde:'',hasta:''},cc:{id:null,per:'0'},cart:{items:[],clienteId:'',medio:'Efectivo',recibido:'',descPct:''}};
const ACT={},FILL={},LIVE={},CHG={},VIEWS={},AFTER={}; let _raf=0;
const gp=p=>p.split('.').reduce((o,k)=>o[k],UI);
const sp=(p,v)=>{const a=p.split('.'),k=a.pop();a.reduce((o,x)=>o[x],UI)[k]=v;};
const pill=(k,t)=>`<span class="pill ${k}">${esc(t)}</span>`;
const sel=(v,x)=>String(v)===String(x)?'selected':'';
const opts=(arr,cur)=>arr.map(o=>{const v=typeof o==='object'?o.v:o,t=typeof o==='object'?o.t:o;return `<option value="${esc(v)}" ${sel(cur,v)}>${esc(t)}</option>`}).join('');
const vacioHtml=t=>`<div class="empty">${esc(t)}</div>`;
const cats=()=>[...new Set(S.productos.map(p=>p.categoria).filter(Boolean))].sort();

/* ---------- avisos y diálogos ---------- */
let _toast=null;
function toast(msg,bad){ const o=$('#toast'); if(o) o.remove(); const t=document.createElement('div'); t.id='toast'; t.className='toast'+(bad?' bad':''); t.setAttribute('role','status'); t.textContent=msg; document.body.appendChild(t); clearTimeout(_toast); _toast=setTimeout(()=>t.remove(),bad?5000:2600); }
function abrir(titulo,html,o={}){ cerrar(); const ov=document.createElement('div'); ov.className='ov'; ov.id='ov';
  ov.innerHTML=`<div class="md ${o.wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}"><h2>${esc(titulo)}</h2><div id="mdb">${html}</div>${o.foot?`<div class="foot">${o.foot}</div>`:''}</div>`;
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) cerrar(); }); document.body.appendChild(ov);
  const f=ov.querySelector('input:not([readonly]):not([type=checkbox]),select,textarea'); if(f&&!o.noFocus) f.focus(); }
function cerrar(){ const o=$('#ov'); if(o) o.remove(); }
ACT.cerrar=()=>cerrar();
function confirmar(msg,onYes,txt='Confirmar',bad=true){ abrir('Confirmar',`<p style="margin:0">${msg}</p>`,{foot:`<button class="btn" data-act="cerrar">Cancelar</button><button class="btn ${bad?'bad':'pri'}" id="yes">${esc(txt)}</button>`}); $('#yes').onclick=()=>{cerrar();onYes();}; }
async function copiar(txt,ok='Copiado'){ try{ await navigator.clipboard.writeText(txt); toast(ok); }catch(e){ const t=document.createElement('textarea'); t.value=txt; document.body.appendChild(t); t.select(); let done=false; try{done=document.execCommand('copy');}catch(_){} t.remove(); toast(done?ok:'No se pudo copiar. Seleccioná el texto y copialo a mano.',!done); } }
async function descargar(nombre,texto){
  let dl=null; try{ dl=(typeof claude!=='undefined'&&claude.use)?await claude.use('downloads'):null; }catch(e){}
  const ext=nombre.split('.').pop(); const mime=ext==='csv'?'text/csv':'application/json';
  const manual=()=>{ try{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([texto],{type:mime})); a.download=nombre; document.body.appendChild(a); a.click(); a.remove(); }catch(e){} };
  if(dl){ try{ await dl.save({filename:nombre,data:texto}); toast('Archivo guardado'); return; }catch(e){ if(e&&e.code==='declined') return; } }
  abrir('Guardar '+nombre,`<p class="sm muted" style="margin-top:0">Si la descarga directa no funciona en este navegador, copiá el contenido y pegalo en un archivo de texto con ese nombre.</p><textarea readonly style="min-height:140px;font-family:ui-monospace,monospace;font-size:12px">${esc(texto.slice(0,200000))}</textarea>`,{foot:`<button class="btn" data-act="cerrar">Cerrar</button><button class="btn" id="dlc">Copiar contenido</button><button class="btn pri" id="dla">Descargar archivo</button>`});
  $('#dlc').onclick=()=>copiar(texto,'Contenido copiado'); $('#dla').onclick=manual; }

/* formularios en modal */
const fnum=v=>String(v).replace('.',',');
function campoHtml(c,v){ const id='f_'+c.n; const val=v==null?'':v; let inner;
  if(c.t==='check') return `<label class="field inline ${c.full?'full':''}"><input type="checkbox" name="${c.n}" id="${id}" ${val?'checked':''}> ${esc(c.l)}</label>`;
  if(c.t==='select') inner=`<select name="${c.n}" id="${id}" ${c.live?`data-live="${c.live}"`:''}>${opts(c.o||[],val)}</select>`;
  else if(c.t==='area') inner=`<textarea name="${c.n}" id="${id}">${esc(val)}</textarea>`;
  else inner=`<input type="${c.t==='date'?'date':c.t==='color'?'color':'text'}" name="${c.n}" id="${id}" value="${esc(c.t==='num'&&val!==''?fnum(val):val)}" ${c.t==='color'?'style="padding:2px;height:40px"':''} ${c.t==='num'?'inputmode="decimal"':''} ${c.list?`list="dl_${c.n}"`:''} ${c.ph?`placeholder="${esc(c.ph)}"`:''} ${c.ro?'readonly':''} ${c.live?`data-live="${c.live}"`:''}>`+(c.list?`<datalist id="dl_${c.n}">${c.list.map(x=>`<option value="${esc(x)}">`).join('')}</datalist>`:'');
  return `<label class="field ${c.full?'full':''}">${esc(c.l)}${c.req?' *':''}${inner}${c.hint!=null?`<span class="muted" style="font-weight:400;font-size:12px" id="h_${c.n}">${c.hint}</span>`:''}</label>`; }
function leerForm(campos,form){ const d={};
  for(const c of campos){ const el=form.elements[c.n]; if(!el) continue;
    if(c.t==='check'){ d[c.n]=el.checked; continue; }
    const raw=el.value.trim();
    if(c.t==='num'){ if(raw===''){ if(c.req) throw new Error('Completá «'+c.l+'».'); d[c.n]=c.def!=null?c.def:0; continue; }
      const v=num(raw); if(v==null) throw new Error('«'+c.l+'» tiene que ser un número (por ejemplo 1250,50).'); if(c.min!=null&&v<c.min) throw new Error('«'+c.l+'» no puede ser menor a '+c.min+'.'); d[c.n]=v; }
    else { if(c.req&&raw==='') throw new Error('Completá «'+c.l+'».'); d[c.n]=raw; } }
  return d; }
function formModal(titulo,campos,vals,onSave,o={}){
  abrir(titulo,`<form id="frm" class="frm" autocomplete="off">${campos.map(c=>campoHtml(c,vals[c.n])).join('')}<button type="submit" hidden></button></form>${o.extra||''}<div id="err" class="sm dn" style="margin-top:8px" role="alert"></div>`,
    {wide:o.wide,foot:(o.foot||'')+`<button class="btn" data-act="cerrar" type="button">Cancelar</button><button class="btn pri" id="okb" type="button">${o.okText||'Guardar'}</button>`});
  const go=()=>{ try{ onSave(leerForm(campos,$('#frm'))); }catch(err){ const e=$('#err'); if(e) e.textContent=err.message; } };
  $('#okb').onclick=go; $('#frm').addEventListener('submit',e=>{e.preventDefault();go();}); }

/* ---------- eventos globales ---------- */
document.addEventListener('click',e=>{ const el=e.target.closest('[data-act]'); if(!el) return; const a=ACT[el.dataset.act]; if(!a) return;
  try{ a(el,e); }catch(err){ toast(err.message||'Ocurrió un problema',true); console.error(err); } });
document.addEventListener('input',e=>{ const el=e.target;
  if(el.dataset&&el.dataset.bind){ sp(el.dataset.bind,el.type==='checkbox'?el.checked:el.value); if(FILL[UI.vista]){ cancelAnimationFrame(_raf); _raf=requestAnimationFrame(()=>FILL[UI.vista]()); } }
  if(el.dataset&&el.dataset.live&&LIVE[el.dataset.live]) LIVE[el.dataset.live](el,e); });
document.addEventListener('change',e=>{ const el=e.target; if(el.dataset&&el.dataset.chg&&CHG[el.dataset.chg]){ try{ CHG[el.dataset.chg](el,e); }catch(err){ toast(err.message,true); } } });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrar();
  if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.key&&ACT[e.target.dataset.key]){ e.preventDefault(); try{ ACT[e.target.dataset.key](e.target,e); }catch(err){ toast(err.message,true); } } });
ACT.go=el=>{ ir(el.dataset.v,el.dataset); };

/* ---------- navegación ---------- */
const NAV=[['#','Inicio'],['panel','Panel','<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>'],
 ['#','Vender'],['ventas','Ventas','<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 8H6"/>'],
 ['caja','Caja','<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>'],
 ['#','Stock'],['productos','Productos','<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'],
 ['inventario','Inventario','<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'],
 ['compras','Compras','<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'],
 ['proveedores','Proveedores','<path d="M4 9l1-5h14l1 5M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M5 12v8h14v-8"/>'],
 ['#','Gestión'],['clientes','Clientes','<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5a3 3 0 0 1 0 6M18 14.5c1.8.7 3 2.3 3 5.5"/>'],
 ['gastos','Gastos','<path d="M12 3v18M17 7.5c-.6-1.5-2.4-2.5-5-2.5-3 0-4.5 1.3-4.5 3s1.5 2.5 4.5 3 4.5 1.3 4.5 3-1.6 3-4.5 3c-2.6 0-4.4-1-5-2.5"/>'],
 ['reportes','Reportes','<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
 ['#','Sistema'],['ajustes','Ajustes','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>']];
function conteos(){ const lv=S.config.venc?S.lotes.filter(l=>l.cant>0&&l.vence&&difDias(l.vence,hoy())<=S.config.diasVence).length:0;
  const sb=S.productos.filter(p=>p.activo&&stockDe(p.id)<=p.minimo).length; return {inventario:lv,productos:sb}; }
function navHtml(){ const c=conteos(); return NAV.map(([k,t,ic])=>k==='#'?`<div class="grp">${t}</div>`:`<a href="#${k}" class="${UI.vista===k?'on':''}" ${UI.vista===k?'aria-current="page"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${t}${c[k]?`<span class="cnt">${c[k]}</span>`:''}</a>`).join(''); }
const GESTIA_MARK='<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#000"/><g stroke="#3A7C80" stroke-width="2.6" stroke-linecap="round"><line x1="35.6" y1="35.6" x2="20.6" y2="29.1"/><line x1="20.6" y1="29.1" x2="17.4" y2="16"/><line x1="35.6" y1="35.6" x2="38.9" y2="20.2"/><line x1="35.6" y1="35.6" x2="51.5" y2="31.9"/><line x1="35.6" y1="35.6" x2="23.4" y2="45.9"/><line x1="23.4" y1="45.9" x2="10.8" y2="44.1"/></g><circle cx="35.6" cy="35.6" r="4.5" fill="#7BE0A5"/><circle cx="20.6" cy="29.1" r="3.6" fill="#fff"/><circle cx="17.4" cy="16" r="2.8" fill="#7BE0A5"/><circle cx="38.9" cy="20.2" r="3" fill="#0E8F86"/><circle cx="51.5" cy="31.9" r="4.5" fill="#fff"/><circle cx="23.4" cy="45.9" r="4.9" fill="#0E8F86"/><circle cx="10.8" cy="44.1" r="2.8" fill="#7BE0A5"/></svg>';
function iniciales(n){ return String(n||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
function pintarMarco(){ const c=S.config;
  $('#side').innerHTML=`<div class="brand">${GESTIA_MARK}<b>gestia</b></div><div class="biz">${c.logo?`<img src="${esc(c.logo)}" alt="">`:`<span class="ini">${esc(iniciales(c.nombre))}</span>`}<div><b>${esc(c.nombre||'Mi negocio')}</b><small>${esc(c.sub||c.rubro||'')}</small></div></div><nav class="nav" id="nav" aria-label="Secciones">${navHtml()}</nav><div class="sidefoot" id="sf"></div>`;
  document.title=(c.nombre?c.nombre+' · ':'')+'Gestia'; }
function ir(v,extra){ UI.vista=v; if(extra&&extra.tab){ if(v==='ventas') UI.ventasTab=extra.tab; if(v==='inventario') UI.invTab=extra.tab; if(v==='compras') UI.compTab=extra.tab; if(v==='proveedores') UI.provTab=extra.tab; }
  if(extra&&extra.ver&&v==='productos') UI.f.prod.ver=extra.ver; if(location.hash!=='#'+v) location.hash=v; else render(); }
function render(){ if(!S) return; const nav=$('#nav'); if(nav) nav.innerHTML=navHtml();
  const sf=$('#sf'); if(sf){ const ur=S.config.ultimoRespaldo; sf.innerHTML=S.config.demo?'<span class="dot w"></span>Datos de ejemplo':(ur&&difDias(hoy(),ur)<=7?'<span class="dot"></span>Respaldo: '+fechaTxt(ur):'<span class="dot w"></span>'+(ur?'Respaldo: '+fechaTxt(ur):'Sin respaldo')); }
  const v=$('#view'); v.innerHTML=(VIEWS[UI.vista]||VIEWS.panel)(); if(AFTER[UI.vista]) AFTER[UI.vista](); window.scrollTo(0,0); }
function refrescar(){ indexar(); const y=window.scrollY; const nav=$('#nav'); if(nav) nav.innerHTML=navHtml(); if(FILL[UI.vista]&&!['panel','caja','ajustes','reportes'].includes(UI.vista)) FILL[UI.vista](); else { const v=$('#view'); v.innerHTML=VIEWS[UI.vista](); if(AFTER[UI.vista]) AFTER[UI.vista](); } window.scrollTo(0,y); }
const encab=(t,sub,acc)=>`<div class="head"><div><h1>${esc(t)}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div><div class="bar">${acc||''}</div></div>`;
const tabs=(lista,cur,fn)=>`<div class="tabs" role="tablist">${lista.map(([k,t])=>`<button role="tab" aria-selected="${cur===k}" class="${cur===k?'on':''}" data-act="${fn}" data-t="${k}">${t}</button>`).join('')}</div>`;
const wa=(tel,txt)=>{ const n=String(tel||'').replace(/\D/g,''); return n?`https://wa.me/${n}?text=${encodeURIComponent(txt)}`:''; };

/* ================= PANEL ================= */
VIEWS.panel=function(){
  const h=hoy(), mes=addDias(h,-29); const rh=reporte(h,h), rm=reporte(mes,h);
  const stockCosto=S.productos.reduce((a,p)=>a+Math.max(0,stockDe(p.id))*p.costo,0), stockVenta=S.productos.reduce((a,p)=>a+Math.max(0,stockDe(p.id))*p.precio,0);
  const porCobrar=S.clientes.reduce((a,c)=>a+Math.max(0,saldoCliente(c.id)),0);
  const lotesV=S.config.venc?S.lotes.filter(l=>l.cant>0&&l.vence):[]; const venc=lotesV.filter(l=>difDias(l.vence,hoy())<0), porv=lotesV.filter(l=>{const d=difDias(l.vence,hoy());return d>=0&&d<=S.config.diasVence;});
  const sin=S.productos.filter(p=>p.activo&&stockDe(p.id)<=0), bajo=S.productos.filter(p=>p.activo&&stockDe(p.id)>0&&stockDe(p.id)<=p.minimo);
  const viejos=S.productos.filter(p=>{ if(!p.activo) return false; const d=diasPrecio(p); return d!=null&&d>S.config.diasPrecio; });
  const al=[];
  if(venc.length) al.push(['bad',`<b>${venc.length} lote${venc.length>1?'s':''} vencido${venc.length>1?'s':''}</b> con stock: ${venc.slice(0,3).map(l=>esc((prod(l.productoId)||{}).nombre)).join(', ')}`,'inventario','lotes','Dar de baja']);
  if(porv.length) al.push(['warn',`<b>${porv.length} lote${porv.length>1?'s':''} por vencer</b> en ${S.config.diasVence} días o menos: ${porv.slice(0,3).map(l=>esc((prod(l.productoId)||{}).nombre)).join(', ')}`,'inventario','lotes','Ver']);
  if(viejos.length) al.push(['info',`<b>${viejos.length} precio${viejos.length>1?'s':''} sin actualizar</b> hace más de ${S.config.diasPrecio} días`,'productos','','Revisar']);
  if(porCobrar>0) al.push(['info',`<b>${money(porCobrar)}</b> por cobrar en cuenta corriente`,'clientes','','Ver clientes']);
  const rb=S.config.ultimoRespaldo; if(!S.config.demo&&(!rb||difDias(h,rb)>7)) al.push(['warn',`<b>Hacé un respaldo.</b> Tus datos viven en este navegador${rb?` y el último respaldo fue el ${fechaTxt(rb)}`:' y todavía no hiciste ninguno'}.`,'ajustes','','Respaldar']);
  // gráfico 14 días
  const dias=[];for(let i=13;i>=0;i--){ const f=addDias(h,-i); dias.push({f,t:ventasValidas(f,f).reduce((a,v)=>a+v.total,0)}); } const mx=Math.max(1,...dias.map(d=>d.t));
  const top=reporte(mes,h).prods.sort((a,b)=>b.ing-a.ing).slice(0,6); const mt=Math.max(1,...top.map(t=>t.ing)); const st=top.reduce((a,t)=>a+t.ing,0); const pct=v=>Math.round(v/Math.max(1,rm.ingresos)*100)+'%';
  const DS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'], dsem=f=>DS[new Date(f+'T12:00').getDay()];
  const fechaLarga=(()=>{const t=new Date(h+'T12:00').toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'}).replace(',','');return t.charAt(0).toUpperCase()+t.slice(1);})();
  const rep=S.productos.filter(p=>p.activo&&stockDe(p.id)<=p.minimo).map(p=>({p,s:sugerido(p)})).sort((a,b)=>stockDe(a.p.id)/Math.max(a.p.minimo,1)-stockDe(b.p.id)/Math.max(b.p.minimo,1)); const repV=rep.slice(0,6);
  const saludo=(()=>{const hh=new Date().getHours();return hh<12?'Buen día':hh<20?'Buenas tardes':'Buenas noches';})();
  return `${S.config.demo?`<div class="demo"><span>Estás viendo <b>datos de ejemplo</b>. Probá todo con tranquilidad.</span><button class="btn sm" data-act="go" data-v="ajustes">Empezar con mis datos</button></div>`:''}
  ${encab(saludo,fechaLarga,`<button class="btn pri" data-act="go" data-v="ventas">Nueva venta</button>`)}
  <div class="kpis">
   <div class="kpi"><div class="k">Ventas de hoy</div><div class="v">${money(rh.ingresos)}</div><div class="d">${rh.vs.length} venta${rh.vs.length===1?'':'s'}</div></div>
   <div class="kpi"><div class="k">Ventas, últimos 30 días</div><div class="v">${money(rm.ingresos)}</div><div class="d">${rm.vs.length} ventas</div></div>
   <div class="kpi ${rm.neto>=0?'good':'bad'}"><div class="k">Resultado, 30 días</div><div class="v">${money(rm.neto)}</div><div class="d">después de gastos y mermas</div></div>
   <div class="kpi"><div class="k">Stock a costo</div><div class="v">${money(stockCosto)}</div><div class="d">vale ${money(stockVenta)} a precio de venta</div></div>
</div>
  <div class="grid g21"><div class="card"><h2>Ventas de los últimos 14 días</h2><div class="bars" role="img" aria-label="Ventas por día">${dias.map((d,i)=>{const hy=i===dias.length-1, w=hy?'Hoy':dsem(d.f), ht=Math.max(2,d.t/mx*100); return `<div class="col" tabindex="0" style="--h:${ht}%" aria-label="${w} ${fechaTxt(d.f)}: ${money(d.t)}"><div class="tip">${w} ${d.f.slice(8)}/${d.f.slice(5,7)}<b>${money(d.t)}</b></div><div class="bar1" style="height:${ht}%"></div><div class="lb"><span class="wd${/^(Sáb|Dom)$/.test(w)?' fin':''}">${w}</span><span>${d.f.slice(8)}</span></div></div>`;}).join('')}</div></div>
   <div class="card"><h2>Más vendidos, últimos 30 días</h2>${top.length?`<div class="tv">${top.map((t,i)=>`<div class="r" title="${esc(t.nombre)}"><div class="n">${i+1}</div><div class="nm">${esc(t.nombre)}</div><div class="am">${money(t.ing)}</div><div class="ln"><div class="tr"><div class="fl" style="width:${t.ing/mt*100}%"></div></div><span class="pc">${pct(t.ing)}</span></div></div>`).join('')}<div class="ft">Estos ${top.length} productos son el <b>${pct(st)}</b> de lo vendido en 30 días.</div></div>`:vacioHtml('Todavía no hay ventas en los últimos 30 días.')}</div></div>
  <div class="grid g2"><div class="card"><h2>Alertas${al.length?`<span class="cnt">${al.length}</span>`:''}</h2><div class="alerts">${al.length?al.map(a=>`<div class="al ${a[0]}"><div class="grow">${a[1]}</div><button class="btn sm" data-act="go" data-v="${a[2]}" data-tab="${a[3]}" ${a[2]==='productos'&&a[4]==='Revisar'?'data-ver="precio"':''}>${a[4]}</button></div>`).join(''):'<div class="al good"><div class="grow">Todo en orden. No hay alertas.</div></div>'}</div></div>
   <div class="card"><div class="chd"><h2>Para reponer${sin.length?`<span class="tag-bad">● ${sin.length} sin stock</span>`:''}</h2>${rep.length?`<button class="btn sm pri" data-act="go" data-v="compras" data-tab="pedido">Armar pedido</button>`:''}</div>${rep.length?`<div class="tw"><table><thead><tr><th>Producto</th><th class="n">Stock</th><th class="n">Mínimo</th><th class="n">Sugerido</th></tr></thead><tbody>${repV.map(r=>`<tr><td>${esc(r.p.nombre)}</td><td class="n ${stockDe(r.p.id)<=0?'dn b':''}">${qtyTxt(r.p,stockDe(r.p.id))}</td><td class="n">${qtyTxt(r.p,r.p.minimo)}</td><td class="n b">${qtyTxt(r.p,r.s)}</td></tr>`).join('')}</tbody></table></div>${rep.length>repV.length?`<button class="lnk" data-act="go" data-v="compras" data-tab="pedido">y ${rep.length-repV.length} más → ver todos</button>`:''}`:vacioHtml('Nada para reponer por ahora.')}</div></div>`;
};

/* ================= VENTAS ================= */
const POSCATS=()=>cats();
VIEWS.ventas=function(){
  const t=tabs([['vender','Vender'],['historial','Historial de ventas'],['cc','Cuenta corriente']],UI.ventasTab,'tab-ventas');
  if(UI.ventasTab==='cc'){ const f=UI.f.ccv; return `${encab('Ventas','Cuenta corriente de cada cliente: lo que compró, lo que pagó y cuánto debe, como una planilla')}${t}
    <div class="filters"><label class="field">Buscar cliente<input data-bind="f.ccv.q" value="${esc(f.q)}" placeholder="Nombre, teléfono o CUIT"></label>
    <label class="field">Ver<select data-bind="f.ccv.ver">${opts([{v:'saldo',t:'Con saldo pendiente'},{v:'mov',t:'Con movimientos'},{v:'todos',t:'Todos los clientes'}],f.ver)}</select></label>
    <div class="bar" style="align-self:flex-end"><button class="btn" data-act="cobro-comp">Cargar comprobante de pago</button></div></div><div id="res"></div>`; }
  const bComp=`<button class="btn sm tabact" data-act="venta-comp">${typeof CLIP!=='undefined'?CLIP:''} Cargar venta con comprobante</button>`;
  const tb=`<div class="tabbar">${t}${bComp}</div>`;
  if(UI.ventasTab==='historial'){ const f=UI.f.hist; return `${encab('Ventas','Historial y anulaciones')}${tb}
    <div class="filters"><label class="field">Buscar<input data-bind="f.hist.q" value="${esc(f.q)}" placeholder="N°, cliente o medio de pago"></label><label class="field">Desde<input type="date" data-bind="f.hist.desde" value="${esc(f.desde)}"></label><label class="field">Hasta<input type="date" data-bind="f.hist.hasta" value="${esc(f.hasta)}"></label></div><div id="res"></div>`; }
  const f=UI.f.pos;
  return `${encab('Ventas')}${tb}
  <div class="pos"><div class="grid" style="gap:10px"><label class="field">Buscar producto<span class="srch"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10 8v8M13 8v8M16 8v8"/></svg><input id="posq" data-bind="f.pos.q" data-key="pos-enter" value="${esc(f.q)}" placeholder="Buscá por nombre o código, o escaneá el código de barras" autocomplete="off"></span></label>
   <div class="chips"><button class="chip ${f.cat===''?'on':''}" data-act="pos-cat" data-c="">Todos</button>${POSCATS().map(c=>`<button class="chip ${f.cat===c?'on':''}" data-act="pos-cat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div><div id="res"></div></div>
   <div class="card cart" id="cart"></div></div>`;
};
ACT['tab-ventas']=el=>{ UI.ventasTab=el.dataset.t; render(); };
ACT['pos-cat']=el=>{ UI.f.pos.cat=el.dataset.c; render(); };
function posLista(){ const f=UI.f.pos; const q=f.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  return S.productos.filter(p=>p.activo&&(!f.cat||p.categoria===f.cat)&&(!q||p.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)||p.codigo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)||(p.barras&&p.barras.includes(q))||(p.plu&&String(p.plu)===q))); }
FILL.ventas=function(){ const r=$('#res'); if(!r) return;
  if(UI.ventasTab==='cc'){ r.innerHTML=ccVentasHtml(); return; }
  if(UI.ventasTab==='historial'){ const f=UI.f.hist; const q=f.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
    const l=S.ventas.filter(v=>(!f.desde||v.fecha>=f.desde)&&(!f.hasta||v.fecha<=f.hasta)&&(!q||('#'+v.id).includes(q)||String(v.id)===q||cliNom(v.clienteId).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q)||v.medio.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').includes(q))).sort((a,b)=>b.id-a.id).slice(0,300);
    r.innerHTML=l.length?`<div class="tw"><table><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th class="n">Ítems</th><th>Pago</th><th class="n">Total</th><th>Estado</th></tr></thead><tbody>${l.map(v=>`<tr class="click ${v.estado==='Anulada'?'off':''}" data-act="venta-ver" data-id="${v.id}"><td>#${v.id}</td><td>${fechaTxt(v.fecha)} ${v.hora||''}</td><td>${esc(cliNom(v.clienteId))}</td><td class="n">${v.sinDetalle?pill('mute','sin detalle'):v.items.length}</td><td>${esc(v.medio)}${v.comprobante||v.operacion?` <span title="Con comprobante" style="color:var(--muted)">${typeof CLIP!=='undefined'?CLIP:''}</span>`:''}</td><td class="n b">${money(v.total)}</td><td>${v.estado==='Anulada'?pill('bad','Anulada'):pill('good','Registrada')}</td></tr>`).join('')}</tbody></table></div>`:vacioHtml('No hay ventas con esos filtros.'); return; }
  const l=posLista().slice(0,80).sort((a,b)=>(stockDe(a.id)<=0)-(stockDe(b.id)<=0)); // los agotados van al final
  r.innerHTML=l.length?`<div class="tiles">${l.map(p=>{ const s=stockDe(p.id); return s<=0
    ?`<button class="tile out" data-act="pos-add" data-id="${p.id}"><span class="bdg">Agotado</span><span class="nm">${esc(p.nombre)}</span><span class="pr">${money(p.precio)}${p.unidad==='kg'?' / kg':''}</span><span class="st">Sin stock</span></button>`
    :`<button class="tile" data-act="pos-add" data-id="${p.id}"><span class="nm">${esc(p.nombre)}</span><span class="pr">${money(p.precio)}${p.unidad==='kg'?' / kg':''}</span><span class="st ${s<=p.minimo?'lo':''}">${s<=p.minimo?'Quedan':'Stock:'} ${qtyTxt(p,s)}</span></button>`; }).join('')}</div>`:vacioHtml(S.productos.length?'No encontré productos con esa búsqueda.':'Todavía no cargaste productos.'); marcarTiles();
};
AFTER.ventas=function(){ FILL.ventas(); if(UI.ventasTab==='vender'){ renderCart(); const q=$('#posq'); if(q&&!UI.f.pos.q) q.focus(); } };
function limpiarPos(){ UI.f.pos.q=''; const i=$('#posq'); if(i){ i.value=''; FILL.ventas(); i.focus(); } }
ACT['pos-enter']=function(){ const l=posLista(); const q=UI.f.pos.q.trim(); if(!q) return;
  const exacto=l.find(p=>p.barras===q||p.codigo.toLowerCase()===q.toLowerCase());
  if(!exacto){ const e=leerEtiquetaBalanza(q); if(e){ limpiarPos(); agregarEtiqueta(e); return; } }
  if(!l.length) return; ACT['pos-add']({dataset:{id:(exacto||l[0]).id}}); limpiarPos(); };
function agregarEtiqueta(e){ // etiqueta impresa por la balanza: el producto sale del PLU y la cantidad del peso o del importe
  if(!e.p){ toast('Etiqueta de balanza con PLU '+e.plu+': no hay ningún producto con ese PLU. Cargalo en la ficha del producto.',true); return; }
  const p=e.p; if(!e.ok) toast('Ojo: el código de la etiqueta no verifica (puede estar mal leído). Revisá la cantidad.',true);
  if(p.unidad!=='kg'){ addCart(p.id,1); if(e.importe!=null){ const it=UI.cart.items.find(i=>i.productoId===p.id); if(it&&it.cant===1){ it.precio=e.importe; renderCart(); } } if(e.ok) toast('Balanza: '+p.nombre); return; }
  if(!(e.kg>0)){ toast('No pude calcular el peso de «'+p.nombre+'»'+(e.valor==='precio'?': el producto no tiene precio por kg.':'.'),true); return; }
  const q0=(UI.cart.items.find(i=>i.productoId===p.id)||{cant:0}).cant; addCart(p.id,e.kg);
  if(e.ok&&(UI.cart.items.find(i=>i.productoId===p.id)||{cant:0}).cant>q0) toast('Balanza: '+p.nombre+' · '+qtyTxt(p,e.kg)+(e.importe!=null?' · '+money2(e.importe):'')); }
ACT['pos-add']=function(el){ const p=prod(+el.dataset.id); if(!p) return; if(stockDe(p.id)<=0){ toast('«'+p.nombre+'» no tiene stock.',true); return; }
  if(p.unidad==='kg') pedirPeso(p); else addCart(p.id,1); };
function addCart(pid,cant){ const p=prod(pid); const it=UI.cart.items.find(i=>i.productoId===pid); const nueva=r3((it?it.cant:0)+cant);
  if(nueva>stockDe(pid)+1e-9){ toast('Stock insuficiente de «'+p.nombre+'»: hay '+qtyTxt(p,stockDe(pid))+'.',true); return; }
  if(it) it.cant=nueva; else UI.cart.items.push({productoId:pid,cant:r3(cant),precio:p.precio}); renderCart(); }
function pedirPeso(p){ abrir('Peso de '+p.nombre,`<p class="sm muted" style="margin-top:0">Precio ${money(p.precio)} por kg. Stock: ${qtyTxt(p,stockDe(p.id))}.</p><div class="chips" style="margin-bottom:12px">${[100,150,200,250,300,500,1000].map(g=>`<button class="chip" data-act="peso-ok" data-g="${g}" data-id="${p.id}">${g>=1000?'1 kg':g+' g'}</button>`).join('')}</div>
  <label class="field">Otro peso en gramos<input id="peso" inputmode="decimal" data-key="peso-enter" data-id="${p.id}" placeholder="Por ejemplo 350"></label>`,{foot:`<button class="btn" data-act="cerrar">Cancelar</button><button class="btn pri" data-act="peso-ok" data-id="${p.id}" data-g="">Agregar</button>`}); }
ACT['peso-enter']=el=>ACT['peso-ok']({dataset:{id:el.dataset.id,g:''}});
ACT['peso-ok']=function(el){ let g=el.dataset.g; if(g==='') { const v=num($('#peso').value); if(!v||v<=0){ toast('Ingresá el peso en gramos.',true); return; } g=v; } cerrar(); addCart(+el.dataset.id,r3(+g/1000)); };
const SVG=d=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PAYI={'Efectivo':SVG('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>'),
  'Transferencia':SVG('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>'),
  'Débito':SVG('<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19M6.5 15h4"/>'),
  'Crédito':SVG('<rect x="5.5" y="8.5" width="16" height="11" rx="2"/><path d="M5.5 12.5h16M2.5 15.5V7a2 2 0 0 1 2-2h12"/>'),
  'Mercado Pago':SVG('<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><path d="M14 14h2.5v2.5M20.5 14v.01M14 20.5h.01M17.5 20.5h3v-3"/>'),
  'Cuenta corriente':SVG('<path d="M5.5 3.5h10.5a2 2 0 0 1 2 2v15l-3-1.8-3 1.8-3-1.8-3 1.8V5.5a2 2 0 0 1 2-2z"/><path d="M8.5 8.5h6M8.5 12h6"/>')};
const CARTI=SVG('<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.4-1.1L21 8H6.2"/>');
const TRASH=SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>');
function lineaCart(it,i){ const p=prod(it.productoId); const kg=p.unidad==='kg';
  // el precio se muestra como texto y se vuelve editable al tocarlo
  const precio=UI.cart.editP===i?`<input class="cq" data-chg="cart-price" data-i="${i}" value="${fnum(it.precio)}" inputmode="decimal" aria-label="Precio unitario" autofocus>`
    :`<button class="pe" data-act="cart-pedit" data-i="${i}" title="Cambiar precio">${money(it.precio)}</button>`;
  const cant=kg?`<span class="kgq"><input data-chg="cart-qty" data-i="${i}" value="${fnum(it.cant)}" inputmode="decimal" aria-label="Cantidad en kg"><span>kg</span></span>`
    :`<span class="stp"><button data-act="cart-step" data-i="${i}" data-d="-1" aria-label="Restar uno">−</button><b>${it.cant}</b><button data-act="cart-step" data-i="${i}" data-d="1" aria-label="Sumar uno">+</button></span>`;
  return `<div class="line"><b class="lnm">${esc(p.nombre)}</b><b class="lst">${moneyA(it.cant*it.precio)}</b>
   <span class="lpr">${kg?qtyTxt(p,it.cant):it.cant} × ${precio}${kg?' / kg':''}</span><span class="lq">${cant}<button class="del" data-act="cart-del" data-i="${i}" aria-label="Quitar">${TRASH}</button></span></div>`; }
// marca en las tarjetas cuánto de cada producto hay en la venta actual
function marcarTiles(){ const m={}; UI.cart.items.forEach(i=>m[i.productoId]=i.cant);
  document.querySelectorAll('.tiles .tile').forEach(t=>{ const id=+t.dataset.id, c=m[id]; let q=t.querySelector('.qn');
    if(c){ const p=prod(id), txt=p.unidad==='kg'?qtyTxt(p,c):String(c); t.classList.add('inc'); t.title='Clic: agregar · Clic derecho: quitar';
      if(!q){ q=document.createElement('span'); q.className='qn'; t.appendChild(q); } if(q.textContent!==txt) q.textContent=txt; }
    else { t.classList.remove('inc'); t.removeAttribute('title'); if(q) q.remove(); } }); }
// clic derecho en una tarjeta: resta una unidad (los productos por peso se quitan enteros)
function quitarCart(pid){ const i=UI.cart.items.findIndex(x=>x.productoId===pid); if(i<0) return; const it=UI.cart.items[i];
  if(prod(pid).unidad==='kg'||it.cant<=1) UI.cart.items.splice(i,1); else it.cant=r3(it.cant-1); renderCart(); }
document.addEventListener('contextmenu',e=>{ const t=e.target.closest('.tiles .tile'); if(!t) return; e.preventDefault(); quitarCart(+t.dataset.id); });
function renderCart(){ const c=$('#cart'); if(!c) return; const C=UI.cart; const t=totalesVenta(C.items,num(C.descPct)||0); const n=C.items.length;
  const vuelto=C.medio==='Efectivo'&&num(C.recibido)>=t.total&&t.total>0?r2(num(C.recibido)-t.total):null;
  c.innerHTML=`<div class="chead"><h2>Venta <span class="vnum">#${(S.seq.V||0)+1}</span>${n?`<span class="cnt">${n}</span>`:''}</h2>${n?'<button class="btn sm ghost vac" data-act="cart-clear">Vaciar</button>':''}</div>
  ${n?`<div class="clist">${C.items.map(lineaCart).join('')}</div>`:`<div class="empty cvac">${CARTI}Sin productos</div>`}
  <div class="frm" style="margin-top:10px"><label class="field">Cliente<select data-chg="cart-cli"><option value="">Consumidor final</option>${S.clientes.map(x=>`<option value="${x.id}" ${sel(C.clienteId,x.id)}>${esc(x.nombre)}</option>`).join('')}</select></label>
   <label class="field">Descuento %<input data-chg="cart-desc" value="${esc(C.descPct)}" inputmode="decimal" placeholder="0"></label></div>
  <div class="pay" role="group" aria-label="Medio de pago">${MEDIOS.map(m=>`<button class="btn ${C.medio===m?'on':''}" data-act="cart-medio" data-m="${m}">${PAYI[m]||''}<span>${m==='Cuenta corriente'?'Cta. cte.':m}</span></button>`).join('')}</div>
  ${C.comp?`<div class="cartcomp"><div class="cc1">${typeof CLIP!=='undefined'?CLIP:''}<b>${esc(C.comp.file?C.comp.file.name:'Comprobante')}</b><button class="btn sm ghost" data-act="cart-comp-del" aria-label="Quitar comprobante">✕</button></div>
    <div class="cc2"><span>${moneyA(C.comp.monto)}${C.comp.datos&&C.comp.datos.nombre?' · '+esc(C.comp.datos.nombre):''}</span>${Math.abs(C.comp.monto-t.total)<0.005?pill('good','Coincide con el total'):pill('warn','No coincide: la venta suma '+moneyA(t.total))}</div></div>`
    :n&&(C.medio==='Transferencia'||C.medio==='Mercado Pago')?`<button class="btn sm ghost" style="margin-top:2px" data-act="cart-comp">${typeof CLIP!=='undefined'?CLIP:''} Adjuntar comprobante de pago</button>`:''}
  ${C.medio==='Efectivo'&&n?`<label class="field" style="margin-top:4px">Recibido en efectivo<input data-live="cart-rec" value="${esc(C.recibido)}" inputmode="decimal" placeholder="Opcional, para calcular el vuelto"></label>`:''}
  ${t.desc>0?`<div class="sm muted" style="display:flex;justify-content:space-between;margin-top:8px"><span>Subtotal</span><span>${moneyA(t.sub)}</span></div><div class="sm muted" style="display:flex;justify-content:space-between"><span>Descuento</span><span>− ${moneyA(t.desc)}</span></div>`:''}
  <div class="total"><span>Total</span><span>${moneyA(t.total)}</span></div>
  <div id="vuelto" class="vlt">${vuelto!=null?vueltoHtml(vuelto):''}</div>
  <button class="btn pri" style="width:100%;justify-content:center;margin-top:10px;padding:12px;font-size:16px" data-act="cobrar" ${n?'':'disabled'}>Cobrar ${n?moneyA(t.total):''}</button>`; marcarTiles();
  if(C.editP!=null){ const e=c.querySelector('.cq'); if(e){ e.focus(); e.select(); } } }
const vueltoHtml=v=>`<span>Vuelto</span><b>${moneyA(v)}</b>`;
LIVE['cart-rec']=el=>{ UI.cart.recibido=el.value; const t=totalesVenta(UI.cart.items,num(UI.cart.descPct)||0); const r=num(el.value); const v=$('#vuelto'); if(v) v.innerHTML=r!=null&&r>=t.total&&t.total>0?vueltoHtml(r2(r-t.total)):''; };
CHG['cart-qty']=el=>{ const i=+el.dataset.i,it=UI.cart.items[i]; const v=num(el.value); const p=prod(it.productoId);
  if(v==null||v<=0){ UI.cart.items.splice(i,1); } else if(v>stockDe(p.id)+1e-9){ toast('Stock insuficiente: hay '+qtyTxt(p,stockDe(p.id))+'.',true); } else it.cant=p.unidad==='kg'?r3(v):Math.round(v); renderCart(); };
CHG['cart-price']=el=>{ const v=num(el.value); if(v==null||v<0){ toast('Precio inválido.',true); } else UI.cart.items[+el.dataset.i].precio=v; UI.cart.editP=null; renderCart(); };
ACT['cart-pedit']=el=>{ UI.cart.editP=+el.dataset.i; renderCart(); };
ACT['cart-step']=el=>{ const i=+el.dataset.i, it=UI.cart.items[i]; if(!it) return; if(+el.dataset.d>0) addCart(it.productoId,1); else quitarCart(it.productoId); };
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&UI.cart&&UI.cart.editP!=null&&e.target.classList.contains('cq')){ UI.cart.editP=null; renderCart(); } });
CHG['cart-cli']=el=>{ UI.cart.clienteId=el.value; };
CHG['cart-desc']=el=>{ const v=num(el.value); if(el.value.trim()!==''&&(v==null||v<0||v>100)){ toast('El descuento tiene que estar entre 0 y 100.',true); UI.cart.descPct=''; } else UI.cart.descPct=el.value.trim(); renderCart(); };
ACT['cart-del']=el=>{ UI.cart.items.splice(+el.dataset.i,1); UI.cart.editP=null; renderCart(); };
ACT['cart-clear']=()=>{ const n=UI.cart.items.length; confirmar(`¿Vaciar la venta? Se ${n===1?'quita el producto cargado':'quitan los '+n+' productos cargados'}.`,()=>{ UI.cart.items=[]; UI.cart.recibido=''; UI.cart.descPct=''; UI.cart.comp=null; UI.cart.editP=null; renderCart(); },'Vaciar'); };
ACT['cart-medio']=el=>{ UI.cart.medio=el.dataset.m; renderCart(); };
ACT.cobrar=function(){ const C=UI.cart; if(!C.items.length) return;
  if(C.medio==='Cuenta corriente'&&!C.clienteId){ toast('Para vender en cuenta corriente elegí un cliente.',true); return; }
  if(C.comp){ const dup=dupDe(C.comp.operacion,C.comp.hash); if(dup.op||dup.hash){ toast('Ese comprobante ya se usó en '+dupTxt(dup.op||dup.hash)+'. Quitalo o subí otro.',true); return; } }
  const v=crearVenta({items:C.items.map(i=>({productoId:i.productoId,cant:i.cant,precio:i.precio})),clienteId:C.clienteId?+C.clienteId:null,medio:C.medio,descPct:num(C.descPct)||0,recibido:C.medio==='Efectivo'?num(C.recibido):null,fecha:C.fecha||undefined});
  const comp=C.comp; UI.cart={items:[],clienteId:'',medio:'Efectivo',recibido:'',descPct:''}; indexar(); const nav=$('#nav'); if(nav) nav.innerHTML=navHtml(); FILL.ventas(); renderCart();
  if(comp) adjuntarAVenta(v,comp).then(()=>{ verTicket(v,true); toast('Venta #'+v.id+' registrada con comprobante'); }); else verTicket(v,true); };
function ticketTxt(v){ const w=36; const L=[S.config.nombre.toUpperCase()+(S.config.sub?' · '+S.config.sub:''),'Venta #'+v.id+'   '+fechaTxt(v.fecha)+' '+(v.hora||''),'Cliente: '+cliNom(v.clienteId),'-'.repeat(w)];
  v.items.forEach(i=>{ const p=prod(i.productoId)||{unidad:i.unidad}; L.push(i.nombre); L.push('  '+qtyTxt(p,i.cant)+' x '+money2(i.precio)+(i.unidad==='kg'?'/kg':'')+'  = '+money2(i.cant*i.precio)); });
  L.push('-'.repeat(w)); if(v.desc>0){ L.push('Subtotal: '+money2(v.sub)); L.push('Descuento '+fmt(v.descPct,0)+'%: -'+money2(v.desc)); }
  L.push('TOTAL: '+money2(v.total)); if(v.operacion) L.push('Operación N° '+v.operacion); L.push('Pago: '+v.medio+(v.recibido&&v.medio==='Efectivo'?' (recibido '+money2(v.recibido)+(v.recibido>=v.total?', vuelto '+money2(r2(v.recibido-v.total)):'')+')':'')); if(v.estado==='Anulada') L.push('*** VENTA ANULADA ***'); L.push('','¡Gracias por su compra!'); return L.join('\n'); }
function verTicket(v,nuevo){ const cl=IDX.cli[v.clienteId]; const link=cl?wa(cl.telefono,ticketTxt(v)):'';
  abrir((nuevo?'Venta registrada · ':'Venta ')+'#'+v.id,`<pre class="ticket">${esc(ticketTxt(v))}</pre>`,{foot:`${!nuevo&&v.estado!=='Anulada'?`<button class="btn bad" data-act="venta-anular" data-id="${v.id}">Anular venta</button>`:''}${link?`<a class="btn" href="${link}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`:''}${v.comprobante?`<button class="btn" data-act="adj-ver" data-id="${esc(v.comprobante.id)}">Ver comprobante</button>`:''}<button class="btn" id="prt">Imprimir</button><button class="btn" id="cpt">Copiar ticket</button><button class="btn pri" data-act="cerrar">${nuevo?'Nueva venta':'Cerrar'}</button>`}); $('#cpt').onclick=()=>copiar(ticketTxt(v),'Ticket copiado'); $('#prt').onclick=()=>imprimirTicket(v); }
function imprimirTicket(v){ try{ const f=document.createElement('iframe'); f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f); const d=f.contentWindow.document; d.open(); d.write('<html><head><style>@page{margin:4mm}body{font:12px/1.35 ui-monospace,Consolas,monospace;width:72mm;margin:0}pre{white-space:pre-wrap;margin:0}</style></head><body><pre>'+esc(ticketTxt(v))+'</pre></body></html>'); d.close(); setTimeout(()=>{ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(e){ toast('Este navegador no permite imprimir desde acá. Copiá el ticket.',true); } setTimeout(()=>f.remove(),1500); },150); }catch(e){ toast('No se pudo imprimir. Copiá el ticket.',true); } }
ACT['venta-ver']=el=>{ const v=S.ventas.find(x=>x.id===+el.dataset.id); if(v) verTicket(v,false); };
ACT['venta-anular']=el=>{ const id=+el.dataset.id; confirmar('¿Anular la venta #'+id+'? Se devuelve el stock y deja de contar en los totales y en la caja.',()=>{ anularVenta(id); toast('Venta anulada'); refrescar(); },'Anular venta'); };

/* ================= CAJA ================= */
VIEWS.caja=function(){
  const f=UI.caja.fecha||(UI.caja.fecha=hoy()); const r=resumenCaja(f); const efectivoTotal=r.por['Efectivo'];
  const cj=r.cierre; const hist=S.cajas.slice().sort((a,b)=>a.fecha<b.fecha?1:-1).slice(0,8);
  return `${encab('Caja','Resumen del día y cierre de caja',`<label class="field inline">Día <input type="date" id="cjf" value="${f}" data-chg="caja-fecha"></label>`)}
  <div class="kpis"><div class="kpi"><div class="k">Ventas del día</div><div class="v">${money(r.totalVentas)}</div><div class="d">${r.vs.length} venta${r.vs.length===1?'':'s'}</div></div>
   <div class="kpi"><div class="k">Efectivo esperado</div><div class="v">${money(r.esperado)}</div><div class="d">lo que debería haber en el cajón</div></div>
   <div class="kpi ${cj?(cj.dif===0?'good':'bad'):''}"><div class="k">${cj?'Diferencia del cierre':'Cierre'}</div><div class="v">${cj?money(cj.dif):'Abierta'}</div><div class="d">${cj?'contado '+money(cj.contado):'todavía sin cerrar'}</div></div></div>
  <div class="grid g2"><div class="card"><h2>Ventas por medio de pago</h2><div class="tw"><table><tbody>${MEDIOS.map(m=>`<tr><td>${m}</td><td class="n">${money(r.por[m])}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td class="n">${money(r.totalVentas)}</td></tr></tbody></table></div>
   <p class="sm muted">La cuenta corriente es plata que todavía no entró. No suma al efectivo.</p></div>
   <div class="card"><h2>Movimiento de efectivo</h2><div class="tw"><table><tbody>
    <tr><td>Apertura</td><td class="n">${money(r.apertura)}</td></tr><tr><td>Ventas en efectivo</td><td class="n">${money(efectivoTotal)}</td></tr><tr><td>Cobros de cuenta corriente en efectivo</td><td class="n">${money(r.cobEf)}</td></tr>
    <tr><td>Ingresos manuales</td><td class="n">${money(r.ing)}</td></tr><tr><td>Retiros</td><td class="n">− ${money(r.ret)}</td></tr><tr><td>Gastos pagados en efectivo</td><td class="n">− ${money(r.gEf)}</td></tr><tr><td>Compras pagadas en efectivo</td><td class="n">− ${money(r.cEf)}</td></tr>
    <tr class="tot"><td>Efectivo esperado</td><td class="n">${money(r.esperado)}</td></tr></tbody></table></div>
    <div class="bar" style="margin-top:10px"><button class="btn" data-act="caja-mov" data-t="Retiro">Registrar retiro</button><button class="btn" data-act="caja-mov" data-t="Ingreso">Registrar ingreso</button></div>
    ${r.movs.length?`<div class="sm muted" style="margin-top:8px">${r.movs.map(m=>`${m.tipo}: ${money(m.monto)} · ${esc(m.motivo||'')}`).join('<br>')}</div>`:''}</div></div>
  <div class="card"><h2>${cj?'Cierre guardado':'Cerrar caja'}</h2><div class="frm"><label class="field">Efectivo con el que se abrió<input id="cj_ap" value="${fnum(r.apertura)}" inputmode="decimal"></label>
   <label class="field">Efectivo contado ahora<input id="cj_con" value="${cj?fnum(cj.contado):''}" inputmode="decimal" placeholder="Contá el cajón" data-live="caja-dif"></label>
   <label class="field full">Notas<input id="cj_nota" value="${esc(cj?cj.notas:'')}" placeholder="Opcional"></label></div>
   <div class="sm" id="cj_dif" style="margin-top:8px"></div><div class="bar" style="margin-top:10px"><button class="btn pri" data-act="caja-cerrar">${cj?'Actualizar cierre':'Cerrar caja'}</button></div></div>
  ${hist.length?`<div class="card"><h2>Últimos cierres</h2><div class="tw"><table><thead><tr><th>Día</th><th class="n">Apertura</th><th class="n">Esperado</th><th class="n">Contado</th><th class="n">Diferencia</th><th>Notas</th></tr></thead><tbody>${hist.map(c=>`<tr><td>${fechaTxt(c.fecha)}</td><td class="n">${money(c.apertura)}</td><td class="n">${money(c.esperado)}</td><td class="n">${money(c.contado)}</td><td class="n ${c.dif<0?'dn':c.dif>0?'up':''} b">${money(c.dif)}</td><td>${esc(c.notas||'')}</td></tr>`).join('')}</tbody></table></div></div>`:''}`;
};
CHG['caja-fecha']=el=>{ if(el.value){ UI.caja.fecha=el.value; render(); } };
LIVE['caja-dif']=el=>{ const f=UI.caja.fecha; const r=resumenCaja(f); const ap=num($('#cj_ap').value)||0; const esp=r2(r.esperado-r.apertura+ap); const c=num(el.value); const d=$('#cj_dif'); if(!d) return;
  d.innerHTML=c==null?'':(Math.abs(c-esp)<0.005?'<span class="up b">La caja cierra justa.</span>':`Diferencia: <b class="${c<esp?'dn':'up'}">${money2(r2(c-esp))}</b> ${c<esp?'(falta plata)':'(sobra plata)'}`); };
ACT['caja-cerrar']=function(){ const f=UI.caja.fecha; const r=resumenCaja(f); const ap=num($('#cj_ap').value); const con=num($('#cj_con').value);
  if(ap==null||con==null){ toast('Completá la apertura y el efectivo contado.',true); return; }
  const esp=r2(r.esperado-r.apertura+ap); const reg={fecha:f,apertura:ap,esperado:esp,contado:con,dif:r2(con-esp),notas:$('#cj_nota').value.trim()};
  const i=S.cajas.findIndex(c=>c.fecha===f); if(i>=0) S.cajas[i]=reg; else S.cajas.push(reg); guardar(); toast('Caja cerrada'); render(); };
ACT['caja-mov']=function(el){ const t=el.dataset.t; formModal(t==='Retiro'?'Registrar retiro':'Registrar ingreso',[{n:'monto',l:'Monto ($)',t:'num',req:true,min:0.01},{n:'motivo',l:'Motivo',t:'text',full:true,ph:t==='Retiro'?'Ej: retiro del dueño, pago a proveedor':'Ej: cambio inicial'}],{},d=>{ S.cajaMov.push({id:sig('W'),fecha:UI.caja.fecha,tipo:t,monto:d.monto,motivo:d.motivo}); guardar(); cerrar(); render(); }); };
AFTER.caja=function(){ const c=$('#cj_con'); if(c&&c.value) LIVE['caja-dif'](c); };
