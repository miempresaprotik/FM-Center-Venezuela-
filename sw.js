const CACHE_NAME = 'fm-center-v2';
const APP_CACHE = 'fm-appshell-v2';

const APP_SHELL_FILES = [
    './',
    './index.html',
    './playlist.json',
    './js/engine.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_CACHE)
            .then(cache => cache.addAll(APP_SHELL_FILES))
            .catch(err => console.warn('App shell precache partial warning:', err))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME && name !== APP_CACHE) {
                        console.log('SW: Eliminando caché obsoleta:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Archivos propios de la app (HTML, JS, JSON): Network-First con fallback a caché
    if (url.origin === self.location.origin && !url.pathname.includes('.mp3')) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok) {
                        const clone = networkResponse.clone();
                        caches.open(APP_CACHE).then(c => c.put(event.request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 2. Archivos de audio MP3 (Desde GitHub o cualquier CDN)
    if (url.pathname.endsWith('.mp3') || event.request.url.includes('.mp3')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                // Buscamos si la pista exacta ya está en el buffer
                const cachedResponse = await cache.match(event.request, { ignoreSearch: true });

                if (cachedResponse) {
                    // Si el celular solicita rango (pedacitos de audio para reproducir)
                    if (event.request.headers.has('range')) {
                        return manejarPeticionRango(event.request, cachedResponse);
                    }
                    return cachedResponse;
                }

                // Si NO está en caché, intentamos obtenerla de la red
                try {
                    const networkResponse = await fetch(event.request);
                    return networkResponse;
                } catch (networkError) {
                    // ⚠️ Sin conexión y la pista no está en caché:
                    // Respondemos 503 limpio para que el AudioEngine salte a la siguiente
                    // pista correlativa que SÍ esté en el buffer, ¡sin inventar pistas fantasmas!
                    return new Response('Pista no disponible en buffer offline', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
            })
        );
    }
});

// Soporte robusto de HTTP 206 Partial Content para móviles (Android / iOS / WebViews)
async function manejarPeticionRango(request, cachedResponse) {
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) return cachedResponse;

    try {
        const buffer = await cachedResponse.arrayBuffer();
        const total = buffer.byteLength;
        const bytesMatch = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);

        if (!bytesMatch) return cachedResponse;

        const start = parseInt(bytesMatch[1], 10);
        const end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : total - 1;

        if (start >= total || end >= total) {
            return new Response(null, {
                status: 416,
                statusText: 'Range Not Satisfiable',
                headers: { 'Content-Range': `bytes */${total}` }
            });
        }

        const chunk = buffer.slice(start, end + 1);

        return new Response(chunk, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunk.byteLength.toString(),
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e) {
        return cachedResponse;
    }
}
