# @tontihelm/mobile — application Android native (Expo)

Socle **phase 1** du brief mobile TontiHelm (YEHI OR Tech) : application Expo
(React Native, nouvelle architecture, Hermes, Expo Router) consommant le canal
`/v1` du backend (authentification appareil + OTP + jetons courts, appareils,
synchronisation push/pull). Les écrans métier arrivent aux phases 2 à 4 :
barre agent à **5 entrées** (Tournée, Encaisser, Clients, Clôture, Compte —
décision n° 18 du dirigeant), back-office gérant/dirigeant, administration
plateforme, inscription.

## Démarrage

```bash
cd apps/mobile
bun install
bunx expo install --fix   # aligne les versions exactes du SDK Expo courant
bunx expo start --android
```

Variables d'environnement (copier `.env.example`) :
- `EXPO_PUBLIC_API_BASE` — base de l'API `/v1` (défaut : `http://localhost:3001`).

## Ce que le socle contient déjà

| Élément | Détail |
|---|---|
| Connexion | Téléphone + PIN 6 chiffres + nom d'appareil ; OTP SMS (mode dev : code renvoyé dans la réponse) ; 2FA dirigeant/gérant gérée par le serveur. |
| Session | Jetons dans `expo-secure-store` ; rotation automatique sur 401 (`refresh` puis nouvel essai) ; purge locale à la révocation/déconnexion. |
| Sonde de synchronisation | L'écran d'accueil tire `/v1/sync/pull` (snapshot complet) et affiche le solde cumulé formaté par **@tontihelm/domain** (`formatFCFA`). |
| Identifiants | Générateur **UUID v7** local (`src/lib/uuid7.ts`) pour les événements d'encaissement — validé par `@tontihelm/schemas` (UuidV7Schema). |
| Paquets partagés | Imports directs via Metro `watchFolders` : `@tontihelm/domain`, `@tontihelm/schemas` (aucune copie, aucune dérive). |
| Design | #0F6B4A / #C8962E, Plus Jakarta Sans + Inter, cibles tactiles 48 dp, **aucun emoji** (règle de marque). |

## Ce qui vient ensuite

- Phase 2 : SQLite chiffrée (SQLCipher + Drizzle, clé en `expo-secure-store`),
  outbox avec reprise 2/4/8/16 s puis 5 min, écrans agent (tournée,
  encaissement ligne à ligne + avances mensuelles, clients, clôture, compte),
  blocage après 7 jours hors ligne.
- Phase 3 : espace cotisant authentifié (`/v1/me/*`).
- Phase 4 : gérant/dirigeant/contrôleur, administration plateforme.
- Phase 6 : EAS Build, signature (voir `SIGNATURE.md` à la racine du monorepo).

## Tester dans Android Studio (machine locale)

1. **Backend** : `cd backend && cp .env.example .env` (renseigner
   `DATABASE_URL` PostgreSQL — Neon), puis `bun run dev` → écoute sur 3001.
2. **Cette application** : `cp .env.example .env` — l'émulateur Android
   n'atteint PAS le `localhost` de ta machine ; la valeur par défaut
   `http://10.0.2.2:3001` (alias hôte de l'émulateur) est déjà la bonne.
   Sur téléphone physique : mettre l'adresse LAN du PC (même réseau Wi-Fi).
3. **Lancer** : ouvrir Android Studio → Device Manager → créer/lancer un
   émulateur (Android 14+ conseillé), puis `bunx expo start --android`
   (ouvre l'émulateur et installe Expo Go automatiquement).
4. **OTP en mode dev** : le backend hors production renvoie le code à 6
   chiffres dans sa réponse (`devCode`) — aucun SMS nécessaire pour tester.
5. **Typage** : `bun run typecheck` (0 erreur attendue ; `expo-env.d.ts` est
   régénéré par Expo, il est gitignore — si `process` est inconnu après un
   clone, lancer une fois `bunx expo start`).

## Règles du dépôt

Le web reste la source de vérité fonctionnelle (PARITE.md) : tout écran mobile
reproduit les textes, calculs et statuts du web — zéro invention, zéro
suppression. Les dépendances supplémentaires doivent être justifiées (poids
 APK < 25 Mo, machine de test 2 Go de RAM).
