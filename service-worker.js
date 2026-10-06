const CACHE_NAME='eoreuni-story-v2';
const APP_SHELL=[
  './','./index.html','./manifest.webmanifest','./css/styles.css','./css/mobile-fix.css','./css/night.css',
  './js/app.js','./js/ai-voice.js','./js/recorder.js','./js/creator-config.js','./js/creator.js','./js/creator-music.js','./js/muni-library.js','./js/hud.js','./js/eaim-auto-recorder.js','./js/reels.js','./js/vendor/jszip.min.js','./js/pwa.js','./js/adult-story.js','./js/language.js','./js/firebase-sync.js',
  './assets/guide.png','./assets/guide-listen.png','./icons/icon-192.png','./icons/icon-512.png',
  './assets/bgm/moonlit-forest-path.mp3','./assets/bgm/little-brave-hero.mp3',
  './assets/bgm/the-secret-in-the-box.mp3','./assets/bgm/starry-night-journey.mp3',
  './assets/bgm/sunny-bunny-trail.mp3','./assets/bgm/pudding-parade.mp3',
  './assets/bgm/moonlit-pillow-song.mp3'
];

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event=>{
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy)).catch(()=>{});
      return response;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match('./index.html')))
  );
});
