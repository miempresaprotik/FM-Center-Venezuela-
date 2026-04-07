const CACHE_NAME = 'fm-center-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('.mp3')) {
        event.respondWith(
            // El secreto: ignoreSearch permite encontrar el MP3 aunque cambie la URL
            caches.match(event.request, { ignoreSearch: true }).then((response) => {
                if (response) return response;
                
                return fetch(event.request).catch(() => {
                    // Si falla internet, buscamos CUALQUIER canción del tanque para no dejar silencio
                    return caches.open(CACHE_NAME).then((cache) => {
                        return cache.keys().then((keys) => {
                            if (keys.length > 0) {
                                return cache.match(keys[Math.floor(Math.random() * keys.length)]);
                            }
                        });
                    });
                });
            })
        );
    }
});
