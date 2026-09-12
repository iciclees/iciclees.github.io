const CACHE_NAME = "phase-o-matic-v1";
const APP_SHELL = [
	"./",
	"./index.html",
	"./styles.css",
	"./script.js",
	"./manifest.json",
	"./icon/pom-72.png",
	"./icon/pom-128.png",
	"./icon/pom-144.png",
	"./icon/pom-192.png",
	"./icon/pom-512.png",
	"./icon/pom-masked-192.png",
	"./icon/pom-masked-512.png"
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then((cache) => cache.addAll(APP_SHELL))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys()
			.then((cacheNames) => Promise.all(
				cacheNames
					.filter((cacheName) => cacheName !== CACHE_NAME)
					.map((cacheName) => caches.delete(cacheName))
			))
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	if (event.request.mode === "navigate") {
		event.respondWith(
			fetch(event.request).catch(() => caches.match("./index.html"))
		);
		return;
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) return cachedResponse;
			return fetch(event.request);
		})
	);
});