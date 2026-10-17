# apps/web — frontend Next.js (déménagement planifié)

Le frontend Next.js 16 de TontiHelm vit **provisoirement à la racine du dépôt**
(`src/`, `public/`, `next.config.ts`, `package.json` racine). Ce dossier est sa
destination finale dans le monorepo.

## Pourquoi le déménagement est différé

Le déploiement Vercel actuel sert le frontend depuis la racine du dépôt git.
Déplacer physiquement `src/` ici SANS changer simultanément le réglage
**Root Directory** côté Vercel casserait le déploiement de production
(build introuvable, vitrine et back-offices indisponibles). La règle de la
phase 1 (PARITE.md §9, validée par le dirigeant) est donc : **zéro interruption
du déploiement web** — le déménagement se fait en une fenêtre coordonnée.

## Procédure de déménagement (à exécuter d'un seul tenant)

1. **Préparer Vercel** : dans les réglages du projet, préparer la modification
   « Root Directory = `apps/web` » (ne pas encore déployer).
2. **Déplacer le code** dans cette même fenêtre :
   - `git mv src apps/web/src` ; `git mv public apps/web/public` ;
   - déplacer aussi `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`,
     `components.json` et les dépendances frontend du `package.json` racine
     vers `apps/web/package.json` (scripts `dev`/`build`/`start`/`lint` inclus) ;
   - la racine devient l'orchestrateur du monorepo : `workspaces` npm/bun
     déclarant `apps/*` et `packages/*`.
3. **Brancher les workspaces** : fin de l'étape transitoire `sync.mjs` —
   `backend` et `apps/web` importent `@tontihelm/domain` et
   `@tontihelm/schemas` comme dépendances de workspace (suppression des copies
   vérifiées `backend/src/lib/{domain,livret,plans,schemas}.ts`... conserver
   la mécanique en relecture jusqu'à validation du déploiement).
4. **Valider immédiatement** : `cd apps/web && bun install && bun run build` ;
   déploiement Vercel avec Root Directory = `apps/web` ; vérifier la vitrine,
   la connexion, un back-office et le carnet public d'un cotisant.
5. **Dérouiller Railway** : aucun changement attendu (le backend se déploie
   depuis `backend/` — vérifier que le Dockerfile ignore bien le reste).

## En attendant

- `packages/domain` est la **source de vérité** des règles métier ; le backend
  consomme une copie vérifiée (`bun run check` — diff nul imposé).
- `packages/schemas` suit le même patron pour les contrats Zod du canal `/v1`.
- Le canal mobile `/v1` et l'application `apps/mobile` sont purement additifs :
  ce dossier n'a aucune interaction avec eux avant le branchement des
  workspaces.
