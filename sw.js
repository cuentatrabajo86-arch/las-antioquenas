/* ===========================================================
   NEXBIT — Service Worker
   Hace que la app abra sin internet y avisa cuando hay versión nueva.

   IMPORTANTE: cada vez que subas un index.html nuevo, súbele el
   número a VERSION (v1 -> v2 -> v3...). Eso obliga a todos los
   celulares a bajar la versión nueva. Si no lo cambias, algunos
   clientes seguirán viendo la app vieja.
   =========================================================== */

const VERSION = 'nexbit-v24';
const SHELL   = VERSION + '-shell';   // la app
const EXTERNO = VERSION + '-externo'; // fuentes y librerías

/* Lo mínimo para que la app abra sin señal */
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

/* Librerías de terceros: se guardan al vuelo la primera vez con internet */
const CDN = [
  'https://cdnjs.cloudflare.com',
  'https://www.gstatic.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

/* Firestore NUNCA se cachea: siempre debe hablar con el servidor.
   Si no hay señal, el propio Firebase guarda los cambios y los sube después. */
const NUNCA_CACHE = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'google-analytics.com'
];

const esCDN     = url => CDN.some(d => url.startsWith(d));
const esProhibido = url => NUNCA_CACHE.some(d => url.indexOf(d) !== -1);

/* ---------- INSTALAR: guardar la app ---------- */
self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(ARCHIVOS))
      .catch(() => {})          // si falla algo, no bloquea la instalación
      .then(() => self.skipWaiting())
  );
});

/* ---------- ACTIVAR: borrar versiones viejas ---------- */
self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(claves => Promise.all(
        claves.filter(k => k.indexOf(VERSION) !== 0)
              .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- PEDIDOS ---------- */
self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = req.url;
  if (esProhibido(url)) return;                    // Firestore pasa derecho
  if (!url.startsWith('http')) return;

  /* La app: primero internet (para que las actualizaciones lleguen de una),
     y si no hay señal, la copia guardada. */
  const esLaApp = req.mode === 'navigate' ||
                  (req.destination === 'document') ||
                  url.indexOf('index.html') !== -1;

  if (esLaApp) {
    ev.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(SHELL).then(c => c.put('./index.html', copia)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('./index.html')
            .then(r => r || caches.match('./'))
            .then(r => r || new Response(
              '<h1 style="font-family:sans-serif;padding:40px">Sin internet</h1>' +
              '<p style="font-family:sans-serif;padding:0 40px">Abre la app una vez con señal para poder usarla sin internet.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ))
        )
    );
    return;
  }

  /* Fuentes y librerías: primero la copia guardada (cargan al instante),
     y si no está, se baja y se guarda. */
  if (esCDN(url)) {
    ev.respondWith(
      caches.match(req).then(guardado => {
        if (guardado) return guardado;
        return fetch(req).then(res => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(EXTERNO).then(c => c.put(req, copia)).catch(() => {});
          }
          return res;
        }).catch(() => guardado);
      })
    );
  }
});

/* ---------- Permite que la app fuerce la actualización ---------- */
self.addEventListener('message', ev => {
  if (ev.data === 'ACTUALIZAR_YA') self.skipWaiting();
});
