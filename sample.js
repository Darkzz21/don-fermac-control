/* Datos de ejemplo (Don Fermac) e importadores: gestion.json del programa anterior y CSV de productos. */
'use strict';
function prng(seed){ let a=seed>>>0; return function(){ a|=0;a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return((t^t>>>14)>>>0)/4294967296; }; }

function cargarDemo(){
  S=vacio(); S.config.demo=true; S.config.nombre='Fiambrería de ejemplo'; S.config.sub='Fiambrería / Delicatessen'; indexar();
  const prov=(nombre,contacto,tel,color)=>{ const p={id:sig('V'),nombre,contacto,telefono:tel,email:'',direccion:'',color,notas:''}; S.proveedores.push(p); return p.id; };
  const vSur=prov('Lácteos del Sur','Julián Rossi','5491155550101','#1d7a4e');
  const vPepe=prov('Frigorífico Don Pepe','Marcela Díaz','5491155550102','#b4373d');
  const vNorte=prov('Distribuidora Norte','Hugo Peralta','5491155550103','#1f4fd8');
  const P=(codigo,nombre,categoria,unidad,costo,precio,minimo,barras)=>guardarProducto({codigo,nombre,categoria,unidad,costo,precio,minimo,barras:barras||''}).id;
  const jc=P('FIA001','Jamón cocido natural','Fiambres','kg',9800,14500,3);
  const jr=P('FIA002','Jamón crudo','Fiambres','kg',21000,31500,1.5);
  const qc=P('QUE001','Queso cremoso','Quesos','kg',7800,11800,4);
  const qs=P('QUE002','Queso sardo','Quesos','kg',12500,18900,2);
  const sm=P('FIA003','Salame milán','Fiambres','kg',11500,17500,2);
  const mo=P('FIA004','Mortadela','Fiambres','kg',5200,7900,2);
  const pa=P('FIA005','Pastrón','Fiambres','kg',10500,15900,1.5);
  const bo=P('FIA006','Bondiola','Fiambres','kg',13800,20900,1.5);
  const ao=P('ENC001','Aceitunas verdes 500 g','Encurtidos','u',2900,4800,6,'7790001000011');
  const pk=P('ENC002','Pickles agridulces 350 g','Encurtidos','u',2400,3900,6,'7790001000028');
  const ma=P('FRU001','Maní tostado 250 g','Frutos secos','u',1500,2700,10,'7790001000035');
  const pm=P('PAN001','Pan de miga x24','Panificados','u',3200,5200,5,'7790001000042');
  const vi=P('BEB001','Vino Malbec 750 ml','Bebidas','u',6200,9800,6,'7790001000059');
  const ce=P('BEB002','Cerveza artesanal 500 ml','Bebidas','u',1900,3300,12,'7790001000066');
  const cli=(nombre,tel,dir)=>{ const c={id:sig('Q'),nombre,telefono:tel,direccion:dir,notas:'',creado:hoy()}; S.clientes.push(c); return c.id; };
  const c1=cli('Marta Gómez','5491155551001','Av. Rivadavia 2350');
  const c2=cli('Restaurante La Esquina','5491155551002','Bulnes 810');
  const c3=cli('Carlos Díaz','5491155551003','');
  indexar();
  const compra=(dias,v,pago,items,flete)=>crearCompra({fecha:addDias(hoy(),-dias),proveedorId:v,pago,ivaPct:21,ivaRec:true,flete:flete||0,otros:0,items:items.map(i=>({productoId:i[0],cant:i[1],costo:i[2],vence:i[3]!=null?addDias(hoy(),i[3]):null,lote:'L'+Math.abs(dias)+'-'+i[0]}))});
  compra(35,vPepe,'Transferencia',[[jc,16,9500,40],[jr,13,20400,70],[sm,13,11200,60],[mo,10,5000,45],[pa,9.5,10200,30],[bo,6,13400,50]],18000);
  compra(34,vSur,'Efectivo',[[qc,22,7600,38],[qs,14,12200,80]],9000);
  compra(33,vNorte,'Transferencia',[[ao,120,2800,300],[pk,110,2300,300],[ma,90,1450,150],[pm,56,3100,20],[vi,90,6000,720],[ce,48,1850,120]],0);
  compra(9,vPepe,'Transferencia',[[jc,10,9800,28],[sm,3,11500,55],[mo,2,5200,40]],12000);
  compra(8,vSur,'Efectivo',[[qc,10,7800,30]],6000);
  compra(8,vNorte,'Efectivo',[[pm,12,3200,16],[ce,24,1900,110]],0);
  // ventas de los últimos 30 días, usando las mismas reglas que la caja real
  const rnd=prng(20261103); const lista=S.productos.map(p=>p.id);
  const peso=[0.1,0.15,0.2,0.25,0.3,0.5];
  for(let d=30;d>=0;d--){
    const f=addDias(hoy(),-d); const dow=new Date(f+'T12:00:00').getDay(); const base=dow===0?4:(dow===6?11:8);
    const nv=d===0?3:Math.max(2,Math.round(base+rnd()*4-1));
    for(let k=0;k<nv;k++){
      const n=1+Math.floor(rnd()*3.4); const items=[]; const usados=new Set();
      for(let j=0;j<n;j++){ const pid=lista[Math.floor(rnd()*lista.length)]; if(usados.has(pid)) continue; usados.add(pid); const p=prod(pid);
        const cant=p.unidad==='kg'?peso[Math.floor(rnd()*peso.length)]:1+Math.floor(rnd()*2.4); if(stockDe(pid)>=cant) items.push({productoId:pid,cant,precio:p.precio}); }
      if(!items.length) continue;
      const r=rnd(); let medio=r<.4?'Efectivo':r<.6?'Transferencia':r<.75?'Débito':r<.85?'Crédito':r<.95?'Mercado Pago':'Cuenta corriente';
      let clienteId=null; if(medio==='Cuenta corriente'){ clienteId=[c1,c2,c3][Math.floor(rnd()*3)]; } else if(rnd()<.18) clienteId=[c1,c2,c3][Math.floor(rnd()*3)];
      try{ const v=crearVenta({items,clienteId,medio,descPct:rnd()<.08?5:0,fecha:f,hora:pad(9+Math.floor(rnd()*10))+':'+pad(Math.floor(rnd()*60))}); }catch(e){}
    }
  }
  // cobros de cuenta corriente
  S.cobros.push({id:sig('Z'),fecha:addDias(hoy(),-6),clienteId:c2,monto:20000,medio:'Transferencia',nota:'Pago parcial'});
  // lotes con vencimiento cercano para mostrar las alertas
  const lote=(pid,cant,dias,nombre)=>{ mov(pid,'Entrada',cant,'Ingreso de lote '+nombre,null); S.lotes.push({id:sig('L'),productoId:pid,lote:nombre,vence:addDias(hoy(),dias),cant,cantInicial:cant,compraId:0,fecha:hoy()}); };
  lote(mo,1.2,-2,'M-OLD'); lote(pa,1.0,4,'P-NEW'); lote(pm,4,2,'PM-HOY');
  // gastos
  const g=(dias,concepto,categoria,monto,iva,medio)=>S.gastos.push({id:sig('G'),fecha:addDias(hoy(),-dias),concepto,categoria,monto,iva,ivaRec:false,medio});
  g(28,'Alquiler del local','Alquiler',220000,0,'Transferencia'); g(26,'Electricidad','Servicios',42000,8820,'Transferencia'); g(20,'Sueldo empleada','Sueldos',280000,0,'Efectivo');
  g(12,'Bolsas y papel','Insumos',15000,3150,'Efectivo'); g(2,'Mantenimiento heladera','Mantenimiento',25000,0,'Transferencia'); g(1,'Monotributo / impuestos','Impuestos',38000,0,'Transferencia');
  // cierres de caja de los dos días anteriores
  S.cajas.push({fecha:addDias(hoy(),-4),apertura:60000,esperado:60000,contado:60000,dif:0,notas:'Caja inicial'});
  for(const d of [3,2,1]){ const f=addDias(hoy(),-d); S.cajaMov.push({id:sig('W'),fecha:f,tipo:'Retiro',monto:25000,motivo:'Depósito en banco'}); const r=resumenCaja(f); const dif=d===2?-1500:0; S.cajas.push({fecha:f,apertura:r.apertura,esperado:r.esperado,contado:r2(r.esperado+dif),dif,notas:d===2?'Faltó cambio':''}); }
  S.config.ultimoRespaldo=null; indexar(); guardar();
}

/* ---------- migración desde gestion.json del programa de escritorio ---------- */
function importarGestion(o){
  const arr=x=>Array.isArray(x)?x:(x?[x]:[]);
  const N=vacio(); N.config=Object.assign(N.config,{demo:false});
  const maxId=(l)=>l.reduce((a,x)=>Math.max(a,x.id),0);
  N.productos=arr(o.Productos).map(p=>({id:+p.Id,codigo:String(p.Codigo||''),nombre:String(p.Nombre||''),categoria:String(p.Categoria||''),barras:'',unidad:'u',costo:+p.PrecioCompra||0,precio:+p.PrecioVenta||0,minimo:+p.StockMinimo||0,notas:String(p.Observaciones||''),activo:p.Estado!=='Inactivo',creado:String(p.Creado||hoy())}));
  N.proveedores=arr(o.Proveedores).map(v=>({id:+v.Id,nombre:String(v.Nombre||''),contacto:String(v.Contacto||''),telefono:String(v.Telefono||''),email:String(v.Email||''),direccion:String(v.Direccion||''),color:String(v.Color||'#1d7a4e'),notas:String(v.Observaciones||'')}));
  N.catalogo=arr(o.Catalogo).map(c=>({id:+c.Id,productoId:+c.ProductoId,proveedorId:+c.ProveedorId,precio:+c.Precio,fecha:String(c.Fecha).slice(0,10)}));
  N.historial=arr(o.Historial).map(h=>({id:+h.Id,fecha:String(h.Fecha).slice(0,10),productoId:+h.ProductoId,proveedorId:+h.ProveedorId||0,precio:+h.Precio,origen:String(h.Origen||'')}));
  N.movimientos=arr(o.Movimientos).map(m=>({id:+m.Id,fecha:String(m.Fecha).slice(0,10),hora:'',productoId:+m.ProductoId,tipo:(+m.CompraId>0&&+m.Cantidad>0)?'Compra':String(m.Tipo),cant:+m.Cantidad,motivo:String(m.Motivo||''),ref:+m.CompraId>0?{t:'compra',id:+m.CompraId}:null}));
  N.compras=arr(o.Compras).map(c=>({id:+c.Id,fecha:String(c.Fecha).slice(0,10),proveedorId:+c.ProveedorId,items:arr(c.Items).map(i=>({productoId:+i.ProductoId,cant:+i.Cantidad,costo:+i.Precio,vence:null,lote:''})),ivaPct:+c.IvaPct||0,ivaRec:!!c.IvaRecuperable,flete:+c.Flete||0,otros:+c.Otros||0,neto:+c.Neto||0,iva:+c.Iva||0,total:+c.Total||0,costoReal:+c.CostoReal||0,pago:'Sin dato',obs:String(c.Observaciones||''),estado:String(c.Estado||'Registrada')}));
  N.gastos=arr(o.Gastos).map(g=>({id:+g.Id,fecha:String(g.Fecha).slice(0,10),concepto:String(g.Concepto||''),categoria:String(g.Categoria||''),monto:+g.Monto||0,iva:+g.Iva||0,ivaRec:!!g.IvaRecuperable,medio:'Sin dato'}));
  N.seq={P:maxId(N.productos),V:maxId(N.proveedores),K:maxId(N.catalogo),H:maxId(N.historial),M:maxId(N.movimientos),C:maxId(N.compras),G:maxId(N.gastos)};
  S=N; indexar(); guardar();
  return {productos:N.productos.length,proveedores:N.proveedores.length,compras:N.compras.length,movimientos:N.movimientos.length};
}

/* ---------- importación de productos desde CSV / Excel guardado como CSV ---------- */
function importarProductosCSV(texto){
  const filas=parseCSV(texto); if(filas.length<2) throw new Error('El archivo no tiene filas.');
  const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'');
  const cab=filas[0].map(norm);
  const col=(...n)=>cab.findIndex(h=>n.includes(h));
  const iCod=col('codigo','cod','sku'), iNom=col('nombre','descripcion','producto','articulo'), iCat=col('categoria','rubro'), iUni=col('unidad','um'), iCos=col('costo','preciocompra','preciodecompra'),
        iPre=col('precio','precioventa','preciodeventa'), iSto=col('stock','existencia','cantidad'), iMin=col('minimo','stockminimo','stockmin'), iBar=col('barras','codigodebarras','ean'), iPrv=col('proveedor');
  if(iNom<0) throw new Error('No encontré la columna «Nombre». Revisá la primera fila del archivo.');
  let nuevos=0,act=0; const errores=[];
  filas.slice(1).forEach((r,i)=>{
    const g=(ix)=>ix>=0?String(r[ix]||'').trim():''; const nom=g(iNom); if(!nom) return;
    const nv=(ix)=>{ const t=g(ix); if(t==='') return undefined; const v=num(t); return v==null||v<0?NaN:v; };
    const costo=nv(iCos),precio=nv(iPre),stock=nv(iSto),minimo=nv(iMin);
    if([costo,precio,stock,minimo].some(x=>Number.isNaN(x))){ errores.push('Fila '+(i+2)+' ('+nom+'): hay un número inválido.'); return; }
    let p=null; const cod=g(iCod),bar=g(iBar);
    if(cod) p=S.productos.find(x=>x.codigo.toUpperCase()===cod.toUpperCase()); if(!p&&bar) p=S.productos.find(x=>x.barras&&x.barras===bar); if(!p) p=S.productos.find(x=>x.nombre.toLowerCase()===nom.toLowerCase());
    const uni=g(iUni).toLowerCase().startsWith('k')?'kg':'u';
    const d=p?{codigo:p.codigo,nombre:nom,categoria:g(iCat)||p.categoria,barras:bar||p.barras,unidad:iUni>=0?uni:p.unidad,costo:costo!==undefined?costo:p.costo,precio:precio!==undefined?precio:p.precio,minimo:minimo!==undefined?minimo:p.minimo,notas:p.notas,activo:p.activo}
             :{codigo:cod,nombre:nom,categoria:g(iCat),barras:bar,unidad:uni,costo:costo||0,precio:precio||0,minimo:minimo||0};
    const q=guardarProducto(d,p?p.id:null); p?act++:nuevos++;
    if(stock!==undefined){ const s=stockDe(q.id); if(Math.abs(stock-s)>0.0001) mov(q.id,s===0&&!p?'Entrada':'Ajuste',stock-s,p?'Ajuste por importación':'Carga inicial'); }
    const pn=g(iPrv); if(pn){ let v=S.proveedores.find(x=>x.nombre.toLowerCase()===pn.toLowerCase()); if(!v){ v={id:sig('V'),nombre:pn,contacto:'',telefono:'',email:'',direccion:'',color:'#1d7a4e',notas:''}; S.proveedores.push(v); indexar(); } if(q.costo>0) registrarPrecio(q.id,v.id,q.costo,hoy(),'Importación'); }
  });
  indexar(); guardar(); return {nuevos,act,errores};
}
