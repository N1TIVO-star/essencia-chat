// Essência V30 Safe — Service Worker mínimo apenas para instalação.
// Não intercepta fetch, não cria cache e não altera o carregamento da aplicação.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
