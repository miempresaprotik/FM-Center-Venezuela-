const CACHE_NAME = 'fm-center-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Solo interceptamos las peticiones de los archivos MP3
    if (url.pathname.endsWith('.mp3')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                // 1. Si la canción está en el "Tanque" (Modo Offline o ya descargada)
                if (cachedResponse) {
                    // Verificamos si el celular está pidiendo el audio por pedacitos (Range Request)
                    if (event.request.headers.has('range')) {
                        return manejarPeticionRango(event.request, cachedResponse);
                    }
                    // Si es una petición normal, entregamos el archivo completo
                    return cachedResponse;
                }

                // 2. Si la canción NO está en la caché, vamos a internet (Modo Online normal)
                return fetch(event.request).then((networkResponse) => {
                    // Si la canción fue borrada o hay error 404, la dejamos pasar 
                    // para que el reproductor (index.html) salte a la siguiente
                    return networkResponse;
                }).catch((error) => {
                    // Si no hay internet y no está en caché, fallamos a propósito
                    // Esto activa la "Inteligencia" de tu index.html para buscar la siguiente en el tanque
                    throw error;
                });
            })
        );
    }
});

// Función "Mágica" para que los audios offline funcionen en iPhone y navegadores móviles
async function manejarPeticionRango(request, cachedResponse) {
    const buffer = await cachedResponse.arrayBuffer();
    const rangeHeader = request.headers.get('range');
    const bytesMatch = /bytes=(\d+)-(\d+)?/.exec(rangeHeader);

    if (!bytesMatch) return cachedResponse;

    const start = parseInt(bytesMatch[1], 10);
    const end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : buffer.byteLength - 1;
    const chunk = buffer.slice(start, end + 1);

    return new Response(chunk, {
        status: 206, // Estado HTTP 206: Contenido Parcial (Lo que esperan los móviles)
        statusText: 'Partial Content',
        headers: {
            'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunk.byteLength,
            'Content-Type': 'audio/mpeg'
        }
    });
}
