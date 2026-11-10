const CACHE_NAME = 'tricolor-cache-v4';
const ARCHIVOS_BASE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './firebase-bundle.js',
  './xlsx.full.min.js'
];
const LIBRERIAS = ['firebase-bundle.js', 'xlsx.full.min.js'];
const ESPERA_RED_MS = 3000; // con señal débil, a los 3 segundos se usa la copia guardada

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ARCHIVOS_BASE.map((archivo) => cache.add(archivo).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Librerías e íconos: se usa la copia guardada y se actualiza en segundo plano
async function copiaPrimero(peticion) {
  const cache = await caches.open(CACHE_NAME);
  const guardado = await cache.match(peticion);
  const enRed = fetch(peticion).then((resp) => {
    if (resp && resp.ok) cache.put(peticion, resp.clone());
    return resp;
  });
  if (guardado) { enRed.catch(() => {}); return guardado; }
  return enRed;
}

// Página: si hay red rápida trae lo último; si no hay o tarda, usa la copia guardada
async function redPrimero(peticion) {
  const cache = await caches.open(CACHE_NAME);
  const enRed = fetch(peticion.url, { cache: 'no-cache' }).then((resp) => {
    if (resp && resp.ok) cache.put(peticion, resp.clone());
    return resp;
  });
  try {
    return await Promise.race([
      enRed,
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ESPERA_RED_MS))
    ]);
  } catch (error) {
    const guardado = (await cache.match(peticion, { ignoreSearch: true })) ||
      (peticion.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    if (guardado) { enRed.catch(() => {}); return guardado; }
    return enRed; // sin copia guardada no queda otra que esperar a la red
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  const nombre = url.pathname.split('/').pop();
  if (LIBRERIAS.includes(nombre) || /\.(png|ico)$/.test(nombre)) {
    evento.respondWith(copiaPrimero(peticion));
  } else {
    evento.respondWith(redPrimero(peticion));
  }
});
