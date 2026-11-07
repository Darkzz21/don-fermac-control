/* La app antes se publicaba en la raíz y dejaba un service worker acá.
   Este lo reemplaza y se da de baja, para que la raíz muestre la landing.
   No borra cachés: la app en /app usa el mismo nombre de caché para funcionar sin internet. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
