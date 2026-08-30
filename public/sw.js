// Essência V30.1 — service worker de recuperação estável.
// Mantém a instalação/PWA, mas não intercepta requisições da página.
const CACHE_PREFIX = 'essencia-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Intencionalmente sem listener de fetch.
// Assim HTML, API, Socket.IO, uploads e arquivos estáticos vêm diretamente da rede,
// evitando cache antigo ou requisição persistente segurando o carregamento.
