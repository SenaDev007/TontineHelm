# @tontihelm/domain

Source de vérité des **règles métier pures** TontiHelm, partagée entre le web et
le mobile natif (phase 1 du brief mobile, PARITE.md §8/§9).

## Contenu

| Module | Rôle |
|---|---|
| `src/domain.ts` | Formules unitaires : `formatFCFA`, `passbookBalance`, `paidDays`, `elapsedDays`, `missedDays`, `isLate`, `cycleCommission`, `closingGap`, `maxCollectionAmount`, registre par journée (`buildDayLedger`). |
| `src/livret.ts` | Moteur du **livret annuel** : 12 feuilles × 31 lignes (372), 31e ligne = mise entreprise, lignes excusées avant l'arrivée (règle d'équité 2026-10-17), avances mensuelles calculées, `buildLivret` + récapitulatif (part client / part entreprise). |
| `src/plans.ts` | Paliers d'abonnement : Démarrage / Pro / Institution (prix, quotas, relances). |

Aucune dépendance externe. Tous les montants sont des entiers (FCFA).

## Garantie de non-régression

L'extraction a suivi la règle du brief : **tests écrits AVANT l'extraction**.

1. `backend/tests/domain.regression.test.ts` caractérise le comportement du web
   (25 tests, 132 assertions) — cas canonique du brief inclus :
   *31 jours à 500 FCFA → 15 500 cotisés, 500 de part entreprise, 15 000 au
   client = exactement une feuille mensuelle du livret*.
2. `tests/domain.regression.test.ts` est la **même suite** exécutée contre le
   paquet : elle doit rester verte à chaque modification.

Toute évolution des règles (p. ex. cycles courts paramétrables — décision n° 5
du dirigeant, PARITE.md §8.14) se fait **ici d'abord**, tests ajustés en
conséquence, puis synchronisation vers le backend.

## Synchronisation backend (étape transitoire)

En attendant le branchement des workspaces du monorepo (déplacement
`apps/web` coordonné avec le réglage Vercel Root Directory), le backend
consomme une copie **vérifiée** du paquet :

```bash
bun run check   # diff entre le paquet et backend/src/lib — échoue en cas de dérive
bun run push    # recopie src/{domain,livret,plans}.ts vers backend/src/lib/
bun test        # tests de non-régression du paquet
```

Après chaque `push`, relancer `cd backend && bun test` : les deux suites
doivent rester vertes.

## Consommateurs prévus

- `backend/src/lib/{domain,livret,plans}.ts` — copie synchronisée (web, source
  de vérité déployée) ;
- `apps/mobile` (phase 1/2) — import direct du paquet (Metro watchFolders) ;
- `apps/web` — bascule prévue lors du déplacement monorepo ;
- `packages/schemas` (Zod) et `packages/sync` viendront s'ajouter en phase 1/2.
