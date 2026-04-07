self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Si está en la caché, lo devuelve. Si no, lo busca en internet.
            return response || fetch(event.request);
        })
    );
});
