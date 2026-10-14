// ===== 热更 Service Worker =====
// 作用：把"下载到本地缓存里的新文件"优先返回给页面，没有的照常走网络（也就是包里的原文件）。
// 只接管本应用自己的 GET 请求；跨域（比如服务器 API）一律放行。
// 缓存名固定，内容由 hot-update.js 维护；清单本身（res-manifest.json）永远走包里那份。
const CACHE = 'pokeidle-hot';
const MANIFEST_KEY = '/__hot__.json';   // 已应用的 { 相对路径: hash }

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 热更清单里记了哪些路径：SW 每次请求都要看它，所以放内存里缓存一下，收到消息再刷新
let applied = null;
let appliedAt = 0;
async function loadApplied() {
  if (applied && Date.now() - appliedAt < 5000) return applied;
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(MANIFEST_KEY);
    applied = res ? await res.json() : {};
    appliedAt = Date.now();
  } catch (_) { applied = {}; }
  return applied;
}
self.addEventListener('message', (e) => { if (e.data === 'pokeidle-hot-refresh') { applied = null; } });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;      // 外部请求（服务器 API 等）不碰
  e.respondWith(serve(req, url));
});

async function serve(req, url) {
  try {
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel && rel !== 'res-manifest.json' && !rel.startsWith('__hot__')) {
      const map = await loadApplied();
      if (map && map[rel]) {
        const hit = await (await caches.open(CACHE)).match(`${self.location.origin}/${rel}`);
        if (hit) return hit;
      }
    }
  } catch (_) { /* 出错就当没有热更，正常走网络 */ }
  return fetch(req);
}
