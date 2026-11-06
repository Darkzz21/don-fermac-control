/* Gestia: guarda la app para que abra sin internet. Los datos siguen en el navegador. */
const CACHE='gestia-v6';
const ARCHIVOS=['./','./index.html','./styles.css','./core.js','./sample.js','./ui.js','./views.js','./comprobantes.js','./etiquetas.js','./archivos.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ARCHIVOS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ const r=e.request; if(r.method!=='GET') return;
  e.respondWith(fetch(r).then(res=>{ if(res.ok&&new URL(r.url).origin===location.origin){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(r,cp)); } return res; }).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html')))); });
