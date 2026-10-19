# @tontihelm/mobile — application Android native (Expo)

Application agent **phase 2 livrée** du brief mobile TontiHelm (YEHI OR Tech) :
Expo (React Native, nouvelle architecture, Hermes, Expo Router) consommant le
canal `/v1` du backend, avec **barre agent à 5 entrées** (Tournée, Encaisser,
Clients, Clôture, Compte — décision n° 18 du dirigeant) et **mode hors ligne
complet** : miroir local **SQLite chiffrée** (SQLCipher + Drizzle), file
d'envoi (outbox) avec reprise **2/4/8/16 s puis 5 min**, blocage après 7 jours
hors ligne. Les écrans gérant/dirigeant arrivent aux phases 3+.

## Démarrage

```bash
cd apps/mobile
bun install
bunx expo install --fix   # aligne les versions exactes du SDK Expo courant
bunx expo run:android     # BUILD natif (prebuild + gradle) — voir ci-dessous
```

> **SQLCipher impose un build de développement** : le chiffrement de la base
> locale est compilé dans l'application (plugin `expo-sqlite` → `useSQLCipher`
> dans `app.json`). **Expo Go ne peut pas l'embarquer** — d'où
> `expo run:android` (prebuild + compilation Gradle via Android Studio) au
> premier lancement. Ensuite, pour le développement au quotidien :
> `bunx expo start --dev-client` (rafraîchissement à chaud sur l'app installée).
> Sur Expo Go, l'application démarre quand même — la base locale n'est alors
> simplement pas chiffrée (développement uniquement).

Variables d'environnement (copier `.env.example`) :
- `EXPO_PUBLIC_API_BASE` — base de l'API `/v1` (défaut : `http://localhost:3001`).

## Ce que l'application contient

| Élément | Détail |
|---|---|
| Connexion | Téléphone + PIN 6 chiffres + nom d'appareil ; OTP SMS (mode dev : code renvoyé dans la réponse) ; 2FA dirigeant/gérant gérée par le serveur. |
| Session | Jetons dans `expo-secure-store` ; rotation automatique sur 401 (`refresh` puis nouvel essai) ; purge locale (jetons + miroir + file) à la révocation/déconnexion. |
| Barre 5 onglets | **Tournée** (tri quartier puis nom, filtres, indicateurs du jour), **Encaisser** (ligne à ligne + avance partielle — `advancePreview()` partagée), **Clients** (portefeuille complet, recherche instantanée), **Clôture** (déclaration de caisse `POST /v1/closing`), **Compte** (profil, synchronisation, écran de reprise des rejets). |
| Hors ligne | Miroir du tirage `/v1/sync/pull` dans **SQLite chiffrée** (SQLCipher via expo-sqlite, clé 32 octets en `expo-secure-store`, requêtes **Drizzle**) — la tournée est lisible au démarrage sans réseau. |
| File d'envoi | Outbox chiffrée : un **UUID v7 par ligne couverte** (`src/lib/uuid.ts`) ; accusés PAR ÉVÉNEMENT (accepté/doublon/rejeté + motif) ; reprise **2 s → 4 s → 8 s → 16 s puis 5 min** (machine pure **@tontihelm/sync**, 19 tests) ; rejets définitifs conservés pour reprise ; **blocage après 7 jours** hors ligne. |
| Moteurs | Tireur temps réel (SSE `/v1/events` + filet 30 s + premier plan) et pousseur de file (retour du réseau, premier plan, réveil cadencé, récupération de crash `in_flight`). |
| Paquets partagés | Imports directs via Metro `watchFolders` : `@tontihelm/domain`, `@tontihelm/schemas`, `@tontihelm/sync` (aucune copie, aucune dérive). |
| Design | #0F6B4A / #C8962E, Plus Jakarta Sans + Inter, cibles tactiles 48 dp, **aucun emoji** (règle de marque). |

## Ce qui vient ensuite

- Phase 3 : espace cotisant authentifié (`/v1/me/*`), création de client sur
  le canal mobile (routes `/v1/clients` à ajouter, écart n° 8).
- Phase 4 : gérant/dirigeant/contrôleur, administration plateforme.
- Incrément hors ligne : relance de la file en tâche de fond OS
  (`expo-background-task`, ≥ 15 min imposées par Android — la cadence courte
  du brief reste tenue par le moteur premier plan).
- Phase 6 : EAS Build, signature (voir `SIGNATURE.md` à la racine du monorepo).

## Tester dans Android Studio (machine locale)

1. **Backend** : `cd backend && cp .env.example .env` (renseigner
   `DATABASE_URL` PostgreSQL — Neon), puis `bun run dev` → écoute sur 3001.
2. **Cette application** : `cp .env.example .env` — l'émulateur Android
   n'atteint PAS le `localhost` de ta machine ; la valeur par défaut
   `http://10.0.2.2:3001` (alias hôte de l'émulateur) est déjà la bonne.
   Sur téléphone physique : mettre l'adresse LAN du PC (même réseau Wi-Fi).
3. **Lancer** : ouvrir Android Studio → Device Manager → créer/lancer un
   émulateur (Android 14+ conseillé), puis `bunx expo run:android` :
   le **premier build compile le natif** (SQLCipher inclus — compte 10 à 20 min
   selon la machine), les suivants sont immédiats. Pour itérer ensuite :
   `bunx expo start --dev-client`.
4. **OTP en mode dev** : le backend hors production renvoie le code à 6
   chiffres dans sa réponse (`devCode`) — aucun SMS nécessaire pour tester.
5. **Hors ligne** : couper le réseau de l'émulateur (icône Wi-Fi du Device
   Manager ou `adb shell svc data disable` / `adb shell svc wifi disable`) —
   la tournée reste lisible, les encaissements s'enregistrent (bandeau
   « Hors ligne », pastille « N en attente »), tout repart seul au retour du
   réseau (2/4/8/16 s puis 5 min).
6. **Typage** : `bun run typecheck` (0 erreur attendue ; `expo-env.d.ts` est
   régénéré par Expo, il est gitignore — si `process` est inconnu après un
   clone, lancer une fois `bunx expo start`).
7. **Bundle de vérification** (sans Android Studio) :
   `bunx expo export --platform android` doit finir sur « Exported » — c'est
   le contrôle qui a piégé les deux erreurs de socle corrigées en phase 2
   (preset NativeWind, import du CSS).

### Dépannage : timeout au téléchargement de Gradle (connexion lente)

Le premier `expo run:android` télécharge Gradle (~130 Mo) via le wrapper,
avec un **délai de lecture de 10 s** par défaut — insuffisant sur connexion
lente (`SocketTimeoutException: Read timed out`). Deux parades, par ordre :

1. **Augmenter le délai** (le fichier est régénéré par prebuild — à refaire
   si `android/` est supprimé) :
   ```powershell
   Add-Content android\gradle\wrapper\gradle-wrapper.properties "networkTimeout=180000"
   bunx expo run:android   # retenter
   ```
2. **Téléchargement manuel** (le navigateur reprend les coupures) : récupérer
   `https://services.gradle.org/distributions/gradle-8.14.3-bin.zip`, puis :
   ```powershell
   $d = "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.14.3-bin"
   $h = (Get-ChildItem $d -Directory | Select-Object -First 1).FullName
   Copy-Item "$env:USERPROFILE\Downloads\gradle-8.14.3-bin.zip" $h -Force
   Remove-Item "$h\*.part" -Force -ErrorAction SilentlyContinue
   bunx expo run:android   # le wrapper dézippe le fichier local, sans réseau
   ```
   Variante équivalente : ouvrir `apps/mobile/android` comme projet dans
   Android Studio (son téléchargeur n'a pas de délai de 10 s) et lancer le
   build depuis l'IDE, avec `bunx expo start --dev-client` à côté et
   `adb reverse tcp:8081 tcp:8081` pour relier l'émulateur à Metro.

## Règles du dépôt

Le web reste la source de vérité fonctionnelle (PARITE.md) : tout écran mobile
reproduit les textes, calculs et statuts du web — zéro invention, zéro
suppression. Les dépendances supplémentaires doivent être justifiées (poids
 APK < 25 Mo, machine de test 2 Go de RAM).
