/* Archivos por cliente: facturas, remitos, contratos o cualquier PDF/foto. Los archivos se guardan en el
   dispositivo (IndexedDB, igual que los comprobantes) y en los datos queda la ficha de cada uno. */
'use strict';
const CATS_ARCH=['Factura','Remito','Presupuesto','Contrato','Comprobante de pago','Otro'];
const adjBorrar=id=>adjTx('readwrite',st=>st.delete(id));
const tamTxt=b=>!b?'':b>=1e6?fmt(b/1e6,1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
const tipoArch=(t,n)=>/^image\//.test(t||'')||/\.(jpe?g|png|webp|gif|heic)$/i.test(n||'')?'Imagen':/pdf/.test(t||'')||/\.pdf$/i.test(n||'')?'PDF':/sheet|excel|csv/.test(t||'')||/\.(xlsx?|csv)$/i.test(n||'')?'Excel':/word|document/.test(t||'')||/\.docx?$/i.test(n||'')?'Word':'Archivo';
// archivos subidos + comprobantes de los cobros, del más nuevo al más viejo
function archivosDe(cid){ const a=(S.archivos||[]).filter(x=>x.clienteId===cid).map(x=>Object.assign({},x,{origen:'archivo'}));
  const c=S.cobros.filter(x=>x.clienteId===cid&&x.comprobante).map(x=>({id:'c'+x.id,adjId:x.comprobante.id,nombre:x.comprobante.nombre,tipo:x.comprobante.tipo,categoria:'Comprobante de pago',descripcion:'Pago de '+money2(x.monto)+(x.operacion?' · Op. '+x.operacion:''),fecha:x.fecha,origen:'cobro'}));
  return a.concat(c).sort((p,q)=>p.fecha<q.fecha?1:p.fecha>q.fecha?-1:0); }
function archivosHtml(cid){ const L=archivosDe(cid);
  return `<div class="cchead" style="margin-top:18px"><h2 style="font-size:20px;margin:0">Archivos${L.length?' <span class="sm muted">('+L.length+')</span>':''}</h2><div class="bar"><button class="btn sm" data-act="arch-subir" data-id="${cid}">${CLIP} Subir archivos</button></div></div>
  ${L.length?`<div class="tw"><table><tbody>${L.map(a=>`<tr><td style="white-space:nowrap">${fechaTxt(a.fecha)}</td><td><b>${esc(a.nombre)}</b>${a.descripcion?`<div class="sm muted">${esc(a.descripcion)}</div>`:''}</td>
    <td>${pill(a.origen==='cobro'?'good':'info',a.categoria||'Otro')} <span class="sm muted">${tipoArch(a.tipo,a.nombre)}${a.tam?' · '+tamTxt(a.tam):''}</span></td>
    <td class="n" style="white-space:nowrap"><button class="btn sm ghost" data-act="adj-ver" data-id="${esc(a.adjId)}">Ver</button>${a.origen==='archivo'?`<button class="btn sm ghost" data-act="arch-del" data-id="${esc(a.id)}" data-cli="${cid}" title="Borrar archivo" aria-label="Borrar archivo">✕</button>`:''}</td></tr>`).join('')}</tbody></table></div>`
  :vacioHtml('Todavía no hay archivos. Podés subir facturas, remitos, contratos o cualquier PDF o foto.')}`; }

let ARCH=null;
ACT['arch-subir']=el=>{ const cid=+el.dataset.id, c=IDX.cli[cid]; if(!c) return; ARCH={cid,files:[]};
  abrir('Subir archivos · '+c.nombre,`<div class="comp" id="archz"><input type="file" id="archf" multiple hidden><button class="btn" type="button" id="archb">${CLIP} Elegir archivos</button>
    <span class="sm muted" id="archst">PDF, fotos, Word, Excel… Podés elegir varios a la vez, arrastrarlos acá o pegar una captura con Ctrl+V. Máximo 25 MB cada uno.</span><div id="archl" style="width:100%"></div></div>
    <form id="frm" class="frm" autocomplete="off"><label class="field">Tipo de archivo<select name="categoria">${opts(CATS_ARCH,'Factura')}</select></label><label class="field">Fecha<input type="date" name="fecha" value="${hoy()}"></label>
    <label class="field full">Descripción (opcional)<input name="descripcion" placeholder="Ej. Factura A 0001-00001234 · Remito de octubre"></label></form><div id="err" class="sm dn" style="margin-top:8px" role="alert"></div>`,
    {noFocus:true,foot:`<button class="btn" data-act="cerrar" type="button">Cancelar</button><button class="btn pri" id="archok" type="button" disabled>Guardar</button>`});
  const z=$('#archz'), inp=$('#archf'); $('#archb').onclick=()=>inp.click(); inp.onchange=()=>{ archAgregar([...inp.files]); inp.value=''; };
  z.ondragover=e=>{ e.preventDefault(); z.classList.add('drag'); }; z.ondragleave=()=>z.classList.remove('drag'); z.ondrop=e=>{ e.preventDefault(); z.classList.remove('drag'); archAgregar([...e.dataTransfer.files]); };
  $('#archok').onclick=guardarArchivos; $('#frm').addEventListener('submit',e=>e.preventDefault()); inp.click(); };
document.addEventListener('paste',e=>{ if(!$('#archz')||!ARCH) return; const fs=[...(e.clipboardData&&e.clipboardData.items||[])].filter(x=>x.kind==='file').map(x=>x.getAsFile()).filter(Boolean); if(!fs.length) return;
  e.preventDefault(); archAgregar(fs.map(b=>b.name&&b.name!=='image.png'?b:new File([b],'captura-'+hoy()+'.'+((b.type.split('/')[1]||'png').replace('jpeg','jpg')),{type:b.type}))); });
function archAgregar(fs){ for(const f of fs){ if(f.size>25e6){ toast('«'+f.name+'» supera los 25 MB.',true); continue; } if(!f.size){ toast('«'+f.name+'» está vacío.',true); continue; } ARCH.files.push(f); } archPintar(); }
function archPintar(){ const l=$('#archl'),b=$('#archok'); if(!l||!b) return; l.innerHTML=ARCH.files.map((f,i)=>`<div class="archi"><span><b>${esc(f.name)}</b> <span class="sm muted">${tipoArch(f.type,f.name)} · ${tamTxt(f.size)}</span></span><button class="btn sm ghost" type="button" data-act="arch-quitar" data-i="${i}" aria-label="Quitar">✕</button></div>`).join('');
  b.disabled=!ARCH.files.length; b.textContent=ARCH.files.length>1?'Guardar '+ARCH.files.length+' archivos':'Guardar'; }
ACT['arch-quitar']=el=>{ ARCH.files.splice(+el.dataset.i,1); archPintar(); };
async function guardarArchivos(){ const f=$('#frm').elements, b=$('#archok'), cid=ARCH.cid, lista=ARCH.files.slice(); if(!lista.length) return; b.disabled=true; b.textContent='Guardando…';
  if(!Array.isArray(S.archivos)) S.archivos=[]; let ok=0;
  try{ for(let file of lista){ if(esHeicF(file)){ try{ file=await aJPG(file); }catch(e){} } // las fotos de iPhone se guardan como JPG para poder verlas
      const adjId=await adjGuardar(file); S.archivos.push({id:'F'+uid(),clienteId:cid,adjId,nombre:file.name,tipo:file.type||'',tam:file.size,categoria:f.categoria.value,descripcion:f.descripcion.value.trim(),fecha:f.fecha.value||hoy()}); ok++; } }
  catch(e){ const er=$('#err'); if(er) er.textContent='No se pudo guardar '+(ok?'el resto de los archivos':'el archivo')+': '+(e&&e.message||e)+'.'; }
  if(ok){ guardar(); refrescar(); volverCC(cid); toast(ok===1?'Archivo guardado':ok+' archivos guardados'); } else { b.disabled=false; b.textContent='Guardar'; } }
ACT['arch-del']=el=>{ const id=el.dataset.id, cid=+el.dataset.cli, a=(S.archivos||[]).find(x=>x.id===id); if(!a) return;
  confirmar('¿Borrar «'+esc(a.nombre)+'»? Se elimina de este dispositivo y no se puede recuperar.',()=>{ S.archivos=S.archivos.filter(x=>x.id!==id); guardar(); adjBorrar(a.adjId).catch(()=>{}); refrescar(); volverCC(cid); toast('Archivo borrado'); },'Borrar'); };
