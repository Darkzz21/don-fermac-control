/* Celular: barra de secciones abajo, menú lateral con todas las secciones, tablas como tarjetas
   y barra con el total de la venta. Todo se arma sobre lo que ya dibujan las pantallas, sin cambiarlas. */
'use strict';
const MOV=matchMedia('(max-width:860px)');
const BNAV=[['panel','Panel'],['ventas','Ventas'],['caja','Caja'],['productos','Productos']];
const ICO_MENU='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const navIco=k=>{ const n=NAV.find(x=>x[0]===k); return n?`<svg viewBox="0 0 24 24" aria-hidden="true">${n[2]}</svg>`:''; };

function menuAbrir(on){ document.body.classList.toggle('menu-on',on); const b=$('#mbtn'); if(b) b.setAttribute('aria-expanded',on?'true':'false'); }
ACT['menu-mov']=()=>menuAbrir(!document.body.classList.contains('menu-on'));
document.addEventListener('click',e=>{ if(!document.body.classList.contains('menu-on')) return;
  if(e.target.closest('#side .nav a')||e.target.id==='mvelo') menuAbrir(false); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') menuAbrir(false); });
window.addEventListener('hashchange',()=>menuAbrir(false));

function bnavHtml(){ const c=conteos(), enMenu=!BNAV.some(([k])=>k===UI.vista);
  return BNAV.map(([k,t])=>`<a href="#${k}" class="${UI.vista===k?'on':''}" ${UI.vista===k?'aria-current="page"':''}>${navIco(k)}<span>${t}</span>${c[k]?`<i>${c[k]}</i>`:''}</a>`).join('')
    +`<button type="button" data-act="menu-mov" class="${enMenu?'on':''}" aria-label="Todas las secciones">${ICO_MENU}<span>${enMenu?(NAV.find(x=>x[0]===UI.vista)||[,'Más'])[1]:'Más'}</span>${c.inventario?`<i>${c.inventario}</i>`:''}</button>`; }

// las tablas con encabezado pasan a tarjetas: cada celda lleva el nombre de su columna
function tablasATarjetas(root){ root.querySelectorAll('.tw > table:not(.tcards)').forEach(t=>{ if(t.closest('.ccl')) return;
  const th=[...t.querySelectorAll('thead th')].map(x=>x.textContent.trim()); if(!th.length) return; t.classList.add('tcards');
  t.querySelectorAll('tbody tr, tfoot tr').forEach(tr=>{ let i=0; [...tr.children].forEach(td=>{ const n=+td.getAttribute('colspan')||1; if(!td.hasAttribute('data-l')) td.setAttribute('data-l',th[i]||''); i+=n; }); }); }); }

function barraVenta(){ let b=$('#cartbar'); const ver=UI.vista==='ventas'&&UI.ventasTab==='vender'&&UI.cart.items.length&&$('#cart');
  if(!ver){ if(b) b.remove(); document.body.classList.remove('con-cbar'); return; }
  const n=UI.cart.items.length, t=totalesVenta(UI.cart.items,num(UI.cart.descPct)||0).total;
  if(!b){ b=document.createElement('button'); b.id='cartbar'; b.type='button'; b.className='cartbar'; b.onclick=()=>{ const c=$('#cart'); if(c) c.scrollIntoView({behavior:'smooth',block:'start'}); }; document.body.appendChild(b); }
  const h=`<span><b>${n}</b> producto${n>1?'s':''}</span><b class="ct">${money2(t)}</b><span class="cv">Ver venta ›</span>`; if(b._h!==h){ b._h=h; b.innerHTML=h; } document.body.classList.add('con-cbar'); }

let _mraf=0;
function movilSync(){ _mraf=0; if(!S) return;
  const side=$('#side'); if(side&&!$('#mbtn')){ side.insertAdjacentHTML('beforeend',`<button type="button" class="mbtn" id="mbtn" data-act="menu-mov" aria-label="Abrir el menú" aria-expanded="false">${ICO_MENU}</button>`); }
  if(side&&!$('#mvelo')) document.body.insertAdjacentHTML('beforeend','<div class="mvelo" id="mvelo"></div>');
  let bn=$('#bnav'); if(!bn){ bn=document.createElement('nav'); bn.id='bnav'; bn.className='bnav'; bn.setAttribute('aria-label','Secciones principales'); document.body.appendChild(bn); }
  const h=bnavHtml(); if(bn._h!==h){ bn._h=h; bn.innerHTML=h; }
  tablasATarjetas(document); barraVenta(); }
new MutationObserver(()=>{ if(!_mraf) _mraf=requestAnimationFrame(movilSync); }).observe(document.body,{childList:true,subtree:true});
document.addEventListener('DOMContentLoaded',()=>setTimeout(movilSync,0));
// en la cuenta corriente, al tocar un cliente se baja a su detalle (en el celular queda debajo de la lista)
document.addEventListener('click',e=>{ if(!MOV.matches||!e.target.closest('[data-act="ccv-sel"]')) return;
  setTimeout(()=>{ const d=$('#ccdet'); if(d&&d.firstElementChild) d.scrollIntoView({behavior:'smooth',block:'start'}); },60); });
