/* Núcleo: estado, persistencia y reglas de negocio (stock por movimientos, lotes FEFO, ventas, compras, caja). */
'use strict';
const LS_KEY='stockapp_v1';
const MEDIOS=['Efectivo','Transferencia','Débito','Crédito','Mercado Pago','Cuenta corriente'];
const RUBROS={
  'Fiambrería / Delicatessen':{venc:true,peso:true,cats:['Fiambres','Quesos','Encurtidos','Frutos secos','Panificados','Bebidas','Almacén']},
  'Almacén / Kiosco':{venc:true,peso:false,cats:['Almacén','Bebidas','Golosinas','Limpieza','Lácteos']},
  'Verdulería / Dietética':{venc:true,peso:true,cats:['Verdura','Fruta','Granos','Frutos secos','Suplementos']},
  'Ferretería / Librería / Otro':{venc:false,peso:false,cats:['General']}
};
let S=null;           // estado
const IDX={stock:{},prod:{},prov:{},cli:{}};

/* ---------- utilidades ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const r2=n=>Math.round((n+Number.EPSILON)*100)/100;
const r3=n=>Math.round((n+Number.EPSILON)*1000)/1000;
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const hoy=()=>ymd(new Date());
const addDias=(f,n)=>{const d=new Date(f+'T12:00:00');d.setDate(d.getDate()+n);return ymd(d)};
const difDias=(a,b)=>Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/864e5);
const fechaTxt=f=>f?f.slice(8,10)+'/'+f.slice(5,7)+'/'+f.slice(0,4):'—';
const fechaCorta=f=>f?f.slice(8,10)+'/'+f.slice(5,7):'';
const fmt=(n,d=2)=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
const money=n=>(S?S.config.moneda:'$')+' '+fmt(n,0);
const money2=n=>(S?S.config.moneda:'$')+' '+fmt(n,2);
// muestra centavos solo cuando el monto los tiene (ej. $ 5.075 o $ 5.075,50)
const moneyA=n=>Math.abs(n-Math.round(n))<0.005?money(n):money2(n);
// lee números escritos a la argentina: "1.500" = 1500, "1.500,5" = 1500,5, "0,25" = 0,25.
// Un punto solo es separador de miles si el número no empieza con 0 ("0.250" = 0,25).
const num=(s)=>{ if(typeof s==='number') return s; let t=String(s==null?'':s).trim().replace(/[$%\s]/g,''); if(!t) return null;
  if(t.includes(',')) t=t.replace(/\./g,'').replace(',','.'); else if(/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t=t.replace(/\./g,'');
  if(!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null; const v=parseFloat(t); return isNaN(v)?null:v; };
// para cantidades en kg: un punto solo es la coma decimal ("1.250" kg = 1,25 kg, nunca 1250 kg)
const numKg=s=>{ const t=typeof s==='string'?s.trim():s; return typeof t==='string'&&!t.includes(',')&&(t.match(/\./g)||[]).length===1?num(t.replace('.',',')):num(t); };
const numCant=(p,s)=>p&&p.unidad==='kg'?numKg(s):num(s);
const qtyTxt=(p,c)=>{ if(!p) return fmt(c,3); if(p.unidad==='kg'){ if(c===0) return '0 kg'; return Math.abs(c)<1?fmt(c*1000,0)+' g':fmt(c,3).replace(/,?0+$/,'')+' kg'; } return fmt(c,0)+' u'; };
const hoyHora=()=>new Date().toTimeString().slice(0,5);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function sig(k){ S.seq[k]=(S.seq[k]||0)+1; return S.seq[k]; }

/* ---------- estado y persistencia ---------- */
function vacio(){
  return {v:1,config:{nombre:'Mi negocio',sub:'',logo:'',moneda:'$',rubro:'Fiambrería / Delicatessen',venc:true,peso:true,iva:21,diasVence:15,diasPrecio:90,ultimoRespaldo:null,demo:false,
      balanza:{on:false,prefijos:'20',largoPlu:5,valor:'peso',decimales:0}},
    seq:{},productos:[],proveedores:[],catalogo:[],historial:[],lotes:[],movimientos:[],compras:[],ventas:[],clientes:[],cobros:[],ajustesCC:[],archivos:[],gastos:[],cajas:[],cajaMov:[]};
}
let _t=null;
function guardar(){ clearTimeout(_t); _t=setTimeout(()=>{ try{ localStorage.setItem(LS_KEY,JSON.stringify(S)); S._guardadoOk=true; }catch(e){ S._guardadoOk=false; } },250); }
function cargar(){
  try{ const raw=localStorage.getItem(LS_KEY); if(raw){ const o=JSON.parse(raw); if(o&&o.v===1) return o; } }catch(e){}
  return null;
}
function indexar(){
  IDX.stock={};IDX.prod={};IDX.prov={};IDX.cli={};
  S.productos.forEach(p=>IDX.prod[p.id]=p);
  S.proveedores.forEach(p=>IDX.prov[p.id]=p);
  S.clientes.forEach(p=>IDX.cli[p.id]=p);
  S.movimientos.forEach(m=>{ IDX.stock[m.productoId]=r3((IDX.stock[m.productoId]||0)+m.cant); });
}
const stockDe=id=>IDX.stock[id]||0;
const prod=id=>IDX.prod[id];
const provNom=id=>IDX.prov[id]?IDX.prov[id].nombre:'(sin proveedor)';
const cliNom=id=>IDX.cli[id]?IDX.cli[id].nombre:'Consumidor final';
function aplicarRubro(nombre){ const r=RUBROS[nombre]; if(!r) return; S.config.rubro=nombre; S.config.venc=r.venc; S.config.peso=r.peso; }

/* ---------- movimientos y lotes ---------- */
function mov(productoId,tipo,cant,motivo,ref,fecha){
  const m={id:sig('M'),fecha:fecha||hoy(),hora:hoyHora(),productoId,tipo,cant:r3(cant),motivo:motivo||'',ref:ref||null};
  S.movimientos.push(m); IDX.stock[productoId]=r3(stockDe(productoId)+m.cant); return m;
}
function lotesDe(pid){ return S.lotes.filter(l=>l.productoId===pid&&l.cant>0).sort((a,b)=>(a.vence||'9999')<(b.vence||'9999')?-1:(a.vence||'9999')>(b.vence||'9999')?1:a.id-b.id); }
function descontarLotes(pid,cant){ // primero vence, primero sale
  let falta=cant; const usados=[];
  for(const l of lotesDe(pid)){ if(falta<=0.0000001) break; const t=Math.min(l.cant,falta); l.cant=r3(l.cant-t); falta=r3(falta-t); usados.push({loteId:l.id,cant:t}); }
  return usados;
}
function precioReferencia(pid){ const c=S.catalogo.filter(x=>x.productoId===pid); return c.length?Math.min(...c.map(x=>x.precio)):0; }
function mejorProveedor(pid){ const c=S.catalogo.filter(x=>x.productoId===pid).sort((a,b)=>a.precio-b.precio); return c[0]?c[0].proveedorId:null; }

function registrarPrecio(pid,vid,precio,fecha,origen){
  let c=S.catalogo.find(x=>x.productoId===pid&&x.proveedorId===vid);
  if(c){ if(Math.abs(c.precio-precio)>=0.005){ S.historial.push({id:sig('H'),fecha,productoId:pid,proveedorId:vid,precio,origen}); } if(c.fecha<=fecha){ c.precio=precio; c.fecha=fecha; } }
  else { S.catalogo.push({id:sig('K'),productoId:pid,proveedorId:vid,precio,fecha}); S.historial.push({id:sig('H'),fecha,productoId:pid,proveedorId:vid,precio,origen}); }
}

/* ---------- productos ---------- */
function nuevoCodigo(){ let n=S.productos.length+1,c; const usados=new Set(S.productos.map(p=>p.codigo.toUpperCase())); do{ c='P'+String(n).padStart(4,'0'); n++; }while(usados.has(c)); return c; }
function guardarProducto(d,id){
  if(d.plu!=null&&String(d.plu).trim()!==''){ const v=String(d.plu).trim(); if(!/^\d{1,6}$/.test(v)) throw new Error('El PLU de balanza tiene que ser un número (por ejemplo 123).');
    const otro=S.productos.find(x=>x.id!==id&&x.plu&&+x.plu===+v); if(otro) throw new Error('El PLU '+v+' ya lo usa «'+otro.nombre+'».'); }
  let p=id?prod(id):null;
  if(!p){ p={id:sig('P'),codigo:d.codigo||nuevoCodigo(),creado:hoy(),activo:true}; S.productos.push(p); }
  Object.assign(p,{nombre:d.nombre,categoria:d.categoria||'',barras:d.barras||'',plu:d.plu!=null?String(d.plu).trim():(p.plu||''),unidad:d.unidad||'u',costo:d.costo||0,precio:d.precio||0,minimo:d.minimo||0,notas:d.notas||'',activo:d.activo!==false});
  indexar(); return p;
}
function margen(p){ return p.precio>0?(p.precio-p.costo)/p.precio*100:0; }
function estadoStock(p){ const s=stockDe(p.id); if(!p.activo) return 'Inactivo'; if(s<=0) return 'Sin stock'; if(s<=p.minimo) return 'Stock bajo'; return 'Normal'; }
function diasPrecio(p){ const fs=S.catalogo.filter(c=>c.productoId===p.id).map(c=>c.fecha).concat(S.historial.filter(h=>h.productoId===p.id).map(h=>h.fecha)); if(!fs.length) return null; return difDias(hoy(),fs.sort().pop()); }

/* ---------- etiquetas de balanza (EAN-13 que empieza con 2: prefijo + PLU + peso o importe + dígito verificador) ---------- */
function ean13ok(c){ let s=0; for(let i=0;i<12;i++) s+=+c[i]*(i%2?3:1); return (10-s%10)%10===+c[12]; }
function leerEtiquetaBalanza(cod){ const b=S.config.balanza; const c=String(cod||'').trim(); if(!b||!b.on||!/^\d{13}$/.test(c)) return null;
  const pref=String(b.prefijos||'20').split(/[^\d]+/).filter(Boolean); if(!pref.some(p=>c.startsWith(p))) return null;
  const L=+b.largoPlu===4?4:5, plu=c.slice(2,2+L), bruto=+c.slice(2+L,12);
  const p=S.productos.find(x=>x.activo&&x.plu&&+x.plu===+plu)||null;
  const r={codigo:c,plu:String(+plu),p,ok:ean13ok(c),valor:b.valor==='precio'?'precio':'peso',kg:null,importe:null};
  if(r.valor==='peso') r.kg=r3(bruto/1000); else { r.importe=r2(bruto/Math.pow(10,+b.decimales||0)); if(p&&p.precio>0) r.kg=r3(r.importe/p.precio); }
  return r; }

/* ---------- ventas ---------- */
function totalesVenta(items,descPct){
  const sub=r2(items.reduce((a,i)=>a+i.cant*i.precio,0)); const desc=r2(sub*(descPct||0)/100); return {sub,desc,total:r2(sub-desc)};
}
function crearVenta(d){ // d:{items:[{productoId,cant,precio}],clienteId,medio,descPct,recibido,fecha}
  const fecha=d.fecha||hoy();
  for(const i of d.items){ const p=prod(i.productoId); if(stockDe(i.productoId)+0.0000001<i.cant) throw new Error('No hay stock suficiente de «'+p.nombre+'»: hay '+qtyTxt(p,stockDe(i.productoId))+'.'); }
  const t=totalesVenta(d.items,d.descPct);
  const n=sig('V');
  const items=d.items.map(i=>{ const p=prod(i.productoId); const usados=descontarLotes(p.id,i.cant); mov(p.id,'Venta',-i.cant,'Venta #'+n,{t:'venta',id:n},fecha);
    return {productoId:p.id,nombre:p.nombre,unidad:p.unidad,cant:i.cant,precio:i.precio,costo:p.costo,lotes:usados}; });
  const v={id:n,fecha,hora:d.hora||hoyHora(),clienteId:d.clienteId||null,items,sub:t.sub,descPct:d.descPct||0,desc:t.desc,total:t.total,medio:d.medio,recibido:d.recibido||null,estado:'Registrada'};
  S.ventas.push(v); guardar(); return v;
}
function anularVenta(id){
  const v=S.ventas.find(x=>x.id===id); if(!v||v.estado==='Anulada') return;
  v.items.forEach(i=>{ if(!i.productoId) return; // venta sin detalle: no mueve stock
    mov(i.productoId,'Entrada',i.cant,'Anulación venta #'+id,{t:'venta',id});
    (i.lotes||[]).forEach(u=>{ const l=S.lotes.find(x=>x.id===u.loteId); if(l) l.cant=r3(l.cant+u.cant); }); });
  v.estado='Anulada'; guardar();
}
// Venta cargada solo con el comprobante (sin productos): suma a ventas y caja, y el costo se estima con el margen promedio
function margenPromedio(){ const vs=ventasValidas(addDias(hoy(),-30),hoy()).filter(v=>!v.sinDetalle); const ing=vs.reduce((a,v)=>a+v.total,0);
  if(ing>0) return Math.max(0,Math.min(0.9,(ing-vs.reduce((a,v)=>a+costoVenta(v),0))/ing));
  const ps=S.productos.filter(p=>p.activo&&p.precio>0); return ps.length?Math.max(0,Math.min(0.9,ps.reduce((a,p)=>a+margen(p),0)/ps.length/100)):0.3; }
function crearVentaSinDetalle(d){ // d:{monto,medio,clienteId,fecha,hora,concepto}
  const m=margenPromedio(), n=sig('V');
  const v={id:n,fecha:d.fecha||hoy(),hora:d.hora||hoyHora(),clienteId:d.clienteId||null,items:[{productoId:0,nombre:'Venta sin detalle'+(d.concepto?' · '+d.concepto:''),unidad:'u',cant:1,precio:d.monto,costo:r2(d.monto*(1-m)),lotes:[],estimado:true}],
    sub:d.monto,descPct:0,desc:0,total:d.monto,medio:d.medio,recibido:null,estado:'Registrada',sinDetalle:true,margenEst:r2(m*100)};
  S.ventas.push(v); guardar(); return v; }
function ventasValidas(desde,hasta){ return S.ventas.filter(v=>v.estado!=='Anulada'&&(!desde||v.fecha>=desde)&&(!hasta||v.fecha<=hasta)); }
function costoVenta(v){ return r2(v.items.reduce((a,i)=>a+i.cant*i.costo,0)); }
/* ---------- cuenta corriente: planilla con debe / haber / saldo y ciclos de cierre ---------- */
function movsCC(id){ // todos los movimientos de la cuenta, en orden, con el saldo acumulado
  const L=[];
  S.ventas.forEach(v=>{ if(v.estado!=='Anulada'&&v.clienteId===id&&v.medio==='Cuenta corriente') L.push({fecha:v.fecha,ord:v.hora||'',tipo:'venta',ref:v.id,concepto:'Venta #'+v.id+' · '+v.items.length+(v.items.length===1?' producto':' productos'),debe:v.total,haber:0}); });
  S.cobros.forEach(c=>{ if(c.clienteId===id) L.push({fecha:c.fecha,ord:'~',tipo:'cobro',ref:c.id,concepto:'Pago · '+c.medio+(c.operacion?' · Op. '+c.operacion:'')+(c.nota?' · '+c.nota:''),debe:0,haber:c.monto,comprobante:c.comprobante||null}); });
  (S.ajustesCC||[]).forEach(a=>{ if(a.clienteId===id) L.push({fecha:a.fecha,ord:'~',tipo:'ajuste',ref:a.id,concepto:a.concepto||(a.tipo==='Cargo'?'Cargo manual':'Descuento / nota de crédito'),debe:a.tipo==='Cargo'?a.monto:0,haber:a.tipo==='Cargo'?0:a.monto}); });
  L.sort((a,b)=>a.fecha<b.fecha?-1:a.fecha>b.fecha?1:a.ord<b.ord?-1:a.ord>b.ord?1:a.ref-b.ref);
  let s=0; L.forEach(m=>{ s=r2(s+m.debe-m.haber); m.saldo=s; }); return L;
}
function saldoCliente(id){
  const deb=S.ventas.filter(v=>v.estado!=='Anulada'&&v.clienteId===id&&v.medio==='Cuenta corriente').reduce((a,v)=>a+v.total,0);
  const hab=S.cobros.filter(c=>c.clienteId===id).reduce((a,c)=>a+c.monto,0);
  const aj=(S.ajustesCC||[]).filter(a=>a.clienteId===id).reduce((a,x)=>a+(x.tipo==='Cargo'?x.monto:-x.monto),0); return r2(deb-hab+aj);
}
// Ciclo de cierre: el cliente cierra el día «cierre» de cada mes (0 o vacío = fin de mes). Devuelve {desde,hasta} del ciclo k (0 = el actual, 1 = el anterior…).
function finCiclo(y,m,dia){ const ult=new Date(y,m+1,0).getDate(); return ymd(new Date(y,m,!dia||dia>=ult?ult:dia)); }
function cicloCC(cliente,k){ const dia=+(cliente&&cliente.cierre)||0; const h=new Date(hoy()+'T12:00:00'); let y=h.getFullYear(),m=h.getMonth();
  if(finCiclo(y,m,dia)<hoy()){ m++; } m-=k; const hasta=finCiclo(y,m,dia); const desde=addDias(finCiclo(y,m-1,dia),1); return {desde,hasta}; }
function resumenCC(id,desde,hasta){ const L=movsCC(id); const antes=L.filter(x=>desde&&x.fecha<desde); const en=L.filter(x=>(!desde||x.fecha>=desde)&&(!hasta||x.fecha<=hasta));
  const ant=antes.length?antes[antes.length-1].saldo:0; const debe=r2(en.reduce((a,x)=>a+x.debe,0)), haber=r2(en.reduce((a,x)=>a+x.haber,0));
  return {L:en,anterior:ant,debe,haber,saldo:r2(ant+debe-haber)}; }

/* ---------- compras ---------- */
function calcCompra(d){ // d:{items:[{cant,costo}],ivaPct,ivaRec,flete,otros}
  const neto=r2(d.items.reduce((a,i)=>a+(i.cant||0)*(i.costo||0),0)); const iva=r2(neto*(d.ivaPct||0)/100);
  const total=r2(neto+iva+(d.flete||0)+(d.otros||0)); const costoReal=r2(neto+(d.flete||0)+(d.otros||0)+(d.ivaRec?0:iva));
  return {neto,iva,total,costoReal};
}
function crearCompra(d){
  const c=calcCompra(d); const id=sig('C');
  const factor=c.neto>0?c.costoReal/c.neto:1; // costo real unitario = precio * factor (flete, otros e IVA no recuperable prorrateados)
  S.compras.push({id,fecha:d.fecha,proveedorId:d.proveedorId,items:d.items.map(i=>({productoId:i.productoId,cant:i.cant,costo:i.costo,vence:i.vence||null,lote:i.lote||''})),ivaPct:d.ivaPct,ivaRec:d.ivaRec,flete:d.flete||0,otros:d.otros||0,neto:c.neto,iva:c.iva,total:c.total,costoReal:c.costoReal,pago:d.pago,obs:d.obs||'',estado:'Registrada'});
  d.items.forEach(i=>{ const p=prod(i.productoId);
    mov(p.id,'Compra',i.cant,'Compra #'+id,{t:'compra',id},d.fecha);
    if(S.config.venc&&i.vence) S.lotes.push({id:sig('L'),productoId:p.id,lote:i.lote||('C'+id),vence:i.vence,cant:i.cant,cantInicial:i.cant,compraId:id,fecha:d.fecha});
    registrarPrecio(p.id,d.proveedorId,i.costo,d.fecha,'Compra');
    p.costo=r2(i.costo*factor);
  });
  guardar(); return id;
}
function neto0(c){return c.neto}
function anularCompra(id){
  const c=S.compras.find(x=>x.id===id); if(!c||c.estado==='Anulada') return;
  c.items.forEach(i=>mov(i.productoId,'Salida',-i.cant,'Anulación compra #'+id,{t:'compra',id}));
  S.lotes.filter(l=>l.compraId===id).forEach(l=>l.cant=0);
  c.estado='Anulada'; guardar();
}

/* ---------- inventario ---------- */
function moverStock(pid,tipo,cant,motivo,fecha){ // tipo Entrada|Salida|Merma|Ajuste (cant = contado si Ajuste)
  const p=prod(pid); const s=stockDe(pid);
  if(tipo==='Entrada'){ mov(pid,'Entrada',cant,motivo||'Entrada manual',null,fecha); }
  else if(tipo==='Salida'||tipo==='Merma'){ if(cant>s+0.0000001) throw new Error('No hay stock suficiente: hay '+qtyTxt(p,s)+'.'); descontarLotes(pid,cant); mov(pid,tipo,-cant,motivo||(tipo==='Merma'?'Merma':'Salida manual'),null,fecha); }
  else { const dif=r3(cant-s); if(Math.abs(dif)<0.0001) return false; if(dif<0) descontarLotes(pid,-dif); mov(pid,'Ajuste',dif,(motivo||'Recuento')+' (de '+fmt(s,3)+' a '+fmt(cant,3)+')',null,fecha); }
  guardar(); return true;
}
function bajaLote(loteId){
  const l=S.lotes.find(x=>x.id===loteId); if(!l||l.cant<=0) return; const p=prod(l.productoId);
  const c=Math.min(l.cant,Math.max(0,stockDe(p.id)));
  if(c>0) mov(p.id,'Merma',-c,'Baja por vencimiento (lote '+l.lote+')',null);
  l.cant=0; guardar();
}
function estadoVence(l){ const d=difDias(l.vence,hoy()); return d<0?{k:'bad',t:'Vencido hace '+(-d)+' d',d}:(d<=S.config.diasVence?{k:'warn',t:'Vence en '+d+' d',d}:{k:'good',t:'En '+d+' días',d}); }

/* ---------- sugerencias de reposición ---------- */
function ventaDiaria(pid,dias=30){
  const desde=addDias(hoy(),-dias); let q=0;
  S.ventas.forEach(v=>{ if(v.estado==='Anulada'||v.fecha<desde) return; v.items.forEach(i=>{ if(i.productoId===pid) q+=i.cant; }); }); return q/dias;
}
function sugerido(p){ const s=stockDe(p.id); const obj=Math.max(p.minimo*2,ventaDiaria(p.id)*14); const q=obj-s; if(q<=0) return 0; return p.unidad==='kg'?Math.ceil(q*2)/2:Math.ceil(q); }

/* ---------- caja ---------- */
function resumenCaja(f){
  const vs=ventasValidas(f,f); const por={}; MEDIOS.forEach(m=>por[m]=0); vs.forEach(v=>por[v.medio]=r2((por[v.medio]||0)+v.total));
  const cobros=S.cobros.filter(c=>c.fecha===f); const cobEf=r2(cobros.filter(c=>c.medio==='Efectivo').reduce((a,c)=>a+c.monto,0));
  const gEf=r2(S.gastos.filter(g=>g.fecha===f&&g.medio==='Efectivo').reduce((a,g)=>a+g.monto+(g.ivaRec?0:g.iva)+(g.ivaRec?g.iva:0),0));
  const cEf=r2(S.compras.filter(c=>c.estado!=='Anulada'&&(c.fechaPago||c.fecha)===f&&c.pago==='Efectivo').reduce((a,c)=>a+c.total,0));
  const movs=S.cajaMov.filter(m=>m.fecha===f); const ing=r2(movs.filter(m=>m.tipo==='Ingreso').reduce((a,m)=>a+m.monto,0)); const ret=r2(movs.filter(m=>m.tipo==='Retiro').reduce((a,m)=>a+m.monto,0));
  const cierre=S.cajas.find(c=>c.fecha===f)||null;
  const prev=S.cajas.filter(c=>c.fecha<f).sort((a,b)=>a.fecha<b.fecha?1:-1)[0];
  const apertura=cierre?cierre.apertura:(prev?prev.contado:0);
  const esperado=r2(apertura+por['Efectivo']+cobEf+ing-ret-gEf-cEf);
  return {vs,por,cobros,cobEf,gEf,cEf,movs,ing,ret,cierre,apertura,esperado,totalVentas:r2(vs.reduce((a,v)=>a+v.total,0))};
}

/* ---------- reportes ---------- */
function reporte(desde,hasta){
  const vs=ventasValidas(desde,hasta); const prods={},cats={},medios={};
  let ingresos=0,costo=0;
  vs.forEach(v=>{ ingresos+=v.total; const k=v.sub>0?v.total/v.sub:1; medios[v.medio]=(medios[v.medio]||0)+v.total;
    v.items.forEach(i=>{ const ing=i.cant*i.precio*k, cst=i.cant*i.costo; costo+=cst;
      const p=prods[i.productoId]||(prods[i.productoId]={id:i.productoId,nombre:i.nombre,cant:0,ing:0,cst:0,unidad:i.unidad}); p.cant+=i.cant;p.ing+=ing;p.cst+=cst;
      const c=(prod(i.productoId)||{}).categoria||'Sin categoría'; const cc=cats[c]||(cats[c]={ing:0,cst:0}); cc.ing+=ing;cc.cst+=cst; }); });
  const gastos=S.gastos.filter(g=>(!desde||g.fecha>=desde)&&(!hasta||g.fecha<=hasta)).reduce((a,g)=>a+g.monto+(g.ivaRec?0:g.iva),0);
  const mermas=S.movimientos.filter(m=>m.tipo==='Merma'&&(!desde||m.fecha>=desde)&&(!hasta||m.fecha<=hasta)).reduce((a,m)=>a+(-m.cant)*((prod(m.productoId)||{}).costo||0),0);
  return {vs,ingresos:r2(ingresos),costo:r2(costo),bruto:r2(ingresos-costo),gastos:r2(gastos),mermas:r2(mermas),neto:r2(ingresos-costo-gastos-mermas),prods:Object.values(prods),cats,medios};
}

/* ---------- respaldo ---------- */
function exportarJSON(){ S.config.ultimoRespaldo=hoy(); guardar(); const o=Object.assign({},S); delete o._guardadoOk; return JSON.stringify(o); }
function importarJSON(txt){ const o=JSON.parse(txt); if(!o||o.v!==1||!Array.isArray(o.productos)) throw new Error('El archivo no es un respaldo válido de esta app.');
  const adj=Array.isArray(o._adjuntos)?o._adjuntos:null; delete o._adjuntos; // los archivos van aparte, a IndexedDB
  S=Object.assign(vacio(),o); indexar(); guardar(); return adj; }
function csvEsc(v){ const s=String(v==null?'':v); return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function aCSV(cols,rows){ return '﻿'+[cols.join(';')].concat(rows.map(r=>r.map(csvEsc).join(';'))).join('\r\n'); }
function parseCSV(text){
  text=text.replace(/^﻿/,''); const first=text.split(/\r?\n/,1)[0]||''; const d=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; } else cell+=ch; }
    else if(ch==='"') q=true; else if(ch===d){row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&text[i+1]==='\n') i++; row.push(cell);cell=''; if(row.some(c=>c.trim()!=='')) rows.push(row); row=[]; }
    else cell+=ch; }
  row.push(cell); if(row.some(c=>c.trim()!=='')) rows.push(row); return rows;
}
