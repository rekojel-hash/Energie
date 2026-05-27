const CACHE_NAME='energie-v6';
const PRECACHE_URLS=[
 './',
 './index.html',
 './app.js',
 './manifest.json',
 './icon-192.png',
 './icon-512.png'
];

self.addEventListener('install',e=>{
 e.waitUntil(
  caches.open(CACHE_NAME)
  .then(c=>c.addAll(PRECACHE_URLS))
  .then(()=>self.skipWaiting())
 );
});

self.addEventListener('activate',e=>{
 e.waitUntil(
  caches.keys().then(keys=>Promise.all(
   keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim())
 );
});

self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET') return;
 e.respondWith(
  caches.match(e.request).then(cached=>{
   return cached || fetch(e.request)
    .then(r=>{
      const copy=r.clone();
      caches.open(CACHE_NAME).then(c=>c.put(e.request,copy));
      return r;
    })
    .catch(()=>caches.match('./index.html'));
  })
 );
});
