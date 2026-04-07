const CACHE_NAME = 'fm-center-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('.mp3') || event.request.url.includes('raw.githubusercontent')) {
        event.respondWith(
            // Intentamos buscar en el caché primero para el audio
            caches.match(event.request).then((response) => {
                if (response) return response; // Si está en el tanque, directo al reproductor
                
                return fetch(event.request).catch(() => {
                    // Si falla el fetch y no hay caché, devolvemos un error silencioso
                    return new Response('', { status: 404, statusText: 'Offline' });
                });
            })
        );
    }
});
