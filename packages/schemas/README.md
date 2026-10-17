# @tontihelm/schemas

Schémas **Zod** partagés entre le backend, l'application mobile native et
(à terme) le web — phase 1 du brief mobile, PARITE.md §8.

## Contenu

| Module | Rôle |
|---|---|
| `src/common.ts` | UUID (fil serveur) et **UUID v7 strict** (contrainte téléphone), horodatage avec décalage, journée `AAAA-MM-JJ`, montants FCFA entiers non nuls, enveloppe d'erreur `{ error: { code, message } }`, normalisation béninoise des numéros (même règle que `/api/auth/login`). |
| `src/sync.ts` | Événement d'encaissement (mêmes gardes que `POST /api/agent/sync` + compléments mobiles `deviceId`/`clientTime`, §8.4), lot ≤ 50, **accusé par événement** (accepté / doublon / rejeté + motif, §8.2), réponse de traction incrémentale `/v1/sync/pull` (§8.3). |
| `src/auth.ts` | Connexion mobile (téléphone + PIN 6 chiffres + appareil), vérification OTP, rotation du jeton de renouvellement, paires de jetons (accès 15 min / renouvellement 30 j), appareils (§8.5/§8.7). |

## Règle d'or

Les contraints et les **messages en français** sont alignés octet pour octet
sur ceux du web : `/v1` et `/api` rejettent à l'identique. Toute évolution se
fait **ici d'abord**, puis synchronisation vers le backend.

## Synchronisation backend (étape transitoire)

En attendant le branchement des workspaces du monorepo (déplacement
`apps/web` coordonné avec le réglage Vercel Root Directory), le backend
consomme une copie **vérifiée** du paquet :

```bash
bun run check   # diff entre le paquet et backend/src/lib/schemas — échoue en cas de dérive
bun run push    # recopie src/{common,sync,auth}.ts vers backend/src/lib/schemas/
bun test        # tests du paquet
```

Après chaque `push`, relancer `cd backend && bun test` : les deux suites
doivent rester vertes.

## Consommateurs prévus

- `backend/src/lib/schemas/` — copie synchronisée (routes `/v1/*`) ;
- `apps/mobile` — import direct du paquet (Metro watchFolders), validation
  locale des événements (UUID v7) AVANT mise en file d'envoi ;
- `apps/web` — bascule prévue lors du déplacement monorepo.
