const CACHE_NAME = 'fm-center-v3';
const APP_CACHE = 'fm-appshell-v3';

const APP_SHELL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './playlist.json',
    './js/engine.js',
    './Imagen/Logo%20FM%20Center.png'
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
                // Probamos por event.request, URL normalizada y decodificada
                let cachedResponse = await cache.match(event.request, { ignoreSearch: true });
                if (!cachedResponse) {
                    cachedResponse = await cache.match(event.request.url, { ignoreSearch: true });
                }
                if (!cachedResponse) {
                    try {
                        const decoded = decodeURI(event.request.url);
                        cachedResponse = await cache.match(decoded, { ignoreSearch: true });
                    } catch (e) {}
                }

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
                    // Respondemos 503 limpio para que el AudioEngine salte a la siguiente pista correlativa disponible
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

// Soporte robusto y eficiente de HTTP 206 Partial Content para móviles (Android / iOS / WebViews)
// Usamos Blob.slice para evitar consumo excesivo de memoria RAM
async function manejarPeticionRango(request, cachedResponse) {
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) return cachedResponse;

    try {
        const blob = await cachedResponse.blob();
        const total = blob.size;
        const bytesMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader);

        if (!bytesMatch) {
            return new Response(blob, {
                status: 200,
                statusText: 'OK',
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Content-Length': total.toString(),
                    'Accept-Ranges': 'bytes'
                }
            });
        }

        let start = bytesMatch[1] ? parseInt(bytesMatch[1], 10) : 0;
        let end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : total - 1;

        if (isNaN(start)) start = 0;
        if (isNaN(end) || end >= total) end = total - 1;

        if (start >= total || start > end) {
            return new Response(null, {
                status: 416,
                statusText: 'Range Not Satisfiable',
                headers: { 'Content-Range': `bytes */${total}` }
            });
        }

        const chunk = blob.slice(start, end + 1, 'audio/mpeg');

        return new Response(chunk, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunk.size.toString(),
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'public, max-age=31536000'
            }
        });
    } catch (e) {
        console.warn('Error en peticion de rango:', e);
        return new Response('Error procesando rango de audio', { status: 500 });
    }
}
