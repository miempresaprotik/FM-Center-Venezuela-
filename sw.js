self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('.mp3')) {
        event.respondWith(
            // El truco está en 'ignoreSearch: true'
            // Esto hace que si guardaste "cancion.mp3?id=1", 
            // el sistema la encuentre aunque ahora pida "cancion.mp3?id=2"
            caches.match(event.request, { ignoreSearch: true }).then((response) => {
                if (response) return response; 
                
                return fetch(event.request).catch(() => {
                    // AQUÍ es donde el SW le dice al HTML: "Usa el tanque"
                    // Si no encontró la canción exacta, podríamos incluso devolver
                    // la primera que encuentre en el caché para que nunca haya silencio.
                    return caches.open(CACHE_NAME).then((cache) => {
                        return cache.keys().then((keys) => {
                            if (keys.length > 0) return cache.match(keys[0]);
                        });
                    });
                });
            })
        );
    }
});
