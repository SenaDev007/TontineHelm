/* TontiHelm — service worker offline-first (patron Academia Helm, adapté).
 *
 * Rôle : rendre le site vitrine ET l'application consultables sans réseau.
 *   · pages HTML (/, pages légales) : NetworkFirst avec repli sur le cache —
 *     en ligne on sert toujours la version fraîche, hors ligne la dernière visitée ;
 *   · chunks /_next/static : CacheFirst (immuables, jamais purgés) ;
 *   · images et logos : CacheFirst ;
 *   · appels API (cross-origin) : NON interceptés — gérés par la couche
 *     applicative (cache IndexedDB + file d'envoi), qui seule connaît
 *     l'identité et les en-têtes d'autorisation.
 * Les navigations vers des routes jamais visitées retombent sur la racine cachée.
 */
"use strict";

const VERSION = "tth-v1";
const PAGES_CACHE = "tth-pages-v1"; // HTML persistant
const STATIC_CACHE = "tth-static-v1"; // chunks immuables
const ASSETS_CACHE = "tth-assets-v1"; // images, logos, captures

const PRECACHE_PAGES = [
  "/",
  "/conditions-utilisation",
  "/confidentialite",
  "/mentions-legales",
];

const PRECACHE_ASSETS = [
  "/manifest.webmanifest",
  "/logo-tontihelm/logo-TontiHelm1.svg",
  "/logo-tontihelm/logo-TontiHelm-nom%20droite1.png",
  "/logo-tontihelm/logo-TontiHelm-nom%20bas1.png",
  "/Background%20desktop.png",
  "/Background%20mobile.png",
  "/app-screens/screen-tour.png",
  "/app-screens/screen-collect.png",
  "/app-screens/screen-dashboard.png",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon-32.png",
  "/apple-touch-icon.png",
];

function isAsset(pathname) {
  return (
    pathname.startsWith("/app-screens/") ||
    pathname.startsWith("/logo-tontihelm/") ||
    /\.(png|svg|webp|jpg|jpeg|ico|woff2?)$/i.test(pathname)
  );
}

async function precache() {
  const pages = await caches.open(PAGES_CACHE);
  await Promise.all(
    PRECACHE_PAGES.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        // Seule une 200 non redirigée est cachée (anti-empoisonnement).
        if (res.ok && res.type !== "opaqueredirect") await pages.put(url, res);
      } catch {
        /* hors ligne à l'installation : la page sera cachée à la première visite */
      }
    })
  );
  const assets = await caches.open(ASSETS_CACHE);
  await Promise.all(
    PRECACHE_ASSETS.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: "reload" }));
        if (res.ok) await assets.put(url, res);
      } catch {
        /* idem */
      }
    })
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    return new Response("", { status: 503, statusText: "Offline" });
  }
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Route jamais visitée : retomber sur la racine (l'application est un
    // composant client qui gère ensuite ses vues et son cache de données).
    const root = await cache.match("/");
    if (root) return root;
    return new Response(
      "<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>TontiHelm — hors ligne</title></head><body style=\"font-family:system-ui;padding:2rem;text-align:center\"><h1>Hors ligne</h1><p>Cette page n'a pas encore été visitée. Réessaie au retour du réseau.</p></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("tth-") && !k.endsWith("-v1")).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // mutations : couche applicative
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API cross-origin : couche applicative
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (isAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS_CACHE));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }
  // Tout le reste (RSC, données de développement) : comportement normal.
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
