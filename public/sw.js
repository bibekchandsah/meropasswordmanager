const CACHE_NAME = 'meropasswordmanager-cache-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Add necessary files to be cached here. 
      // Do not cache sensitive user data or API calls,
      // just static app shell resources.
      cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  // Ignore API/Firestore requests
  if (event.request.url.includes('firestore.googleapis.com')) return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // If it's a navigation request and it fails, return the offline app shell
      if (event.request.mode === 'navigate') {
        const offlinePage = await cache.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;
      }
      return new Response('Network error and no cache match', {
        status: 408,
        headers: { 'Content-Type': 'text/plain' },
      });
    })
  );
});