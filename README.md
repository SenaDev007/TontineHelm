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
   renseigne le **Root Directory = `backend`** (le `railway.json` et le `Procfile` y sont
   déjà prêts).
2. Variables d'environnement du service :

   | Variable | Valeur | Rôle |
   |---|---|---|
   | `DATABASE_URL` | l'URL Neon ci-dessus | connexion PostgreSQL |
   | `CORS_ORIGINS` | `https://ton-front.vercel.app` | origine(s) autorisée(s), séparées par des virgules |
   | `ADMIN_PHONE` | `+22990000001` | téléphone du compte admin plateforme |
   | `ADMIN_PIN` | un code PIN à 6 chiffres | PIN du compte admin |

   (Railway fournit `PORT` automatiquement — l'API écoute dessus.)
3. Initialise le schéma et le compte admin (console Railway → commandes) :

   ```bash
   bunx prisma db push --accept-data-loss   # crée les tables
   bun run bootstrap:admin                  # crée le compte admin
   ```
4. Vérifie `https://ton-service.up.railway.app/api/health` → `{"ok":true}`.

### 3. Frontend — Vercel

1. Sur [Vercel](https://vercel.com), importe le **même dépôt GitHub** avec le
   **Root Directory = racine du dépôt** (framework Next.js détecté automatiquement).
2. Variable d'environnement :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://ton-service.up.railway.app` (l'URL Railway, sans barre finale) |

3. Déploie. Le navigateur appelle l'API Railway avec un jeton `Authorization: Bearer`
   (fonctionne entre domaines distincts ; le cookie httpOnly reste en renfort).

### 4. Comptes créés pendant la recette

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
