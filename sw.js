// Archivo: sw.js
const CACHE_NAME = 'fm-center-v1';

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
