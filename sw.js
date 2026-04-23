const CACHE_NAME = 'fm-center-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Interceptamos las peticiones de los archivos MP3
    if (url.pathname.endsWith('.mp3') || event.request.url.includes('.mp3')) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                // 1. Si la canción pedida ESTÁ en el tanque (Modo Offline o ya descargada)
                if (cachedResponse) {
                    // Verificamos si el celular está pidiendo en pedacitos
                    if (event.request.headers.has('range')) {
                        return manejarPeticionRango(event.request, cachedResponse);
                    }
                    return cachedResponse;
                }

                // 2. Si NO está en caché, intentamos descargarla de internet (Modo Online)
                return fetch(event.request).then((networkResponse) => {
                    return networkResponse;
                }).catch(() => {
                    // 3. 🚨 EMERGENCIA: Falló el internet (Falso Internet / Caída de red)
                    // AQUÍ VOLVEMOS A TU LÓGICA ORIGINAL: Buscamos CUALQUIERA del tanque
                    return caches.open(CACHE_NAME).then((cache) => {
                        return cache.keys().then((keys) => {
                            if (keys.length > 0) {
                                // Elegimos una canción de reserva al azar
                                return cache.match(keys[Math.floor(Math.random() * keys.length)]).then(randomResponse => {
                                    // IMPORTANTE: Le aplicamos el soporte para móviles a esta canción de reserva
                                    if (event.request.headers.has('range')) {
                                        return manejarPeticionRango(event.request, randomResponse);
                                    }
                                    return randomResponse;
                                });
                            } else {
                                // Si el tanque también está vacío, fallamos para que el frontend decida
                                throw new Error("Sin internet y tanque vacío");
                            }
                        });
                    });
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
