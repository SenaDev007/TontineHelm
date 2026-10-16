# TontiHelm — Gestion de tontines journalières

Logiciel SaaS de gestion de tontines journalières (YEHI OR Tech, Bénin) : remplace le carnet
papier par un carnet numérique calqué sur le **calendrier réel**, fonctionne hors réseau pour
les agents de collecte, clôture la caisse chaque soir et scelle chaque écriture dans un
journal d'audit à chaîne de hash.

## Architecture du monorepo

```
TontineHelm/
├── src/                  ← FRONTEND Next.js 16 (déployé sur VERCEL)
│   ├── app/page.tsx      ← application (route unique : vitrine, connexion, back-offices)
│   ├── components/tontihelm/
│   │   ├── landing/      ← site vitrine
│   │   ├── auth/         ← connexion (téléphone + PIN)
│   │   ├── register/     ← inscription d'une structure
│   │   ├── manager/      ← back-office gérant (carnets, calendrier réel, équipe…)
│   │   ├── agent/        ← application agent (tournée, encaissement, clôture)
│   │   └── admin/        ← back-office plateforme (validation des structures)
│   └── lib/client.ts     ← client API (jeton Bearer, URL builder Vercel↔Railway)
│
├── backend/              ← BACKEND Express + Prisma (déployé sur RAILWAY)
│   ├── prisma/schema.prisma   ← schéma PostgreSQL (une seule source de vérité)
│   ├── src/index.ts      ← API Express (auth, structures, agents, manager, paiements)
│   ├── src/routes/       ← toutes les routes REST
│   ├── src/lib/          ← règles métier (domain), audit scellé, sessions, SMS
│   └── src/scripts/bootstrap-admin.ts  ← amorce du compte admin plateforme
│
└── prisma/               ← artefact sandbox (SQLite, uniquement pour le dev local
                             du frontend — la vraie base est dans backend/)
```

**Règles d'or** : aucune donnée mock, rien de codé en dur. Tout ce que l'interface affiche
provient de l'API Express et est persisté dans **PostgreSQL (Neon)**.

## Identité visuelle

Les logos officiels vivent dans `public/logo-tontihelm/` :

| Asset | Usage |
|---|---|
| `logo-TontiHelm-nom droite1.png` | navbar et en-têtes des back-offices (emblème + nom à droite) |
| `logo-TontiHelm-nom bas1.png` | footer de la vitrine (emblème + nom en bas, sur pastille blanche) |
| `logo-TontiHelm1.png` | écrans de connexion / inscription / attente et écran de chargement animé |
| `logo-TontiHelm1.svg` / `.ico` / `.webp` | sources vectorielles et favicon |

Le favicon (`src/app/favicon.ico`, 16/32/48) et les icônes du manifest
(`public/icon-192.png`, `public/icon-512.png`, `apple-touch-icon.png`) sont régénérés
depuis l'emblème par `python3 scripts/make-icons.py`. Palette de marque :
primaire `#003887`, secondaire `#00B8B0`, accent `#008FF5`, or `#FFB800` —
définie dans `src/app/globals.css` (jetons `@theme` + variables shadcn/ui).


## Le carnet en calendrier réel

Le carnet de chaque cotisant s'ouvre en vue **calendrier calendaire vrai**, entièrement
dynamique :

- le mois affiché respecte les vraies longueurs de mois, les années bissextiles et les
  vrais jours de semaine (le 1er octobre 2026 est un jeudi) ;
- le **marquage commence à la date de début exacte** du cycle (`startsOn`) : les jours
  d'avant sont « hors cycle » ;
- chaque encaissement se pose sur son **jour calendaire réel** (jour marqué en vert avec le
  montant, jour partiel, jour manqué en rouge, jour à venir en cercle pointillé) ;
- la navigation marche **de mois en mois et d'année en année** (décembre 2026 → janvier 2027),
  avec retour immédiat à « Aujourd'hui » ;
- la barre de progression et les statistiques mensuelles se recalculent sur les vraies dates.

### Encaissement sur plusieurs journées (multi-jours)

Un cotisant peut régler **plusieurs journées d'un coup** : aujourd'hui, demain, après-demain…
sans limite autre que les bornes du cycle — et rattraper les jours manqués. Concrètement :

- l'écran d'encaissement de l'agent propose un **sélecteur de journées** : rattrapage (jours
  manqués), aujourd'hui, puis toutes les journées à venir du cycle ;
- chaque journée sélectionnée crée **une écriture datée sur la journée qu'elle couvre**
  (`coversOn`) — le montant peut être ajusté au clavier (paiement partiel sur la dernière
  journée) ;
- le calendrier marque alors **chaque jour exact**, y compris les journées futures réglées
  d'avance (badge « d'avance ») ;
- le **reçu SMS est unique et récapitulatif** (« 1 500 FCFA reçus le 16/10, jours 16-18/31,
  solde cumulé 1 500 FCFA ») ;
- un excédent sur une journée est reporté sur les suivantes (une journée marquée = une mise) ;
- l'annulation d'une écriture retire **la même journée**, le marquage se recalcule.

---

## Mode hors ligne (offline-first) et synchronisation

TontiHelm fonctionne **sans réseau de bout en bout** — du site vitrine jusqu'aux back-offices —
et synchronise tout vers la base distante au retour de la connexion. Le patron est celui rodé
sur Academia Helm, adapté à la taille de TontiHelm :

| Brique | Fichier | Rôle |
| --- | --- | --- |
| Service worker | `public/sw.js` | Pages du site (`/`, pages légales) en NetworkFirst avec repli cache — le site se recharge hors ligne ; chunks `/_next/static` et images en CacheFirst. Les appels API ne sont **pas** interceptés (gérés par la couche applicative). |
| Cache de lectures | `src/lib/offline/idb.ts` (store `response_cache`) | Chaque réponse GET réussie est mise en miroir dans IndexedDB, cloisonnée par utilisateur (empreinte du jeton) ; panne réseau → la réponse est servie depuis le cache (dernier état connu). |
| File d'envoi | même fichier (store `outbox`) | Les mutations faites hors ligne sont mises en file avec leur requête exacte (URL, verbe, corps) ; l'interface reçoit un accusé `__offlineQueued` et continue normalement. |
| Moteur de sync | `src/lib/offline/sync.ts` | Déclencheurs : retour du réseau (anti-rebond 1,5 s), chargement, cycle de 30 s. Rejeu FIFO exact vers les endpoints d'origine. **4xx = refus métier définitif** (conservé et affiché), **5xx/réseau = transitoire** (backoff 2/5/15/45/60 s avec gigue). |
| Interface | `src/components/offline/OfflineLayer.tsx` | Bannière hors ligne (en flux, toutes les vues), pastille « N en attente d'envoi » (clic = forcer la sync), toast « Tout est synchronisé », bouton d'oubli des échecs. |

- **Routes jamais mises en file** : `/api/auth/*` (la session doit exister), `/api/agent/sync`
  (c'est elle le vidage de l'outbox agent), `/api/structures/register` (pièce jointe),
  `/api/payments/*` (lien de paiement réel requis).
- La **tournée de l'agent** garde son outbox dédié (localStorage, sync idempotente par
  lots de 50) — inchangé et éprouvé en recette E2E.
- **Purge à la déconnexion** : cache et file sont vidés (`clearOfflineData`) — aucune fuite
  de données entre comptes sur un appareil partagé.
- Les listes se rafraîchissent automatiquement après chaque passe de synchronisation
  (hook `useSyncDone`).

## Demandes de démonstration (aucun mode gratuit)

Il n'existe **pas de mode gratuit** : la découverte du produit passe par une démonstration
accompagnée, demandée depuis le site.

- `POST /api/demo/request` (public, anti-abus 5 req/10 min par IP) — enregistre une demande
  (nom, téléphone, structure, ville, taille approximative, message) dans la table
  `DemoRequest` ; fonctionne même hors ligne (mise en file + envoi au retour du réseau).
- `GET /api/admin/demo-requests` — file des demandes dans le back-office administrateur
  (statuts : nouvelle / contactée / convertie / clôturée, bouton WhatsApp direct).
- Relais direct : bouton **WhatsApp** sur le site (`wa.me/2290141360803`, message pré-rempli).

## Pages légales

Trois pages réelles, conformes au droit béninois, servies et pré-cachées par le service
worker :

- `/conditions-utilisation` — CGU : Code du numérique (loi n° 2017-20), cadre SFD/agément,
  abonnements, hors ligne et responsabilité ;
- `/confidentialite` — loi n° 2009-09 (protection des données personnelles), APDP,
  finalités, durées, droits, sous-traitants ;
- `/mentions-legales` — éditeur YEHI OR Tech (Parakou), directeur de publication,
  hébergeurs (Vercel / Railway / Neon), propriété intellectuelle.

---

## Déploiement

### 1. Base de données — PostgreSQL Neon

La base est déjà provisionnée sur [Neon](https://neon.tech) (région eu-west-2). Son URL se
compose ainsi :

```
postgresql://<user>:<motdepasse>@<endpoint-pooler>.eu-west-2.aws.neon.tech/TontineHelm?sslmode=require&channel_binding=require
```

Astuce Prisma + Neon : sur un endpoint *pooler*, ajoute `&pgbouncer=true&connection_limit=5`
pour éviter les conflits de prepared statements.

### 2. Backend — Railway

1. Sur [Railway](https://railway.app), crée un service **à partir du dépôt GitHub** et
   renseigne le **Root Directory = `backend`** (le `Dockerfile`, le `railway.json`
   — builder `DOCKERFILE` — et le `Procfile` y sont déjà prêts).
   > Le build utilise une image Docker officielle Bun (`oven/bun:1`) plutôt que
   > Nixpacks : le pin nixpkgs de Nixpacks v1.41 référence `nodejs_18`, qui a atteint
   > sa fin de vie et a été retiré (`error: Node.js 18.x has reached End-Of-Life and
   > has been removed`). Le Dockerfile reproduit exactement le même plan
   > (`bun install` → `bunx prisma generate` → `bun src/index.ts`) sans dépendre de
   > nixpkgs.
2. Variables d'environnement du service — **tableau de référence complet** :

   | Variable | Obligatoire | Valeur d'exemple | Rôle |
   |---|---|---|---|
   | `DATABASE_URL` | **oui** | `postgresql://neondb_owner:•••@ep-…-pooler.c-2.eu-west-2.aws.neon.tech/TontineHelm?sslmode=require&channel_binding=require&pgbouncer=true&connection_limit=5` | connexion PostgreSQL Neon. Sur un endpoint *pooler*, garde `&pgbouncer=true&connection_limit=5` (évite les conflits de prepared statements) |
   | `CORS_ORIGINS` | **oui en production** | `https://tontihelm.vercel.app` | origine(s) du frontend autorisée(s) à appeler l'API, **sans barre finale**, séparées par des virgules. Avec plusieurs domaines, le cookie de session passe automatiquement en `SameSite=None; Secure` (obligatoire entre domaines Vercel ↔ Railway) |
   | `ADMIN_PHONE` | oui (amorçage) | `+22990000001` | téléphone du compte admin plateforme (créé par `bootstrap:admin`) |
   | `ADMIN_PIN` | oui (amorçage) | `246810` | PIN du compte admin plateforme |
   | `PORT` | non | *(fourni par Railway)* | injecté automatiquement par Railway — l'API écoute dessus (3001 en local par défaut) |
   | `NODE_ENV` | non | *(fourni par Railway)* | Railway le règle sur `production` — active les cookies `Secure` et réduit les logs Prisma |

3. Initialise le schéma et le compte admin (console Railway → onglet *Command*) :

   ```bash
   bunx prisma db push --accept-data-loss   # crée / met à jour les tables
   bun run bootstrap:admin                  # crée le compte admin plateforme
   ```
4. Vérifie `https://ton-service.up.railway.app/api/health` → `{"ok":true}`.

### 3. Frontend — Vercel

1. Sur [Vercel](https://vercel.com), importe le **même dépôt GitHub** avec le
   **Root Directory = racine du dépôt** (framework Next.js détecté automatiquement).
2. Variables d'environnement — **tableau de référence complet** :

   | Variable | Obligatoire | Valeur d'exemple | Rôle |
   |---|---|---|---|
   | `NEXT_PUBLIC_API_URL` | **oui en production** | `https://ton-service.up.railway.app` | URL publique de l'API Railway, **sans barre finale**. Le navigateur appelle directement cette URL avec un jeton `Authorization: Bearer` |
   | `NEXT_PUBLIC_API_PORT` | non | `3001` | réservé à la préproduction locale (paramètre `XTransformPort`) — **à ne pas définir sur Vercel** |

   > `NEXT_PUBLIC_*` est injecté dans le bundle navigateur au moment du **build** :
   > après toute modification, relance un déploiement pour qu'elle prenne effet.

3. Déploie. Le navigateur appelle l'API Railway avec un jeton `Authorization: Bearer`
   (fonctionne entre domaines distincts ; le cookie httpOnly reste en renfort).

### 4. Comment les deux services communiquent

```
Navigateur (tontihelm.vercel.app)
   │  fetch https://ton-service.up.railway.app/api/…
   │  Authorization: Bearer <jeton de session>   (+ cookie httpOnly en renfort)
   ▼
API Express (Railway)  ──CORS_ORIGINS──▶ n'accepte que tontihelm.vercel.app
   │
   ▼
PostgreSQL Neon (DATABASE_URL)
```

- **CORS** : le backend n'accepte que les origines listées dans `CORS_ORIGINS` — mets-y
  exactement l'URL de production Vercel (et, si besoin, celles des aperçus de déploiement) ;
- **Authentification** : le jeton Bearer est le mécanisme principal (insensible aux
  restrictions de cookies tiers) ; le cookie `SameSite=None; Secure` n'est qu'un renfort ;
- **Sens des variables** : `NEXT_PUBLIC_API_URL` est publique par conception (c'est une URL
  d'API, pas un secret) ; `DATABASE_URL` et `ADMIN_PIN` restent côté serveur Railway.

### 5. Pièges fréquents

- **build Railway en échec** avec `Node.js 18.x has reached End-Of-Life and has been
  removed` ? C'est le pin nixpkgs de Nixpacks qui est périmé ; le dépôt embarque
  désormais un `backend/Dockerfile` (builder `DOCKERFILE` dans `railway.json`) qui
  contourne définitivement le problème. Alternative rapide sans Dockerfile : variable
  de service `NIXPACKS_NODE_VERSION=22` ;
- `CORS_ORIGINS` : URL complètes avec `https://`, **sans barre finale**, séparées par des
  virgules sans espace (`https://a.vercel.app,https://b.vercel.app`) ;
- le frontend affiche des erreurs réseau ? Vérifie que `/api/health` répond sur l'URL
  Railway et que `NEXT_PUBLIC_API_URL` la pointe bien (sans `/` final) ;
- après tout changement de variable (Railway ou Vercel), **redéploie** le service concerné
  (Vercel : obligatoire, la variable est cuite dans le bundle au build).

### 6. Comptes créés pendant la recette

Le parcours complet (inscription → validation → équipe → cotisant → carnet → encaissement)
a été exécuté sur la base Neon. Comptes réels actuellement en base :

| Rôle | Téléphone | PIN |
|---|---|---|
| Admin plateforme | `+22990000001` | `246810` |
| Propriétaire — Alafia Finance | `+22997123456` | `135790` |
| Agent collecteur — Alafia Finance | `+22996111222` | `112233` |

**Avant de passer en production**, remets la base à vide puis re-crée uniquement l'admin :

```bash
cd backend
DATABASE_URL="…" bun -e "import {PrismaClient} from '@prisma/client'; const db=new PrismaClient();
await db.session.deleteMany(); await db.invoice.deleteMany(); await db.subscription.deleteMany();
await db.auditLog.deleteMany(); await db.notification.deleteMany(); await db.payment.deleteMany();
await db.collection.deleteMany(); await db.closing.deleteMany(); await db.passbook.deleteMany();
await db.contributor.deleteMany(); await db.user.deleteMany(); await db.structure.deleteMany();
await db.\$disconnect(); console.log('base vidée');"
ADMIN_PHONE=… ADMIN_PIN=… bun run bootstrap:admin
```

---

## Développement local

```bash
# Backend (port 3001, rechargement à chaud)
cd backend
bun install
cp .env.example .env        # renseigne DATABASE_URL, ADMIN_PHONE, ADMIN_PIN
bunx prisma db push
bun run bootstrap:admin
bun run dev

# Frontend (port 3000)
cd ..
bun install
bun run dev
```

Sans `NEXT_PUBLIC_API_URL`, le frontend appelle l'API en relatif et transmet le port du
backend via le paramètre `XTransformPort` (utile derrière la passerelle de préproduction).

## Rôles et parcours

| Rôle | Ce qu'il fait |
|---|---|
| **Admin plateforme** | valide ou refuse les structures, suspend, réactive |
| **Propriétaire / Gérant** | équipe d'agents, cotisants, carnets + calendrier réel, encaissements, annulations, clôtures, audit, abonnement |
| **Agent collecteur** | tournée du jour, encaissement en 10 s (espèces / lien mobile money), clôture de caisse — fonctionne hors réseau (file d'attente locale idempotente) |
| **Contrôleur** | consultation et export uniquement |

## Sécurité et intégrité

- code PIN haché (scrypt + sel), sessions en base révocables ;
- isolation multi-structure par `tenantId` sur chaque table métier ;
- journal d'audit **scellé** : chaque ligne hash celle qui précède (toute altération casse la chaîne) ;
- encaissements idempotents (UUID applicatif), annulations par écriture inverse (rien ne se supprime) ;
- clôture validée = journée verrouillée.
