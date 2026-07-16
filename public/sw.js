// Service worker do portal do paciente — só cacheia o "invólucro" estático da
// app (HTML/CSS/JS/ícones), para abrir instantaneamente mesmo em rede lenta.
// Não intercepta pedidos ao Supabase (dados vêm sempre da rede nesta fase —
// cache de dados/offline de escrita fica para uma fase futura, ver plano).
//
// Ao alterar ficheiros desta lista (ou o próprio sw.js), sobe a versão abaixo
// — isso força a limpeza da cache antiga e os clientes voltam a descarregar
// tudo na próxima visita.
const CACHE_NAME = 'cachosnutri-shell-v2';
const PRECACHE_URLS = [
  '/portal.html',
  '/manifest.json',
  '/css/style.css',
  '/js/shared.js',
  '/js/portal.js',
  '/js/supabase-client.js',
  '/img/fav.png',
  '/img/fav.ico',
  '/img/icon-pwa-192.jpeg',
  '/img/icon-pwa-512.jpeg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Só GET, e só do próprio site — a API do Supabase (heninsfwxfnbyngnqbnw.supabase.co)
  // e os scripts de CDN (jsdelivr, fonts) passam sempre direto para a rede.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      });
    })
  );
});
