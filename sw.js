// Archivo: sw.js
const CACHE_NAME = 'fm-center-v1';

// Instalación rápida
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// El secreto está aquí: Interceptar la petición de música
self.addEventListener('fetch', (event) => {
    // Solo interceptamos archivos de audio o peticiones de GitHub
    if (event.request.url.includes('.mp3') || event.request.url.includes('raw.githubusercontent')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                // Si está en la "Lista Disponible" (caché), lo devuelve instantáneamente
                // Si no está, lo busca en internet
                return response || fetch(event.request);
            })
        );
    }
});
