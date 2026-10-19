module.exports = [
"[project]/src/lib/offline/idb.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "cacheClear",
    ()=>cacheClear,
    "cacheDelete",
    ()=>cacheDelete,
    "cacheGet",
    ()=>cacheGet,
    "cachePut",
    ()=>cachePut,
    "metaGet",
    ()=>metaGet,
    "metaSet",
    ()=>metaSet,
    "offlineStorageAvailable",
    ()=>offlineStorageAvailable,
    "outboxAdd",
    ()=>outboxAdd,
    "outboxAll",
    ()=>outboxAll,
    "outboxClear",
    ()=>outboxClear,
    "outboxClearFailed",
    ()=>outboxClearFailed,
    "outboxCounts",
    ()=>outboxCounts,
    "outboxDelete",
    ()=>outboxDelete,
    "outboxUpdate",
    ()=>outboxUpdate
]);
// TontiHelm — couche IndexedDB minimale (aucune dépendance) pour le mode hors ligne,
// inspirée du patron offline-first d'Academia Helm :
//   · response_cache : miroir local des réponses GET (lecture hors réseau) ;
//   · outbox         : file des mutations réalisées hors ligne (replay exact) ;
//   · meta           : horodatages (dernière synchronisation).
const DB_NAME = "tontihelm-offline";
const DB_VERSION = 1;
let dbPromise = null;
function openDb() {
    if (typeof indexedDB === "undefined") {
        return Promise.reject(new Error("IndexedDB indisponible"));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject)=>{
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = ()=>{
            const db = req.result;
            if (!db.objectStoreNames.contains("response_cache")) {
                const store = db.createObjectStore("response_cache", {
                    keyPath: "key"
                });
                store.createIndex("scope", "scope", {
                    unique: false
                });
            }
            if (!db.objectStoreNames.contains("outbox")) {
                const store = db.createObjectStore("outbox", {
                    keyPath: "id"
                });
                store.createIndex("status", "status", {
                    unique: false
                });
                store.createIndex("createdAt", "createdAt", {
                    unique: false
                });
            }
            if (!db.objectStoreNames.contains("meta")) {
                db.createObjectStore("meta", {
                    keyPath: "key"
                });
            }
        };
        req.onsuccess = ()=>resolve(req.result);
        req.onerror = ()=>reject(req.error);
    });
    return dbPromise;
}
/** Exécute une transaction et renvoie le résultat de la requête (ou void). */ function withStore(storeName, mode, fn) {
    return openDb().then((db)=>new Promise((resolve, reject)=>{
            const t = db.transaction(storeName, mode);
            const store = t.objectStore(storeName);
            let request = null;
            try {
                request = fn(store);
            } catch (err) {
                reject(err);
                return;
            }
            t.oncomplete = ()=>resolve(request ? request.result : undefined);
            t.onerror = ()=>reject(t.error);
            t.onabort = ()=>reject(t.error);
        }));
}
async function cacheGet(key) {
    const entry = await withStore("response_cache", "readonly", (s)=>s.get(key));
    if (!entry) return undefined;
    // Une entrée périmée reste utilisable hors ligne (données au dernier état connu),
    // mais on la retire silencieusement si on est en ligne pour privilégier le réseau.
    return entry;
}
async function cachePut(entry) {
    await withStore("response_cache", "readwrite", (s)=>s.put(entry));
}
async function cacheDelete(key) {
    await withStore("response_cache", "readwrite", (s)=>s["delete"](key));
}
async function cacheClear() {
    await withStore("response_cache", "readwrite", (s)=>s.clear());
}
async function outboxAdd(entry) {
    await withStore("outbox", "readwrite", (s)=>s.put(entry));
}
async function outboxAll() {
    const entries = await withStore("outbox", "readonly", (s)=>s.getAll());
    return (entries ?? []).sort((a, b)=>a.createdAt - b.createdAt);
}
async function outboxUpdate(entry) {
    await withStore("outbox", "readwrite", (s)=>s.put(entry));
}
async function outboxDelete(id) {
    await withStore("outbox", "readwrite", (s)=>s["delete"](id));
}
async function outboxCounts() {
    const entries = await withStore("outbox", "readonly", (s)=>s.getAll());
    let pending = 0;
    let failed = 0;
    for (const e of entries ?? []){
        if (e.status === "PENDING") pending += 1;
        else if (e.status === "FAILED") failed += 1;
    }
    return {
        pending,
        failed
    };
}
async function outboxClearFailed() {
    const entries = await outboxAll();
    await Promise.all(entries.filter((e)=>e.status === "FAILED").map((e)=>outboxDelete(e.id)));
}
async function outboxClear() {
    await withStore("outbox", "readwrite", (s)=>s.clear());
}
async function metaGet(key) {
    const row = await withStore("meta", "readonly", (s)=>s.get(key));
    return row?.value;
}
async function metaSet(key, value) {
    await withStore("meta", "readwrite", (s)=>s.put({
            key,
            value
        }));
}
function offlineStorageAvailable() {
    return typeof indexedDB !== "undefined";
}
}),
"[project]/src/lib/client.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "ApiClientError",
    ()=>ApiClientError,
    "OFFLINE_QUEUED",
    ()=>OFFLINE_QUEUED,
    "api",
    ()=>api,
    "apiUrl",
    ()=>apiUrl,
    "clearOfflineData",
    ()=>clearOfflineData,
    "downloadFile",
    ()=>downloadFile,
    "get",
    ()=>get,
    "getToken",
    ()=>getToken,
    "isOfflineQueued",
    ()=>isOfflineQueued,
    "post",
    ()=>post,
    "setToken",
    ()=>setToken
]);
// TontiHelm — client API côté navigateur : erreurs au format unique (code + message français).
// Deux modes d'adressage :
//   · production : NEXT_PUBLIC_API_URL pointe vers l'API Railway (domains Vercel ↔ Railway distincts) ;
//   · préproduction sandbox : requêtes relatives via la passerelle, port du backend
//     transmis par le paramètre XTransformPort.
// Authentification : jeton de session en en-tête Authorization Bearer (fonctionne sur
// tous les domaines), cookie httpOnly conservé en renfort.
//
// Couche offline-first (patron Academia Helm, adapté) :
//   · GET  : réseau d'abord, écriture dans le cache IndexedDB ; panne réseau →
//           réponse servie depuis le cache (dernier état connu) ;
//   · mutations : réseau d'abord (20 s) ; panne réseau → mise en file (outbox)
//           et réponse fabriquée { __offlineQueued: true } — l'interface continue,
//           le moteur de synchronisation rejoue la requête au retour du réseau.
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/offline/idb.ts [app-ssr] (ecmascript)");
"use client";
;
const API_PORT = process.env.NEXT_PUBLIC_API_PORT ?? "3001";
const TOKEN_KEY = "tontihelm_token";
const OFFLINE_QUEUED = "__offlineQueued";
function isOfflineQueued(res) {
    return typeof res === "object" && res !== null && res[OFFLINE_QUEUED] === true;
}
class ApiClientError extends Error {
    code;
    constructor(message, code = "error"){
        super(message);
        this.code = code;
    }
}
function apiUrl(path) {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (base) return `${base.replace(/\/$/, "")}${path}`;
    return `${path}${path.includes("?") ? "&" : "?"}XTransformPort=${API_PORT}`;
}
function setToken(token) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function getToken() {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
}
/* ── Routes jamais mises en file hors ligne ─────────────────────────────────
 * auth        : la session doit exister côté serveur avant tout ;
 * agent/sync  : c'est elle-même le mécanisme de vidage de l'outbox agent ;
 * register    : pièce justificative lourde, validation métier immédiate ;
 * payments    : un lien de paiement doit être créé en ligne réelle. */ const NEVER_QUEUE = [
    /^\/api\/auth\//,
    /^\/api\/agent\/sync/,
    /^\/api\/structures\/register/,
    /^\/api\/payments\//
];
/** Durée de fraîcheur du cache GET (hors ligne, une entrée périmée reste servie). */ const CACHE_TTL = 5 * 60 * 1000;
function cacheScope() {
    const token = getToken();
    // Empreinte courte du token : isole les caches par utilisateur connecté.
    let hash = 0;
    for(let i = 0; i < (token?.length ?? 0); i += 1){
        hash = hash * 31 + (token?.charCodeAt(i) ?? 0) | 0;
    }
    return String(hash);
}
function cacheKey(path) {
    return `GET|${cacheScope()}|${path}`;
}
function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), timeoutMs);
    return fetch(url, {
        ...init,
        signal: controller.signal
    }).finally(()=>clearTimeout(timer));
}
/** Libellé humain d'une mutation en file (indicateur d'interface). */ function labelFor(path) {
    if (path.startsWith("/api/manager/contributors")) return "Enregistrement d'un cotisant";
    if (path.startsWith("/api/manager/passbooks")) return "Création d'un carnet";
    if (path.startsWith("/api/manager/agents")) return "Création d'un compte équipe";
    if (path.startsWith("/api/manager/collections")) return "Annulation d'un encaissement";
    if (path.startsWith("/api/manager/closings")) return "Validation d'une clôture";
    if (path.startsWith("/api/agent/clients")) return "Enregistrement d'un client";
    if (path.startsWith("/api/agent/closing")) return "Déclaration de clôture";
    if (path.startsWith("/api/admin/structures")) return "Décision sur une structure";
    return "Opération enregistrée";
}
async function api(path, init) {
    const token = getToken();
    const method = (init?.method ?? "GET").toUpperCase();
    const isGet = method === "GET";
    const url = apiUrl(path);
    const headers = {
        "Content-Type": "application/json",
        ...token ? {
            Authorization: `Bearer ${token}`
        } : {},
        ...init?.headers ?? {}
    };
    try {
        const res = await fetchWithTimeout(url, {
            ...init,
            method,
            credentials: "include",
            headers
        }, isGet ? 20000 : 20000);
        let data = null;
        try {
            data = await res.json();
        } catch  {
        /* corps vide */ }
        if (!res.ok) {
            const err = data?.error;
            throw new ApiClientError(err?.message ?? "Une erreur est survenue. Réessaie.", err?.code ?? "error");
        }
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        return data;
    } catch (err) {
        if (err instanceof ApiClientError) throw err;
        // ── Panne réseau / hors ligne ──
        if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
        ;
        throw new ApiClientError("Pas de réseau. L'opération sera possible au retour de la connexion.", "offline");
    }
}
const post = (path, body)=>api(path, {
        method: "POST",
        body: JSON.stringify(body)
    });
const get = (path)=>api(path);
async function downloadFile(path, fallbackName) {
    const token = getToken();
    const res = await fetchWithTimeout(apiUrl(path), {
        credentials: "include",
        headers: token ? {
            Authorization: `Bearer ${token}`
        } : {}
    }, 60_000);
    if (!res.ok) {
        let message = "Téléchargement impossible. Réessaie.";
        let code = "error";
        try {
            const data = await res.json();
            message = data?.error?.message ?? message;
            code = data?.error?.code ?? code;
        } catch  {
        /* corps non JSON */ }
        throw new ApiClientError(message, code);
    }
    const blob = await res.blob();
    // Nom de fichier : filename*=UTF-8 d'abord (accents préservés), sinon filename.
    const cd = res.headers.get("Content-Disposition") ?? "";
    const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plain = /filename="?([^";]+)"?/i.exec(cd);
    let name = fallbackName;
    if (star) name = decodeURIComponent(star[1]);
    else if (plain) name = plain[1];
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 30_000);
    return name;
}
async function clearOfflineData() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
}),
"[project]/src/lib/offline/hooks.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useSyncDone",
    ()=>useSyncDone
]);
// TontiHelm — hooks de la couche offline-first.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
function useSyncDone(handler) {
    const ref = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(handler);
    ref.current = handler;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const fn = ()=>ref.current();
        window.addEventListener("tontihelm:sync-done", fn);
        return ()=>window.removeEventListener("tontihelm:sync-done", fn);
    }, []);
}
}),
"[project]/src/lib/realtime.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useRealtime",
    ()=>useRealtime
]);
// TontiHelm — temps réel WEB (décision du dirigeant, 2026-10-18) : tout ce qui
// est fait — encaissement saisi sur le site web, encaissement poussé par
// l'app mobile, clôture validée — est publié sur le flux SSE /api/events.
// L'application qui s'y abonne rafraîchit ses données sans action de
// l'utilisateur : plus besoin d'actualiser la page pour voir les écritures
// de l'autre canal.
// Authentification : jeton de session en paramètre d'URL (EventSource ne peut
// PAS poser d'en-tête Authorization) — jeton ordinaire, même validité 30 j.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/client.ts [app-ssr] (ecmascript)");
"use client";
;
;
function useRealtime(onChange) {
    const cbRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(onChange);
    cbRef.current = onChange;
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if ("TURBOPACK compile-time truthy", 1) return;
        //TURBOPACK unreachable
        ;
        const token = undefined;
        const base = undefined;
        const url = undefined;
        const es = undefined;
        const handleChange = undefined;
    }, []);
}
}),
"[project]/src/lib/domain.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// TontiHelm — paquet domain : règles métier pures (cahier des charges §14.6)
// Aucune dépendance externe. Tous les montants sont des entiers (FCFA).
/** Format des montants : une seule fonction pour toute l'application. */ __turbopack_context__.s([
    "closingGap",
    ()=>closingGap,
    "currentDayIndex",
    ()=>currentDayIndex,
    "cycleCommission",
    ()=>cycleCommission,
    "elapsedDays",
    ()=>elapsedDays,
    "formatFCFA",
    ()=>formatFCFA,
    "formatNumber",
    ()=>formatNumber,
    "isContributorActiveThisMonth",
    ()=>isContributorActiveThisMonth,
    "isLate",
    ()=>isLate,
    "maxCollectionAmount",
    ()=>maxCollectionAmount,
    "missedDays",
    ()=>missedDays,
    "paidDays",
    ()=>paidDays,
    "passbookBalance",
    ()=>passbookBalance
]);
const formatFCFA = (n)=>new Intl.NumberFormat("fr-FR").format(n) + "\u00A0FCFA";
const formatNumber = (n)=>new Intl.NumberFormat("fr-FR").format(n);
function passbookBalance(collections) {
    return collections.reduce((sum, c)=>sum + c.amount, 0);
}
function paidDays(balance, dailyAmount) {
    if (dailyAmount <= 0) return 0;
    return Math.max(0, Math.floor(balance / dailyAmount));
}
function elapsedDays(passbook, today = new Date()) {
    const start = new Date(passbook.startsOn);
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1;
    return Math.min(Math.max(diff, 0), passbook.cycleDays);
}
function missedDays(passbook, balance, today = new Date()) {
    return Math.max(0, elapsedDays(passbook, today) - paidDays(balance, passbook.dailyAmount));
}
function isLate(passbook, balance, threshold = 3, today = new Date()) {
    return missedDays(passbook, balance, today) >= threshold;
}
function cycleCommission(dailyAmount, cycleDays, commissionDays = 1) {
    return commissionDays * dailyAmount;
}
function currentDayIndex(passbook, today = new Date()) {
    return elapsedDays(passbook, today);
}
function closingGap(declaredCash, expectedCash) {
    return declaredCash - expectedCash;
}
function isContributorActiveThisMonth(collections, month) {
    const start = new Date(month.getFullYear(), month.getMonth(), 1);
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return collections.some((c)=>{
        return c.amount > 0 && true; // le filtrage par date est fait par l'appelant
    });
}
function maxCollectionAmount(passbook, balance, advanceAllowed = false) {
    const cycleTotal = passbook.dailyAmount * passbook.cycleDays;
    if (advanceAllowed) return cycleTotal + passbook.dailyAmount; // un jour d'avance au maximum
    return Math.max(0, cycleTotal - balance);
}
}),
"[project]/src/lib/types.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CLOSING_STATUS",
    ()=>CLOSING_STATUS,
    "KIND_LABELS",
    ()=>KIND_LABELS,
    "SUB_STATUS",
    ()=>SUB_STATUS,
    "formatFCFA",
    ()=>formatFCFA
]);
// TontiHelm — types partagés entre le routeur et les écrans.
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$domain$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/domain.ts [app-ssr] (ecmascript)");
;
const formatFCFA = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$domain$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["formatFCFA"];
const KIND_LABELS = {
    sfd: "SFD (microfinance décentralisée)",
    groupement: "Groupement d'épargne",
    pme: "PME collectrice"
};
const CLOSING_STATUS = {
    open: {
        label: "Ouverte",
        tone: "neutral"
    },
    declared: {
        label: "À valider",
        tone: "warning"
    },
    validated: {
        label: "Validée",
        tone: "success"
    },
    disputed: {
        label: "Contestée",
        tone: "danger"
    }
};
const SUB_STATUS = {
    trial: "Abonnement à activer",
    active: "Actif",
    past_due: "En retard de paiement",
    read_only: "Lecture seule",
    canceled: "Annulé"
};
}),
"[project]/src/lib/offline/sync.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "flushOutbox",
    ()=>flushOutbox,
    "getLastSync",
    ()=>getLastSync,
    "initOfflineSync",
    ()=>initOfflineSync
]);
// TontiHelm — moteur de synchronisation offline-first (patron Academia Helm, adapté) :
//   · déclencheurs : retour du réseau (anti-rebond 1,5 s), chargement de page,
//     cycle de 30 s tant qu'il reste des événements, appel manuel ;
//   · flush : replay EXACT de chaque mutation vers son endpoint d'origine (FIFO) ;
//   · sémantique d'erreur honnête : 4xx = refus métier définitif (FAILED conservé),
//     5xx / réseau = transitoire (PENDING, backoff exponentiel avec gigue).
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/client.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/offline/idb.ts [app-ssr] (ecmascript)");
;
;
const BACKOFF_STEPS = [
    2000,
    5000,
    15000,
    45000,
    60000
];
const MUTATION_TIMEOUT = 20000;
let flushing = false;
let onlineListenerBound = false;
let debounceTimer = null;
let backoffTimer = null;
let backoffIndex = 0;
function dispatch(name, detail) {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
function isOnline() {
    return typeof navigator === "undefined" ? true : navigator.onLine;
}
/** Rejoue une mutation exactement comme à l'origine (même URL, verbe, corps, en-têtes). */ async function replay(event) {
    const token = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["getToken"])();
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), MUTATION_TIMEOUT);
    try {
        return await fetch((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$client$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["apiUrl"])(event.url), {
            method: event.method,
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...token ? {
                    Authorization: `Bearer ${token}`
                } : {},
                "X-Offline-Replay": "1"
            },
            body: event.body ?? undefined,
            signal: controller.signal
        });
    } finally{
        clearTimeout(timer);
    }
}
async function readErrorMessage(res) {
    try {
        const data = await res.json();
        return data?.error?.message ?? `Refus du serveur (HTTP ${res.status}).`;
    } catch  {
        return `Refus du serveur (HTTP ${res.status}).`;
    }
}
async function flushOutbox() {
    if (flushing || !isOnline()) return {
        synced: 0,
        failed: 0,
        remaining: 0
    };
    flushing = true;
    cancelBackoff();
    dispatch("tontihelm:sync-start");
    let synced = 0;
    let failed = 0;
    try {
        const entries = (await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["outboxAll"])()).filter((e)=>e.status === "PENDING");
        for (const event of entries){
            try {
                const res = await replay(event);
                if (res.ok) {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["outboxDelete"])(event.id);
                    synced += 1;
                    dispatch("tontihelm:outbox-changed");
                } else if (res.status >= 400 && res.status < 500) {
                    // Refus métier définitif : conservé pour l'affichage, jamais rejoué.
                    const message = await readErrorMessage(res);
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["outboxUpdate"])({
                        ...event,
                        status: "FAILED",
                        attempts: event.attempts + 1,
                        lastError: message,
                        updatedAt: Date.now()
                    });
                    failed += 1;
                    dispatch("tontihelm:outbox-changed");
                } else {
                    // 5xx : panne du serveur — transitoire, on arrête le lot et on réessaaye plus tard.
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch  {
                // Réseau coupé pendant le flush : transitoire. Backoff puis reprise.
                scheduleBackoff();
                break;
            }
        }
        if (synced > 0) await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["metaSet"])("lastSyncAt", Date.now());
        return finish(synced, failed);
    } finally{
        flushing = false;
    }
}
function finish(synced, failed) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["outboxAll"])().then((entries)=>{
        const remaining = entries.filter((e)=>e.status === "PENDING").length;
        dispatch("tontihelm:sync-done", {
            synced,
            failed,
            remaining
        });
        return {
            synced,
            failed,
            remaining
        };
    });
}
function scheduleBackoff() {
    if (backoffTimer) return;
    const delay = BACKOFF_STEPS[Math.min(backoffIndex, BACKOFF_STEPS.length - 1)];
    const jitter = delay * (0.8 + Math.random() * 0.4); // ±20 %
    backoffIndex = Math.min(backoffIndex + 1, BACKOFF_STEPS.length - 1);
    backoffTimer = setTimeout(()=>{
        backoffTimer = null;
        void flushOutbox();
    }, jitter);
}
function cancelBackoff() {
    if (backoffTimer) {
        clearTimeout(backoffTimer);
        backoffTimer = null;
    }
    backoffIndex = 0;
}
function initOfflineSync() {
    if ("TURBOPACK compile-time truthy", 1) return;
    //TURBOPACK unreachable
    ;
}
async function getLastSync() {
    return await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$offline$2f$idb$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["metaGet"])("lastSyncAt") ?? null;
}
}),
];

//# sourceMappingURL=src_lib_04a0c69e._.js.map