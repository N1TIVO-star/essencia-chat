// Essência V30.1 restaurada — Service Worker seguro.
// Mantém a instalação/PWA sem cachear nem interceptar requisições da aplicação.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('essencia-')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
