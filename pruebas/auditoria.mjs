// Pruebas automáticas de Gestia. Levanta la app en un servidor local, la abre en Edge o Chrome
// (el que esté instalado) y prueba recorridos y casos límite. Uso:  cd pruebas && npm install && npm test
// Si el navegador está en otro lugar: NAVEGADOR="ruta/al/navegador" npm test
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (ruta.endsWith('/')) ruta += 'index.html';
  try { const f = await readFile(join(RAIZ, ruta)); res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream' }); res.end(f); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const URL0 = `http://127.0.0.1:${srv.address().port}/`;

const CANDIDATOS = [process.env.NAVEGADOR,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].filter(Boolean);
const exe = CANDIDATOS.find(p => existsSync(p));
if (!exe) { console.error('No encontré Edge ni Chrome. Indicá la ruta con NAVEGADOR=...'); process.exit(2); }
const b = await puppeteer.launch({ executablePath: exe, headless: 'new' });
const espera = ms => new Promise(r => setTimeout(r, ms));
const R = [];
const anota = (id, ok, det) => { R.push({ id, ok }); console.log((ok ? '  ok    ' : '  FALLA ') + id + (!ok && det ? '\n          → ' + det : '')); };

async function nueva(w = 1280, h = 800, movil = false) {
  const p = await b.newPage(); p._err = [];
  p.on('pageerror', e => p._err.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) p._err.push('console: ' + m.text()); });
  p.on('dialog', d => { p._err.push('dialog: ' + d.message()); d.dismiss(); });
  await p.setViewport({ width: w, height: h, isMobile: movil, hasTouch: movil });
  return p;
}
async function limpio(p) { // arranca con los datos de ejemplo recién cargados
  await p.goto(URL0, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' }); await espera(200);
}
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const prueba = async (nombre, fn) => { const p = await nueva(); await limpio(p); try { await fn(p); } catch (e) { anota(nombre, false, 'error: ' + e.message); } await p.close(); };
const unidad = () => S.productos.find(x => x.unidad === 'u' && stockDe(x.id) > 2);
const kilo = () => S.productos.find(x => x.unidad === 'kg' && stockDe(x.id) > 1);

console.log('\nRecorrido');
for (const [nom, w, h, m] of [['compu', 1280, 800, false], ['celular', 390, 844, true]]) {
  const p = await nueva(w, h, m); await limpio(p);
  for (const v of ['panel', 'ventas', 'caja', 'productos', 'inventario', 'compras', 'proveedores', 'clientes', 'gastos', 'reportes', 'ajustes']) { await ev(p, v => { location.hash = v; }, v); await espera(150); }
  for (const [v, act, ts] of [['ventas', 'tab-ventas', ['vender', 'historial', 'cc']], ['inventario', 'tab-inv', ['lotes', 'mov', 'recuento']], ['compras', 'tab-comp', ['lista', 'pedido']], ['proveedores', 'tab-prov', ['prov', 'precios']]]) {
    await ev(p, v => { location.hash = v; }, v); await espera(150);
    for (const t of ts) { await ev(p, (a, t) => { const e = document.querySelector(`[data-act="${a}"][data-t="${t}"]`); if (e) e.click(); }, act, t); await espera(150); } }
  for (const [v, sel] of [['productos', '[data-act="prod-edit"]'], ['clientes', '[data-act="cli-ver"]'], ['compras', '[data-act="compra-ver"]'], ['proveedores', '[data-act="prov-ver"]'], ['gastos', '[data-act="gasto-edit"]']]) {
    await ev(p, v => { location.hash = v; }, v); await espera(150);
    await ev(p, s => { const e = document.querySelector(s); if (e) e.click(); }, sel); await espera(150); await ev(p, () => cerrar()); }
  const ancho = await ev(p, () => document.documentElement.scrollWidth);
  anota(`todas las secciones abren sin errores (${nom})`, !p._err.length && ancho <= w, p._err.slice(0, 3).join(' | ') + (ancho > w ? ` desborda ${ancho}px` : ''));
  await p.close();
}

console.log('\nNúmeros');
await prueba('"0.250" se lee como 0,25 y "1.500" como 1500', async p => {
  const r = await ev(p, () => [num('0.250'), num('0,250'), num('1.500'), num('1.500,5'), num('.5'), num('12.5'), num('-0.500'), num('$ 1.234.567,89')]);
  anota('"0.250" se lee como 0,25 y "1.500" como 1500', JSON.stringify(r) === JSON.stringify([0.25, 0.25, 1500, 1500.5, 0.5, 12.5, -0.5, 1234567.89]), JSON.stringify(r)); });
await prueba('venta: el peso escrito "1.5" o "0.250" son kilos', async p => {
  const r = await ev(p, k => { location.hash = 'ventas'; UI.vista = 'ventas'; render(); const pr = eval(k)(); UI.cart.items = [{ productoId: pr.id, cant: 0.1, precio: pr.precio }]; renderCart();
    const set = v => { const i = document.querySelector('[data-chg="cart-qty"]'); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); return UI.cart.items[0].cant; };
    return [set('0.250'), set('1.5'), set('1.250')]; }, kilo.toString());
  anota('venta: el peso escrito "1.5" o "0.250" son kilos', JSON.stringify(r) === '[0.25,1.5,1.25]', JSON.stringify(r)); });
await prueba('recuento: "0.500" kg deja 0,5 kg', async p => {
  const r = await ev(p, k => { const pr = eval(k)(); UI.vista = 'inventario'; UI.invTab = 'recuento'; render(); document.querySelector('#rc_' + pr.id).value = '0.500'; ACT['rc-aplicar'](); return stockDe(pr.id); }, kilo.toString());
  anota('recuento: "0.500" kg deja 0,5 kg', r === 0.5, 'quedó ' + r); });
await prueba('importar: stock "0.250" en kg entra como 0,25', async p => {
  const r = await ev(p, () => { importarProductosCSV('nombre;unidad;stock;precio\nQueso test;kg;0.250;1.500\n'); const pr = S.productos.find(x => x.nombre === 'Queso test'); return [stockDe(pr.id), pr.precio]; });
  anota('importar: stock "0.250" en kg entra como 0,25', JSON.stringify(r) === '[0.25,1500]', JSON.stringify(r)); });

console.log('\nPrecios en bloque');
await prueba('margen objetivo no toca productos sin costo', async p => {
  const r = await ev(p, () => { const pr = S.productos[0]; pr.costo = 0; return planPrecios({ modo: 'margen', valor: 40, redondeo: '10' }).some(x => x.p.id === pr.id); });
  anota('margen objetivo no toca productos sin costo', !r, 'el producto sin costo iba a quedar en $0'); });
await prueba('no se puede bajar 100% o más', async p => {
  const r = await ev(p, () => { ACT['prod-precios'](); const f = document.querySelector('#frm'); f.elements.valor.value = '-100'; document.querySelector('#okb').click(); return { err: (document.querySelector('#err') || {}).textContent, cero: S.productos.some(x => x.precio === 0) }; });
  anota('no se puede bajar 100% o más', !!r.err && !r.cero, JSON.stringify(r)); });

console.log('\nGuardado');
await prueba('la venta queda guardada aunque se cierre enseguida', async p => {
  const antes = await ev(p, () => S.ventas.length);
  await ev(p, k => { const pr = eval(k)(); crearVenta({ items: [{ productoId: pr.id, cant: 1, precio: pr.precio }], medio: 'Efectivo' }); }, unidad.toString());
  await p.goto('about:blank'); await p.goto(URL0, { waitUntil: 'networkidle0' });
  const despues = await ev(p, () => S.ventas.length);
  anota('la venta queda guardada aunque se cierre enseguida', despues === antes + 1, `antes ${antes}, después ${despues}`); });
{ const a = await nueva(); await limpio(a); const bb = await nueva(); await bb.goto(URL0, { waitUntil: 'networkidle0' });
  await ev(a, k => { const pr = eval(k)(); crearVenta({ items: [{ productoId: pr.id, cant: 1, precio: pr.precio }], medio: 'Efectivo' }); }, unidad.toString()); await espera(400);
  await ev(bb, () => { S.gastos.push({ id: sig('G'), fecha: hoy(), concepto: 'Prueba', categoria: '', medio: 'Efectivo', monto: 100, iva: 0, ivaRec: false }); guardar(); }); await espera(400);
  const n = await ev(a, () => { const o = JSON.parse(localStorage.getItem('stockapp_v1')); return { guardadas: o.ventas.length, enA: S.ventas.length, gasto: o.gastos.some(g => g.concepto === 'Prueba'), gastoEnA: S.gastos.some(g => g.concepto === 'Prueba') }; });
  anota('dos pestañas abiertas no se pisan', n.guardadas === n.enA && n.gasto && n.gastoEnA, JSON.stringify(n)); await a.close(); await bb.close(); }
await prueba('datos dañados: se guarda una copia y no se pisan', async p => {
  await ev(p, () => localStorage.setItem('stockapp_v1', '{"v":1,"productos":[ROTO')); await p.reload({ waitUntil: 'networkidle0' }); await espera(300);
  const r = await ev(p, () => ({ copia: Object.keys(localStorage).find(k => k.startsWith('stockapp_v1_danado')), aviso: !!document.querySelector('#ov') }));
  const copia = r.copia && await ev(p, k => localStorage.getItem(k), r.copia);
  anota('datos dañados: se guarda una copia y no se pisan', copia === '{"v":1,"productos":[ROTO' && r.aviso, JSON.stringify(r)); });
await prueba('si el navegador no puede guardar, avisa enseguida', async p => {
  const r = await ev(p, async k => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('lleno', 'QuotaExceededError'); };
    const pr = eval(k)(); crearVenta({ items: [{ productoId: pr.id, cant: 1, precio: pr.precio }], medio: 'Efectivo' }); await new Promise(r => setTimeout(r, 300));
    Storage.prototype.setItem = orig; return !!document.querySelector('#guarderr'); }, unidad.toString());
  anota('si el navegador no puede guardar, avisa enseguida', r); });

console.log('\nCuenta corriente');
await prueba('un cobro cargado por error se puede borrar', async p => {
  const r = await ev(p, () => { const c = S.cobros[0]; const saldo0 = saldoCliente(c.clienteId); UI.vista = 'ventas'; UI.ventasTab = 'cc'; render(); UI.cc = { id: c.clienteId, per: 'todo' }; FILL.ventas();
    const bt = document.querySelector(`#ccdet [data-act="cc-cobro-del"][data-id="${c.id}"]`); if (!bt) return { boton: false }; bt.click(); document.querySelector('#yes').click();
    return { boton: true, borrado: !S.cobros.some(x => x.id === c.id), saldo: saldoCliente(c.clienteId) === saldo0 + c.monto }; });
  anota('un cobro cargado por error se puede borrar', r.boton && r.borrado && r.saldo, JSON.stringify(r)); });

console.log('\nCaja, compras y ventas');
await prueba('caja: la apertura suma el efectivo de un día sin cerrar', async p => {
  const r = await ev(p, () => { S.cajas = [{ fecha: addDias(hoy(), -2), apertura: 1000, esperado: 1000, contado: 1000, dif: 0, notas: '' }];
    S.cajaMov = [{ id: sig('W'), fecha: addDias(hoy(), -1), tipo: 'Ingreso', monto: 5000, motivo: 'prueba' }];
    const ayer = addDias(hoy(), -1); const efAyer = flujoEfectivo(ayer); return { apertura: resumenCaja(hoy()).apertura, esperada: r2(1000 + efAyer) }; });
  anota('caja: la apertura suma el efectivo de un día sin cerrar', r.apertura === r.esperada && r.apertura >= 6000, JSON.stringify(r)); });
await prueba('anular una compra ya vendida avisa del stock negativo', async p => {
  const r = await ev(p, () => { const pr = S.productos.find(x => x.unidad === 'u');
    const id = crearCompra({ fecha: hoy(), proveedorId: S.proveedores[0].id, pago: 'Efectivo', ivaPct: 0, ivaRec: true, items: [{ productoId: pr.id, cant: 5, costo: 100 }] }); indexar();
    crearVenta({ items: [{ productoId: pr.id, cant: stockDe(pr.id), precio: pr.precio }], medio: 'Efectivo' }); indexar();
    ACT['compra-anular']({ dataset: { id } }); return document.querySelector('#ov').textContent; });
  anota('anular una compra ya vendida avisa del stock negativo', /ya se vendió/.test(r), r.slice(0, 120)); });
await prueba('no deja cobrar en efectivo con menos plata que el total', async p => {
  const r = await ev(p, k => { UI.vista = 'ventas'; render(); const pr = eval(k)(); UI.cart.items = [{ productoId: pr.id, cant: 1, precio: pr.precio }]; UI.cart.medio = 'Efectivo'; UI.cart.recibido = '10'; renderCart();
    const n = S.ventas.length; ACT.cobrar(); const bloq = S.ventas.length === n; UI.cart.recibido = ''; ACT.cobrar(); return { bloq, sinRecibido: S.ventas.length === n + 1 }; }, unidad.toString());
  anota('no deja cobrar en efectivo con menos plata que el total', r.bloq && r.sinRecibido, JSON.stringify(r)); });
await prueba('escanear un código que no existe avisa', async p => {
  const r = await ev(p, () => { UI.vista = 'ventas'; render(); UI.f.pos.q = '7790000000000'; ACT['pos-enter'](); return (document.querySelector('#toast') || {}).textContent || ''; });
  anota('escanear un código que no existe avisa', /no está cargado/.test(r), r || 'sin aviso'); });
await prueba('no se crean productos repetidos por mayúsculas, tildes o espacios', async p => {
  const r = await ev(p, () => { const n = S.productos[0].nombre; const out = []; for (const v of [' ' + n.toUpperCase() + '  ', n.normalize('NFD').replace(/[̀-ͯ]/g, '')]) { try { guardarProducto({ nombre: v, unidad: 'u' }, null); out.push('creado'); } catch (e) { out.push('bloqueado'); } } return out; });
  anota('no se crean productos repetidos por mayúsculas, tildes o espacios', r.every(x => x === 'bloqueado'), JSON.stringify(r)); });
await prueba('no se pasa a "por unidad" un producto con kilos con decimales', async p => {
  const r = await ev(p, () => { const pr = S.productos.find(x => x.unidad === 'kg' && stockDe(x.id) % 1); ACT['prod-edit']({ dataset: { id: pr.id } }); const f = document.querySelector('#frm'); f.elements.unidad.value = 'u'; document.querySelector('#okb').click();
    return { unidad: pr.unidad, err: (document.querySelector('#err') || {}).textContent }; });
  anota('no se pasa a "por unidad" un producto con kilos con decimales', r.unidad === 'kg' && !!r.err, JSON.stringify(r)); });

console.log('\nCorregir errores de carga');
await prueba('el carrito sigue ahí después de recargar', async p => {
  await ev(p, k => { location.hash = 'ventas'; UI.vista = 'ventas'; render(); const pr = eval(k)(); UI.cart.items = [{ productoId: pr.id, cant: 2, precio: pr.precio }]; UI.cart.medio = 'Transferencia'; renderCart(); }, unidad.toString());
  await p.reload({ waitUntil: 'networkidle0' }); await espera(200);
  const r = await ev(p, () => ({ items: UI.cart.items.length, cant: (UI.cart.items[0] || {}).cant, medio: UI.cart.medio }));
  anota('el carrito sigue ahí después de recargar', r.items === 1 && r.cant === 2 && r.medio === 'Transferencia', JSON.stringify(r)); });
await prueba('un retiro de caja cargado por error se puede borrar', async p => {
  const r = await ev(p, () => { UI.caja.fecha = hoy(); S.cajaMov.push({ id: sig('W'), fecha: hoy(), tipo: 'Retiro', monto: 999, motivo: 'error' }); UI.vista = 'caja'; render();
    const b = document.querySelector('[data-act="caja-mov-del"]'); if (!b) return { boton: false }; b.click(); document.querySelector('#yes').click(); return { boton: true, borrado: !S.cajaMov.some(m => m.monto === 999) }; });
  anota('un retiro de caja cargado por error se puede borrar', r.boton && r.borrado, JSON.stringify(r)); });
await prueba('un gasto con fecha futura pide confirmación', async p => {
  const r = await ev(p, () => { gastoForm(null); const f = document.querySelector('#frm'); f.elements.fecha.value = '2099-01-01'; f.elements.concepto.value = 'x'; f.elements.monto.value = '10';
    document.querySelector('#okb').click(); const primero = S.gastos.some(g => g.fecha === '2099-01-01'); const aviso = document.querySelector('#err').textContent;
    document.querySelector('#okb').click(); return { primero, aviso, segundo: S.gastos.some(g => g.fecha === '2099-01-01') }; });
  anota('un gasto con fecha futura pide confirmación', !r.primero && /posterior/.test(r.aviso) && r.segundo, JSON.stringify(r)); });
await prueba('clientes: sin historial se borran, con historial se archivan', async p => {
  const r = await ev(p, () => { const nuevo = { id: sig('Q'), nombre: 'Cliente sin nada', telefono: '', creado: hoy() }; S.clientes.push(nuevo); indexar();
    ACT['cli-del']({ dataset: { id: nuevo.id } }); document.querySelector('#yes').click(); const borrado = !S.clientes.some(c => c.id === nuevo.id);
    const conDeuda = S.clientes.find(c => saldoCliente(c.id) > 0); const ventas = S.ventas.filter(v => v.clienteId === conDeuda.id).length;
    ACT['cli-del']({ dataset: { id: conDeuda.id } }); const aviso = /Todavía debe/.test(document.querySelector('#ov').textContent); document.querySelector('#yes').click();
    UI.vista = 'ventas'; UI.ventasTab = 'cc'; render(); const sigueEnCC = !!document.querySelector(`[data-act="ccv-sel"][data-id="${conDeuda.id}"]`); renderCart();
    const enVenta = [...document.querySelectorAll('[data-chg="cart-cli"] option')].some(o => +o.value === conDeuda.id);
    return { borrado, archivado: !!conDeuda.archivado, aviso, ventasIntactas: S.ventas.filter(v => v.clienteId === conDeuda.id).length === ventas, sigueEnCC, enVenta }; });
  anota('clientes: sin historial se borran, con historial se archivan', r.borrado && r.archivado && r.aviso && r.ventasIntactas && r.sigueEnCC && !r.enVenta, JSON.stringify(r)); });
await prueba('corregir una compra la reemplaza y recalcula el stock', async p => {
  const r = await ev(p, () => { const pr = S.productos.find(x => x.unidad === 'u'); const s0 = stockDe(pr.id);
    const id = crearCompra({ fecha: hoy(), proveedorId: S.proveedores[0].id, pago: 'Efectivo', ivaPct: 0, ivaRec: true, items: [{ productoId: pr.id, cant: 10, costo: 100 }] }); indexar();
    ACT['compra-corregir']({ dataset: { id } }); const fila = document.querySelector('[data-k="cant"]'); fila.value = '4'; fila.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#cmpok').click(); indexar(); const orig = S.compras.find(c => c.id === id), nueva = S.compras.find(c => c.id === orig.corregidaPor);
    return { anulada: orig.estado === 'Anulada', nueva: !!nueva && nueva.corrige === id, stock: stockDe(pr.id) - s0 }; });
  anota('corregir una compra la reemplaza y recalcula el stock', r.anulada && r.nueva && r.stock === 4, JSON.stringify(r)); });
await prueba('cambiar el medio de pago de una venta', async p => {
  const r = await ev(p, k => { const pr = eval(k)(); const v = crearVenta({ items: [{ productoId: pr.id, cant: 1, precio: pr.precio }], medio: 'Efectivo' }); const c = S.clientes[0]; const s0 = saldoCliente(c.id);
    ACT['venta-medio']({ dataset: { id: v.id } }); const f = document.querySelector('#frm'); f.elements.medio.value = 'Cuenta corriente'; document.querySelector('#okb').click();
    const sinCliente = /elegí el cliente/.test(document.querySelector('#err').textContent); f.elements.cliente.value = String(c.id); document.querySelector('#okb').click();
    return { sinCliente, medio: v.medio, deuda: r2(saldoCliente(c.id) - s0) === v.total, registro: (v.cambiosMedio || []).length }; }, unidad.toString());
  anota('cambiar el medio de pago de una venta', r.sinCliente && r.medio === 'Cuenta corriente' && r.deuda && r.registro === 1, JSON.stringify(r)); });

console.log('\nSeguridad');
await prueba('nombres con código HTML no se ejecutan', async p => {
  await ev(p, () => { window.__x = 0; const n = '<img src=x onerror="window.__x++">"\'&'; guardarProducto({ nombre: n, categoria: n, unidad: 'u', costo: 1, precio: 2, minimo: 5, notas: n }, null);
    S.clientes.push({ id: sig('Q'), nombre: n, telefono: '', cuit: '', direccion: n, notas: n, creado: hoy() }); S.proveedores.push({ id: sig('V'), nombre: n, contacto: n, telefono: '', color: '#123456', notas: n });
    S.gastos.push({ id: sig('G'), fecha: hoy(), concepto: n, categoria: n, medio: 'Efectivo', monto: 1, iva: 0 }); S.config.nombre = n; indexar(); guardar(); pintarMarco(); });
  for (const v of ['panel', 'ventas', 'productos', 'inventario', 'clientes', 'proveedores', 'gastos', 'reportes', 'ajustes', 'compras']) { await ev(p, v => { location.hash = v; }, v); await espera(120); }
  await ev(p, () => { UI.ventasTab = 'cc'; UI.vista = 'ventas'; render(); ACT['prod-edit']({ dataset: { id: S.productos[S.productos.length - 1].id } }); ACT['prod-etiquetas'](); }); await espera(200);
  anota('nombres con código HTML no se ejecutan', await ev(p, () => window.__x) === 0); });

const fallas = R.filter(x => !x.ok).length;
console.log(`\n${fallas ? fallas + ' de ' + R.length + ' pruebas fallaron' : 'Las ' + R.length + ' pruebas pasaron'}\n`);
await b.close(); srv.close(); process.exit(fallas ? 1 : 0);
