/**
 * ====================================================================
 * FM CENTER VENEZUELA LLANERAS - CORE ENGINE v3.0 (RADIO EN VIVO 24/7)
 * Metodología: DeepSeek Harness / Cordis (Módulos desacoplados y estado único)
 * Características:
 *  - Simulación Real de Radio FM: la emisión NUNCA se detiene.
 *  - Arranque aleatorio dinámico para cada nuevo dispositivo/oyente.
 *  - Avance en tiempo real: al pausar o salir y volver, sintoniza donde la canción va en vivo.
 *  - Ventana Deslizante de 30 Canciones en Caché Local.
 *  - Normalización unificada de URLs (espacios y caracteres especiales compatibles).
 *  - Modo Offline indestructible: no borra canciones guardadas si no hay internet.
 *  - Reproducción continua síncrona sin bloqueos de autoplay en móviles.
 * ====================================================================
 */

// Utilidad global de normalización de URLs
function normalizeUrl(url) {
    if (!url) return '';
    try {
        return new URL(url).href;
    } catch (e) {
        return encodeURI(url);
    }
}

// --- 1. MONITOR DE RED (NetworkWatcher) ---
class NetworkWatcher {
    constructor() {
        this.isOnline = navigator.onLine;
        this.listeners = [];

        window.addEventListener('online', () => {
            this.isOnline = true;
            this._notify(true);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this._notify(false);
        });
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    _notify(status) {
        console.log(`[Red] Estado cambiado: ${status ? 'ONLINE 📶' : 'OFFLINE 📡'}`);
        this.listeners.forEach(cb => {
            try { cb(status); } catch (e) { console.error('Error en listener de red:', e); }
        });
    }
}

// --- 2. GESTOR DE COLA Y ESTADO ÚNICO (QueueManager) ---
class QueueManager {
    constructor() {
        this.playlist = [];
        this.currentIndex = 0;
        this.STORAGE_INDEX_KEY = 'fm_v2_current_index';
        this.STORAGE_PLAYLIST_KEY = 'fm_v2_playlist_backup';
    }

    async load() {
        // Carga desde playlist.json con respaldo local en caso de estar offline al abrir
        try {
            const resp = await fetch('playlist.json', { cache: 'no-cache' });
            if (resp.ok) {
                const data = await resp.json();
                this.playlist = this._sanitize(data);
                localStorage.setItem(this.STORAGE_PLAYLIST_KEY, JSON.stringify(this.playlist));
            } else {
                throw new Error('Respuesta no OK de playlist.json');
            }
        } catch (e) {
            console.warn('[Queue] Usando respaldo local de playlist:', e.message);
            const backup = localStorage.getItem(this.STORAGE_PLAYLIST_KEY);
            if (backup) {
                this.playlist = this._sanitize(JSON.parse(backup));
            }
        }

        // 1. Identificador de usuario silencioso y persistente para cada navegador
        this._ensureUserId();

        // 2. Recuperar progreso previo o asignar punto de partida personalizado
        const savedIndex = localStorage.getItem(this.STORAGE_INDEX_KEY);
        const lastSavedIndex = localStorage.getItem('fm_v2_saved_index');
        const legacyIndex = localStorage.getItem('ultimo_indice');

        let indexToUse = null;
        if (savedIndex !== null && !isNaN(parseInt(savedIndex, 10))) {
            indexToUse = parseInt(savedIndex, 10);
        } else if (lastSavedIndex !== null && !isNaN(parseInt(lastSavedIndex, 10))) {
            indexToUse = parseInt(lastSavedIndex, 10);
        } else if (legacyIndex !== null && !isNaN(parseInt(legacyIndex, 10))) {
            indexToUse = parseInt(legacyIndex, 10);
        }

        if (indexToUse !== null && indexToUse >= 0 && indexToUse < this.playlist.length) {
            // Usuario recurrente: continúa exactamente en su avance histórico
            this.currentIndex = indexToUse;
            console.log(`[Usuario] Oyente recurrente (${localStorage.getItem('fm_v_id')}): sintonizado en pista ${this.currentIndex}`);
        } else {
            // 🚀 ARRANQUE ALEATORIO DINÁMICO PARA CADA DISPOSITIVO NUEVO:
            // Sintoniza como una radio real: entra en una canción aleatoria y en un segundo en progreso
            this.currentIndex = this.playlist.length > 0 ? Math.floor(Math.random() * this.playlist.length) : 0;
            const segundoInicialAleatorio = Math.floor(Math.random() * 45) + 15; // Entre 15s y 60s
            localStorage.setItem(this.STORAGE_INDEX_KEY, this.currentIndex);
            localStorage.setItem('fm_v2_saved_index', this.currentIndex);
            localStorage.setItem('fm_v2_saved_second', segundoInicialAleatorio);
            localStorage.setItem('fm_v2_saved_timestamp', Date.now());
            console.log(`[Usuario] Nuevo oyente registrado (${localStorage.getItem('fm_v_id')}): sintonizado aleatoriamente en pista ${this.currentIndex} al segundo ${segundoInicialAleatorio}s`);
        }

        console.log(`[Queue] Biblioteca lista (${this.playlist.length} canciones). Pista activa: ${this.currentIndex}`);
        return this.playlist;
    }

    _ensureUserId() {
        if (!localStorage.getItem('fm_v_id')) {
            const nuevoId = 'VIS-' + Math.floor(Math.random() * 90000 + 10000);
            localStorage.setItem('fm_v_id', nuevoId);
            return nuevoId;
        }
        return localStorage.getItem('fm_v_id');
    }

    _sanitize(list) {
        if (!Array.isArray(list)) return [];
        return list.filter(item => {
            if (!item || !item.download_url || !item.name) return false;
            // Excluir nombres sospechosos conocidos de 2 bytes
            if (item.name.startsWith('A_') || item.name.startsWith('B_') || item.name.startsWith('C_') || item.name.startsWith('D_') || item.name.startsWith('E_') || item.name.startsWith('F_') || item.name.startsWith('H_') || item.name.startsWith('L_') || item.name.startsWith('V_') || item.name.startsWith('X_')) {
                if (item.download_url.includes('miempresaprotik')) return false;
            }
            return true;
        }).map(item => ({
            name: item.name,
            download_url: normalizeUrl(item.download_url)
        }));
    }

    getCurrentTrack() {
        if (this.playlist.length === 0) return null;
        return this.playlist[this.currentIndex];
    }

    advance() {
        if (this.playlist.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        localStorage.setItem(this.STORAGE_INDEX_KEY, this.currentIndex);
        return this.getCurrentTrack();
    }

    setIndex(idx) {
        if (idx >= 0 && idx < this.playlist.length) {
            this.currentIndex = idx;
            localStorage.setItem(this.STORAGE_INDEX_KEY, this.currentIndex);
        }
    }

    /**
     * Retorna la ventana correlativa de N canciones hacia adelante
     * a partir del índice actual.
     */
    getSlidingWindow(size = 30) {
        if (this.playlist.length === 0) return [];
        const windowList = [];
        const count = Math.min(size, this.playlist.length);
        for (let i = 0; i < count; i++) {
            const idx = (this.currentIndex + i) % this.playlist.length;
            windowList.push({
                windowOffset: i, // 0 = actual, 1 = siguiente...
                playlistIndex: idx,
                track: this.playlist[idx]
            });
        }
        return windowList;
    }
}

// --- 3. MOTOR DE VENTANA DESLIZANTE DE 30 CANCIONES (BufferManager) ---
class BufferManager {
    constructor(queueManager, networkWatcher, targetSize = 30) {
        this.queue = queueManager;
        this.network = networkWatcher;
        this.targetSize = targetSize;
        this.CACHE_NAME = 'fm-center-v3';
        this.cachedUrls = new Set();
        this.isDownloading = false;
        this.listeners = [];
        this.enabled = localStorage.getItem('fm_v2_offline_pref') !== 'false'; // Activo por defecto

        // Reanudar automáticamente si regresa el internet
        this.network.onChange((isOnline) => {
            if (isOnline && this.enabled) {
                console.log('[Buffer] Internet restaurado. Reanudando llenado de ventana...');
                this.sync();
            }
        });
    }

    async setEnabled(enable) {
        this.enabled = !!enable;
        localStorage.setItem('fm_v2_offline_pref', this.enabled ? 'true' : 'false');
        if (this.enabled) {
            console.log('[Buffer] Modo sin conexión activado.');
            this.sync();
        } else {
            console.log('[Buffer] Modo sin conexión desactivado: liberando memoria.');
            if ('caches' in window) {
                try {
                    const cache = await caches.open(this.CACHE_NAME);
                    const keys = await cache.keys();
                    await Promise.all(keys.map(k => cache.delete(k)));
                    this.cachedUrls.clear();
                    this._notify('Buffer vaciado');
                } catch (e) {
                    console.warn('[Buffer] Error vaciando caché:', e);
                }
            }
        }
    }

    async init() {
        if (!('caches' in window)) return;
        try {
            const cache = await caches.open(this.CACHE_NAME);
            const requests = await cache.keys();
            this.cachedUrls = new Set(requests.map(r => normalizeUrl(r.url)));
            this._notify();
            console.log(`[Buffer] Inicializado con ${this.cachedUrls.size} canciones en caché.`);
        } catch (e) {
            console.warn('[Buffer] Error inicializando caché:', e);
        }
    }

    onUpdate(callback) {
        this.listeners.push(callback);
    }

    _notify(statusExtra = '') {
        const stats = {
            cachedCount: this.cachedUrls.size,
            targetSize: this.targetSize,
            isOnline: this.network.isOnline,
            isDownloading: this.isDownloading,
            statusExtra: statusExtra
        };
        this.listeners.forEach(cb => {
            try { cb(stats); } catch (e) {}
        });
    }

    isTrackCached(url) {
        if (!url) return false;
        return this.cachedUrls.has(normalizeUrl(url));
    }

    /**
     * Elimina del teléfono una canción reproducida para liberar memoria.
     * PROTECCIÓN OFFLINE: Si estamos sin conexión, NUNCA borramos para no agotar la música guardada.
     */
    async deleteTrack(url) {
        if (!this.network.isOnline) {
            console.log('[Buffer] Modo offline: preservando pista en memoria.');
            return;
        }
        if (!url || !('caches' in window)) return;
        const cleanUrl = normalizeUrl(url);
        try {
            const cache = await caches.open(this.CACHE_NAME);
            await cache.delete(cleanUrl, { ignoreSearch: true });
            this.cachedUrls.delete(cleanUrl);
            this._notify('Canción liberada');
            console.log('[Buffer] Pista anterior eliminada del teléfono:', cleanUrl.split('/').pop());
        } catch (e) {
            console.warn('[Buffer] Error borrando pista:', e);
        }
    }

    /**
     * Sincroniza la ventana de 30 canciones:
     * 1. Limpia cualquier pista en caché que esté por fuera de la ventana (SOLO ONLINE).
     * 2. Descarga una a una las canciones que falten dentro de la ventana de 30.
     */
    async sync() {
        if (!this.enabled || !('caches' in window)) return;
        const slidingWindow = this.queue.getSlidingWindow(this.targetSize);
        if (slidingWindow.length === 0) return;

        // Si NO hay internet, no borramos canciones ni intentamos descargas
        if (!this.network.isOnline) {
            console.log('[Buffer] Modo offline activo: descargas y limpieza preventiva en pausa.');
            this._notify();
            return;
        }

        const allowedUrls = new Set(slidingWindow.map(item => normalizeUrl(item.track.download_url)));

        // Limpieza de huérfanos SOLO ONLINE
        try {
            const cache = await caches.open(this.CACHE_NAME);
            for (const url of this.cachedUrls) {
                if (!allowedUrls.has(url)) {
                    await cache.delete(url, { ignoreSearch: true });
                    this.cachedUrls.delete(url);
                    console.log('[Buffer] Limpieza automática de pista fuera de ventana');
                }
            }
        } catch (e) {
            console.warn('[Buffer] Error en limpieza preventiva:', e);
        }

        this._notify();

        if (this.isDownloading) return;

        this._startDownloadQueue(slidingWindow);
    }

    async _startDownloadQueue(slidingWindow) {
        this.isDownloading = true;

        try {
            const cache = await caches.open(this.CACHE_NAME);

            for (const item of slidingWindow) {
                if (!this.network.isOnline) {
                    console.log('[Buffer] Conexión perdida durante la descarga. Pausando buffer...');
                    break;
                }

                const url = normalizeUrl(item.track.download_url);

                if (this.cachedUrls.has(url)) continue;

                const trackName = item.track.name.replace(/\.mp3$/i, '').replace(/_/g, ' ');
                this._notify(`Descargando (${item.windowOffset + 1}/${this.targetSize}): ${trackName.substring(0, 25)}...`);

                try {
                    const resp = await fetch(url, { mode: 'cors' });
                    if (resp && resp.ok) {
                        const blob = await resp.blob();
                        if (blob.size > 300000) {
                            const headers = new Headers({
                                'Content-Type': 'audio/mpeg',
                                'Content-Length': blob.size.toString(),
                                'Accept-Ranges': 'bytes'
                            });
                            const audioResponse = new Response(blob, {
                                status: 200,
                                statusText: 'OK',
                                headers: headers
                            });

                            await cache.put(url, audioResponse);
                            this.cachedUrls.add(url);
                            console.log(`[Buffer] Guardada en teléfono (${this.cachedUrls.size}/${this.targetSize}): ${item.track.name}`);
                        } else {
                            console.warn(`[Buffer] Archivo muy pequeño descartado (${blob.size} bytes):`, item.track.name);
                        }
                    }
                } catch (dlErr) {
                    console.warn(`[Buffer] Fallo al descargar ${item.track.name}:`, dlErr.message);
                }

                this._notify();
                await new Promise(r => setTimeout(r, 500));
            }
        } finally {
            this.isDownloading = false;
            this._notify('Buffer sincronizado');
        }
    }
}

// --- 4. MOTOR DE AUDIO (AudioEngine) ---
class AudioEngine {
    constructor(queueManager, bufferManager, networkWatcher) {
        this.queue = queueManager;
        this.buffer = bufferManager;
        this.network = networkWatcher;
        this.player = document.getElementById('player') || new Audio();
        this.isPlaying = false;
        this._isRecovering = false;
        this.wakeLock = null;
        this.volume = parseFloat(localStorage.getItem('fm_v2_volumen') || '0.8');
        this.player.volume = this.volume;

        this.onTrackChangeListeners = [];
        this.onStateChangeListeners = [];

        this._setupEvents();
    }

    _setupEvents() {
        this.player.addEventListener('playing', () => {
            this.isPlaying = true;
            this._isRecovering = false;
            this._notifyState('playing');
        });

        this.player.addEventListener('pause', () => {
            if (!this.player.ended) {
                this.isPlaying = false;
                this._notifyState('paused');
            }
        });

        // Guardar segundo exacto de la emisión para emular la radio en vivo continua
        this.player.addEventListener('timeupdate', () => {
            this._saveState();
        });

        // Al terminar una canción: Avanzar INMEDIATAMENTE y reproducir
        // REGLA DE ORO MÓVIL: No usar 'await' antes de playCurrentTrack para no romper el permiso de autoplay
        this.player.addEventListener('ended', () => {
            localStorage.removeItem('fm_v2_saved_second');
            localStorage.removeItem('fm_v2_saved_timestamp');
            const previousTrack = this.queue.getCurrentTrack();

            // 1. Síncrono e instantáneo: cambiar pista y llamar a play
            this.queue.advance();
            this.playCurrentTrack(true); // Canción nueva arranca limpia en 0s

            // 2. Tareas en segundo plano (no bloquean el hilo de audio)
            if (previousTrack) {
                this.buffer.deleteTrack(previousTrack.download_url).catch(() => {});
            }
            this.buffer.sync().catch(() => {});
        });

        // Manejo de errores resiliente
        this.player.addEventListener('error', (e) => {
            console.warn('[Audio] Error detectado en elemento de audio:', e);
            this._handlePlaybackFailure();
        });

        // Reactivar WakeLock si el usuario vuelve a la app
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (this.isPlaying) this._requestWakeLock();
            } else if (document.visibilityState === 'hidden') {
                this._saveState();
            }
        });
    }

    _handlePlaybackFailure() {
        if (this._isRecovering) return;
        this._isRecovering = true;
        this._notifyState('error');

        console.warn('[Audio] Fallo de reproducción detectado. Buscando recuperación en buffer...');

        // 1. Buscamos en la ventana hacia adelante (offset > 0) la siguiente pista disponible
        const windowTracks = this.queue.getSlidingWindow(30);
        let nextAvailable = null;

        if (!this.network.isOnline) {
            // En modo offline, buscamos estrictamente la próxima pista que SÍ esté en el caché
            nextAvailable = windowTracks.find(item => item.windowOffset > 0 && this.buffer.isTrackCached(item.track.download_url));

            // Si no está dentro de la ventana de 30 pero hay canciones en caché en la biblioteca completa
            if (!nextAvailable && this.buffer.cachedUrls.size > 0) {
                for (let i = 0; i < this.queue.playlist.length; i++) {
                    const candidateIdx = (this.queue.currentIndex + 1 + i) % this.queue.playlist.length;
                    const candTrack = this.queue.playlist[candidateIdx];
                    if (this.buffer.isTrackCached(candTrack.download_url)) {
                        nextAvailable = { playlistIndex: candidateIdx, track: candTrack };
                        break;
                    }
                }
            }
        }

        if (nextAvailable) {
            console.log(`[Audio] Saltando a la pista en caché disponible: ${nextAvailable.track.name}`);
            this.queue.setIndex(nextAvailable.playlistIndex);
        } else {
            console.log('[Audio] Avanzando correlativamente a la siguiente pista...');
            this.queue.advance();
        }

        // Continuar de inmediato sin demoras largas
        setTimeout(() => {
            this._isRecovering = false;
            this.playCurrentTrack(true);
        }, 150);
    }

    _saveState() {
        if (!this.player.paused && this.player.currentTime > 0) {
            localStorage.setItem('fm_v2_saved_index', this.queue.currentIndex);
            localStorage.setItem('fm_v2_saved_second', this.player.currentTime);
            localStorage.setItem('fm_v2_saved_timestamp', Date.now());
            if (this.player.duration && this.player.duration > 10) {
                localStorage.setItem('fm_v2_saved_duration', this.player.duration);
            }
            const cur = this.queue.getCurrentTrack();
            if (cur) localStorage.setItem('fm_v2_saved_name', cur.name);
            localStorage.setItem('fm_v2_radio_activa', 'true');
        }
    }

    /**
     * SIMULACIÓN DE RADIO EN VIVO 24/7:
     * Calcula cuántas canciones y segundos transcurrieron mientras la radio estaba
     * pausada o fuera de la app, permitiendo retomar EXACTAMENTE en el punto en vivo.
     */
    calcularProgresoEnVivo() {
        const tsSalida = parseInt(localStorage.getItem('fm_v2_saved_timestamp'), 10);
        if (!tsSalida) return { indexOffset: 0, targetSecond: 0 };

        const ahora = Date.now();
        const tiempoFueraSegundos = Math.max(0, (ahora - tsSalida) / 1000);
        if (tiempoFueraSegundos < 1) {
            const segGuardado = parseFloat(localStorage.getItem('fm_v2_saved_second')) || 0;
            return { indexOffset: 0, targetSecond: segGuardado };
        }

        const segGuardado = parseFloat(localStorage.getItem('fm_v2_saved_second')) || 0;
        const duracionGuardada = parseFloat(localStorage.getItem('fm_v2_saved_duration')) || (this.player.duration > 30 ? this.player.duration : 210);

        const tiempoRestantePista = Math.max(5, duracionGuardada - segGuardado);

        if (tiempoFueraSegundos < tiempoRestantePista) {
            // La misma canción sigue al aire en la emisora
            const targetSecond = segGuardado + tiempoFueraSegundos;
            console.log(`[Radio en Vivo] Misma canción al aire: avanzando al segundo ${targetSecond.toFixed(1)}s (tiempo transcurrido: ${tiempoFueraSegundos.toFixed(0)}s)`);
            return { indexOffset: 0, targetSecond };
        } else {
            // La canción ya terminó en el estudio mientras el oyente no escuchaba
            const tiempoDespues = tiempoFueraSegundos - tiempoRestantePista;
            const DURACION_PROMEDIO = 210; // ~3.5 minutos promedio por pista llanera
            const pistasSaltadas = 1 + Math.floor(tiempoDespues / DURACION_PROMEDIO);
            const targetSecond = tiempoDespues % DURACION_PROMEDIO;

            console.log(`[Radio en Vivo] En vivo transcurrieron ${pistasSaltadas} canciones (${tiempoFueraSegundos.toFixed(0)}s). Sintonizando pista en vivo al segundo ${targetSecond.toFixed(1)}s`);
            return { indexOffset: pistasSaltadas, targetSecond };
        }
    }

    _aplicarSegundoEnVivo(segundoObjetivo) {
        if (!segundoObjetivo || segundoObjetivo <= 0) return;

        const setTime = () => {
            try {
                if (this.player.duration && segundoObjetivo >= this.player.duration) {
                    console.log('[Radio en Vivo] Tiempo superó la pista actual, avanzando a siguiente...');
                    this.queue.advance();
                    this.playCurrentTrack(true);
                } else {
                    this.player.currentTime = segundoObjetivo;
                    console.log(`[Radio en Vivo] Emisión sincronizada con éxito en segundo: ${this.player.currentTime.toFixed(1)}s`);
                }
            } catch (e) {
                console.warn('[Radio en Vivo] Aviso al ajustar segundo en vivo:', e.message);
            }
        };

        if (this.player.readyState >= 1) {
            setTime();
        } else {
            this.player.addEventListener('loadedmetadata', setTime, { once: true });
            this.player.addEventListener('canplay', setTime, { once: true });
        }
    }

    async _requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {}
    }

    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, parseFloat(val)));
        this.player.volume = this.volume;
        localStorage.setItem('fm_v2_volumen', this.volume);
    }

    async playCurrentTrack(forzarNueva = false) {
        let segundoObjetivo = 0;

        if (!forzarNueva) {
            // Sintonización continua con la transmisión en vivo
            const liveProg = this.calcularProgresoEnVivo();
            if (liveProg.indexOffset > 0) {
                const newIdx = (this.queue.currentIndex + liveProg.indexOffset) % this.queue.playlist.length;
                this.queue.setIndex(newIdx);
            }
            segundoObjetivo = liveProg.targetSecond;
        }

        let track = this.queue.getCurrentTrack();
        if (!track) return;

        const targetUrl = normalizeUrl(track.download_url);
        this._requestWakeLock();

        const cambioPista = (this.player.src !== targetUrl);
        if (cambioPista) {
            this.player.src = targetUrl;
            this.player.load();
        }

        if (segundoObjetivo > 0) {
            this._aplicarSegundoEnVivo(segundoObjetivo);
        }

        try {
            await this.player.play();
            this.isPlaying = true;
            this._isRecovering = false;

            // Re-confirmar el segundo en vivo por si el navegador lo reinició a 0
            if (segundoObjetivo > 0 && Math.abs(this.player.currentTime - segundoObjetivo) > 3) {
                try {
                    this.player.currentTime = segundoObjetivo;
                } catch (e) {}
            }

            this._saveState();
            this._updateMediaSession(track);
            this._notifyTrack(track);
            this._notifyState('playing');
        } catch (err) {
            console.warn('[Audio] Error al reproducir pista:', err.name, err.message);
            if (err.name !== 'NotAllowedError') {
                this._handlePlaybackFailure();
            } else {
                this.isPlaying = false;
                this._notifyState('idle');
            }
        }
    }

    pause() {
        // Al apagar el receptor o pausar, guardamos la marca de tiempo exacta
        if (this.player.currentTime > 0) {
            localStorage.setItem('fm_v2_saved_index', this.queue.currentIndex);
            localStorage.setItem('fm_v2_saved_second', this.player.currentTime);
            localStorage.setItem('fm_v2_saved_timestamp', Date.now());
            if (this.player.duration && this.player.duration > 10) {
                localStorage.setItem('fm_v2_saved_duration', this.player.duration);
            }
        }
        this.player.pause();
        this.isPlaying = false;
        localStorage.setItem('fm_v2_radio_activa', 'false');
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
        this._notifyState('paused');
    }

    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            // Reanudar sintonizando en vivo con el tiempo transcurrido
            this.playCurrentTrack(false);
            this.buffer.sync();
        }
    }

    _updateMediaSession(track) {
        if ('mediaSession' in navigator) {
            const cleanTitle = track.name.replace(/\.mp3$/i, '').replace(/_/g, ' ');
            navigator.mediaSession.metadata = new MediaMetadata({
                title: cleanTitle,
                artist: "FM Center Venezuela Llaneras",
                album: "Folklore Venezolano",
                artwork: [
                    { src: 'https://raw.githubusercontent.com/miempresaprotik/FM-Center-Venezuela-/main/Imagen/Logo%20FM%20Center.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.playbackState = 'playing';

            navigator.mediaSession.setActionHandler('play', () => this.playCurrentTrack(false));
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                this.queue.advance();
                this.playCurrentTrack(true);
                this.buffer.sync();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                const prevIdx = (this.queue.currentIndex - 1 + this.queue.playlist.length) % this.queue.playlist.length;
                this.queue.setIndex(prevIdx);
                this.playCurrentTrack(true);
            });
        }
    }

    onTrackChange(cb) { this.onTrackChangeListeners.push(cb); }
    onStateChange(cb) { this.onStateChangeListeners.push(cb); }

    _notifyTrack(track) {
        this.onTrackChangeListeners.forEach(cb => { try { cb(track); } catch (e) {} });
    }

    _notifyState(state) {
        this.onStateChangeListeners.forEach(cb => { try { cb(state); } catch (e) {} });
    }

    // Locución y anuncios con ducking suave de volumen
    hablar(mensaje, animado = false) {
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();

            setTimeout(() => {
                const volOriginal = this.volume;
                this.player.volume = volOriginal * 0.15; // Reducir música al 15%

                const speech = new SpeechSynthesisUtterance(mensaje);
                speech.lang = 'es-VE';
                speech.rate = animado ? 0.95 : 0.9;
                speech.onend = () => { this.player.volume = volOriginal; };
                speech.onerror = () => { this.player.volume = volOriginal; };

                try {
                    window.speechSynthesis.speak(speech);
                } catch (err) {
                    this.player.volume = volOriginal;
                }
            }, 150);
        } catch (e) {}
    }
}

// --- 5. CONTROLADOR PRINCIPAL DE LA APLICACIÓN (AppController) ---
class FMCenterApp {
    constructor() {
        this.network = new NetworkWatcher();
        this.queue = new QueueManager();
        this.buffer = new BufferManager(this.queue, this.network, 30);
        this.audio = new AudioEngine(this.queue, this.buffer, this.network);

        this.saludos = {
            min15: ["Estás en sintonía de FM Center...", "Disfruta de la mejor Música Llanera...", "Sintonizas FM Center Venezuela Llaneras...", "La señal que recorre el llano entero...", "Siente el zapateo y el rugir del arpa...", "Desde el corazón de Venezuela..."],
            min30: ["No te apartes de nuestra señal...", "En cualquier rincón de Venezuela...", "Donde suene un cuatro...", "Canto, verso y copla...", "Tu conexión directa..."],
            min45: ["FM Center Venezuela Llaneras...", "¡Arpa, maestro!...", "Reporta tu sintonía...", "El folklore no descansa...", "Orgullo venezolano...", "Llevamos el aroma..."]
        };
        this.indicesLocucion = { min15: 0, min30: 0, min45: 0 };
    }

    async init() {
        this._bindUI();
        this.checkSyncCooldown();
        await this.queue.load();
        await this.buffer.init();

        // Al abrir la app, sincronizar en vivo el progreso transcurrido
        const liveProg = this.audio.calcularProgresoEnVivo();
        if (liveProg.indexOffset > 0) {
            const newIdx = (this.queue.currentIndex + liveProg.indexOffset) % this.queue.playlist.length;
            this.queue.setIndex(newIdx);
        }

        // Mostrar versión
        const verTag = document.getElementById('ver-tag');
        if (verTag) verTag.innerText = `V.FM 6${this.queue.playlist.length}`;

        // Iniciar reloj y locución
        this._startClock();

        // Mostrar la pista que está al aire en este momento
        const statusEl = document.getElementById('status');
        const currentTrack = this.queue.getCurrentTrack();
        if (statusEl && currentTrack) {
            const cleanName = currentTrack.name.replace(/\.mp3$/i, '').replace(/_/g, ' ');
            statusEl.innerText = `Señal sintonizada al aire:\n${cleanName}`;
        }
    }

    _bindUI() {
        const btnPlay = document.getElementById('btnPlay');
        const btnSync = document.getElementById('btnSync');
        const statusEl = document.getElementById('status');
        const cantReserva = document.getElementById('cant-reserva');
        const statusTanque = document.getElementById('status-tanque');
        const volSlider = document.getElementById('volumen');

        if (volSlider) {
            volSlider.value = this.audio.volume;
            volSlider.addEventListener('input', (e) => this.audio.setVolume(e.target.value));
        }

        if (btnPlay) {
            btnPlay.addEventListener('click', () => {
                this.audio.toggle();
            });
        }

        if (btnSync) {
            btnSync.addEventListener('click', () => {
                this.sincronizar();
            });
        }

        const toggleOffline = document.getElementById('toggleOffline');
        if (toggleOffline) {
            toggleOffline.checked = this.buffer.enabled;
            toggleOffline.addEventListener('change', (e) => {
                this.buffer.setEnabled(e.target.checked);
            });
        }

        // Guardar estado exacto al salir, minimizar o cerrar la app para emular radio continua
        window.addEventListener('beforeunload', () => this.audio._saveState());
        window.addEventListener('pagehide', () => this.audio._saveState());

        // Protección contra recargas accidentales sin conexión
        window.addEventListener('keydown', (e) => {
            if (!navigator.onLine && this.audio.isPlaying) {
                if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.metaKey && e.key === 'r')) {
                    e.preventDefault();
                    if (statusEl) {
                        const msgActual = statusEl.innerText;
                        statusEl.innerText = "⚠️ Recarga prevenida\nModo sin conexión protegido";
                        setTimeout(() => { statusEl.innerText = msgActual; }, 3000);
                    }
                }
            }
        });

        // Listener de actualización de pista
        this.audio.onTrackChange((track) => {
            if (statusEl) {
                const cleanName = track.name.replace(/\.mp3$/i, '').replace(/_/g, ' ');
                const modoTxt = this.network.isOnline ? '📻 Sonando en vivo:' : '📡 Sintonía sin conexión (Buffer):';
                statusEl.innerText = `${modoTxt}\n${cleanName}`;
            }
        });

        // Listener de estado de reproducción (play/pause/error)
        this.audio.onStateChange((state) => {
            if (btnPlay) {
                if (state === 'playing') {
                    btnPlay.disabled = false;
                    btnPlay.innerText = "⏸ PAUSAR SEÑAL";
                    btnPlay.style.background = "#008f39";
                } else if (state === 'paused') {
                    btnPlay.disabled = false;
                    btnPlay.innerText = "▶ SINTONIZAR EN VIVO";
                    btnPlay.style.background = "#003da5";
                } else if (state === 'error') {
                    btnPlay.innerText = "🔄 SINTONIZANDO...";
                } else {
                    btnPlay.innerText = "▶ SINTONIZAR EN VIVO";
                    btnPlay.style.background = "#003da5";
                }
            }
        });

        // Listener de progreso del Buffer de 30 canciones
        this.buffer.onUpdate((stats) => {
            if (cantReserva) {
                cantReserva.innerText = stats.cachedCount;
            }
            if (statusTanque) {
                statusTanque.style.display = "block";
                if (!stats.isOnline) {
                    statusTanque.innerHTML = `📡 <b>MODO OFFLINE ACTIVO:</b> ${stats.cachedCount}/30 EN MEMORIA`;
                    statusTanque.style.color = '#00ffcc';
                } else if (stats.isDownloading) {
                    statusTanque.innerHTML = `⛽ <b>LLENANDO BUFFER:</b> ${stats.cachedCount}/30 DISPONIBLES`;
                    statusTanque.style.color = '#fecb00';
                } else {
                    statusTanque.innerHTML = `✅ <b>BUFFER LISTO:</b> ${stats.cachedCount}/30 EN MEMORIA`;
                    statusTanque.style.color = '#76ff03';
                }
            }
        });

        // Listener de red
        this.network.onChange((isOnline) => {
            if (!isOnline && statusEl && this.audio.isPlaying) {
                const cur = this.queue.getCurrentTrack();
                const name = cur ? cur.name.replace(/\.mp3$/i, '').replace(/_/g, ' ') : '';
                statusEl.innerText = `📡 Señal sin conexión (Continuando en orden):\n${name}`;
            }
        });
    }

    sincronizar() {
        const btnSync = document.getElementById('btnSync');
        const statusEl = document.getElementById('status');

        localStorage.setItem('fm_v2_last_sync', Date.now());
        this.checkSyncCooldown();

        // Limpiar segundo guardado para arrancar fresca la nueva señal
        localStorage.removeItem('fm_v2_saved_second');
        localStorage.removeItem('fm_v2_saved_timestamp');

        // Si estamos sin conexión (offline), saltar a la próxima pista que REALMENTE esté en el teléfono
        if (!this.network.isOnline) {
            const windowTracks = this.queue.getSlidingWindow(30);
            let nextCached = windowTracks.find(item => item.windowOffset > 0 && this.buffer.isTrackCached(item.track.download_url));

            if (!nextCached && this.buffer.cachedUrls.size > 0) {
                for (let i = 0; i < this.queue.playlist.length; i++) {
                    const candidateIdx = (this.queue.currentIndex + 1 + i) % this.queue.playlist.length;
                    const candTrack = this.queue.playlist[candidateIdx];
                    if (this.buffer.isTrackCached(candTrack.download_url)) {
                        nextCached = { playlistIndex: candidateIdx, track: candTrack };
                        break;
                    }
                }
            }

            if (nextCached) {
                console.log(`[Sincronizar Offline] Sintonizando pista disponible en buffer: ${nextCached.track.name}`);
                this.queue.setIndex(nextCached.playlistIndex);
            } else {
                this.queue.advance();
            }
        } else {
            // Online: avanza correlativamente
            this.queue.advance();
        }

        // REGLA DE ORO MÓVIL: Iniciar reproducción INMEDIATA y SÍNCRONA
        // sin timeouts de 1500ms que provoquen bloqueos de autoplay en el navegador
        this.audio.playCurrentTrack(true);
        this.buffer.sync();
    }

    checkSyncCooldown() {
        const btnSync = document.getElementById('btnSync');
        if (!btnSync) return;

        const lastSync = parseInt(localStorage.getItem('fm_v2_last_sync'), 10);
        if (lastSync) {
            const COOLDOWN_MS = 120000; // 2 minutos (120 segundos)
            const diff = Date.now() - lastSync;
            if (diff < COOLDOWN_MS) {
                btnSync.disabled = true;
                const restante = Math.ceil((COOLDOWN_MS - diff) / 1000);
                btnSync.innerText = `SINC. BLOQUEADA (${restante}s)`;
                setTimeout(() => this.checkSyncCooldown(), 1000);
                return;
            }
        }
        btnSync.disabled = false;
        btnSync.innerText = "🔄 SINCRONIZAR SEÑAL";
    }

    _startClock() {
        setInterval(() => {
            const ahora = new Date();
            const hh = ahora.getHours(), mm = ahora.getMinutes(), ss = ahora.getSeconds();
            const dH = hh % 12 || 12, dM = mm < 10 ? '0' + mm : mm, dS = ss < 10 ? '0' + ss : ss;
            const relojEl = document.getElementById('reloj-mini');
            if (relojEl) {
                relojEl.innerText = `SISTEMA ACTIVO: ${dH}:${dM}:${dS} ${hh >= 12 ? 'PM' : 'AM'}`;
            }

            // Anuncios y saludos horarios si la radio está sonando
            if (ss === 0 && this.audio.isPlaying) {
                if (mm === 0) {
                    const hora12 = hh % 12 || 12, parteDia = hh >= 12 ? 'de la tarde' : 'de la mañana';
                    this.audio.hablar(`En FM Center, son las ${hora12}, ${hora12} ${parteDia}`);
                } else if ([15, 30, 45].includes(mm)) {
                    const clave = `min${mm}`;
                    const lista = this.saludos[clave];
                    if (lista) {
                        this.audio.hablar(lista[this.indicesLocucion[clave]], true);
                        this.indicesLocucion[clave] = (this.indicesLocucion[clave] + 1) % lista.length;
                    }
                }
            }
        }, 1000);
    }
}

// Inicialización global
window.FMCenter = new FMCenterApp();
window.addEventListener('DOMContentLoaded', () => {
    window.FMCenter.init();
});
