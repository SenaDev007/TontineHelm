# SIGNATURE.md — TontiHelm Android : politique de signature unifiée

**Règle absolue (brief mobile, YEHI OR Tech)** : UNE seule clé de signature pour
TOUS les canaux de distribution — l'AAB du Play Store ET les APK d'installation
directe. Un utilisateur qui installe depuis le Play Store doit pouvoir mettre à
jour vers un APK direct (et réciproquement) sans désinstallation : cela exige
des signatures strictement identiques.

| Élément | Valeur |
|---|---|
| Fichier | `tontihelm-release.keystore` (JKS/PKCS12) |
| Alias | `tontihelm` |
| Algorithme | RSA 4096 bits, SHA256withRSA (v2/v3) |
| Validité | 35 ans (Play exige au moins jusqu'au 22/10/2033 ; marge confortable) |
| Dérivables | mot de passe magasin + mot de passe clé, 2 dépositaires minimum |
| Identifiant Android | `bj.yehior.tontihelm` (fixé dans `apps/mobile/app.json`) |

## 1. Génération (une seule fois, phase 6)

```bash
keytool -genkeypair -v \
  -keystore tontihelm-release.keystore \
  -alias tontihelm \
  -keyalg RSA -keysize 4096 -sigalg SHA256withRSA \
  -validity 12775 \
  -dname "CN=TontiHelm, OU=Mobile, O=YEHI OR Tech, L=Cotonou, C=BJ" \
  -storetype PKCS12
```

Le keystore est généré HORS du dépôt (machine hors ligne du dirigeant) puis
versé au coffre (section 3). Il n'entre JAMAIS dans git — `.gitignore` d'
`apps/mobile` exclut `*.keystore` et `*.jks`.

## 2. Play App Signing — aligner la clé du Play sur la nôtre

Play App Signing est obligatoire pour les nouveaux comptes ; l'inscription se
fait au premier téléversement AAB :

1. Créer l'application dans Play Console (compte YEHI OR Tech).
2. À l'étape « Signature de l'application », choisir **« Exporter et importer
   une clé depuis un magasin de clés Java »** (et NON « clé générée par
   Google ») : la clé d'application de Play devient ALORS notre clé
   `tontihelm-release.keystore` — condition indispensable à la règle absolue.
3. Signer l'AAB téléversé avec la même clé (clé de téléversement = clé
   d'application) : aucun double jeu de clés à gérer.

Résultat : l'APK installé par le Play et l'APK direct signé par nos soins ont
la même empreinte (`keytool -printcert -jarfile`), les mises à jour se
croisent sans conflit.

## 3. Conservation et dépositaires

- **Coffre principal** : gestionnaire de secrets YEHI OR Tech (bitwarden/vault
  de l'entreprise) — keystore + les deux mots de passe, accès limité au
  dirigeant et à un second dépositaire désigné par écrit.
- **Sauvegarde froide** : une copie chiffrée sur support hors ligne (clé USB
  scellée, lieu distinct). Test de restauration documenté une fois par an.
- **Perte = application morte** : sans la clé, plus aucune mise à jour sur
  aucun canal (nouveau package = nouvelle application, avis et historique
  perdus). D'où la double conservation.

## 4. Rotation : interdite par principe

La rotation de clé (Play le permet pour les mises à jour via Play uniquement)
casserait le canal d'installation directe — les APK antérieurs ne pourraient
plus mettre à jour vers les nouveaux. **Politique : aucune rotation, jamais.**
En cas de compromission avérée de la clé : publication d'une nouvelle
application (`bj.yehior.tontihelm2`), migration accompagnée des utilisateurs,
dévastation assumée et documentée — c'est le prix de la double distribution.

## 5. Build et signature (phase 6)

- **EAS Build** (recommandé) : keystore transmis en secret EAS
  (`eas credentials`, base64 + mots de passe dans les variables protégées du
  projet Expo) ; builds reproductibles sans machine locale.
- **Chaîne locale de secours** : `cd apps/mobile && bunx eas build -p android
  --profile production --local` (ou `expo run:-android --variant release`) avec
  le keystore du coffre — documentée pour fonctionner sans dépendre d'un seul
  homme.
- Sorties (noms imposés par le brief) :
  - `tontihelm-{version}-universal.apk` — tous ABI (le « gros » APK de secours) ;
  - `tontihelm-{version}-arm64-v8a.apk` — téléphones modernes ;
  - `tontihelm-{version}-armeabi-v7a.apk` — téléphones d'entrée de gamme
    (cible terrain Bénin, machines 2 Go) ;
  - `tontihelm-{version}.aab` — Play Store.
- Chaque APK doit rester **< 25 Mo** (budget du brief) ; le dépassement
  éventuel se traite par allègement, jamais par suppression de fonction.

## 6. Versions et mise à jour forcée

- `versionCode` : monotone strict, incrémenté à CHAQUE build publié (jamais de
  réutilisation) ; `versionName` lisible (`1.0.0`, `1.1.0`…).
- `GET /v1/app/version?versionCode=` (ajout prévu, PARITE.md §8.10) renvoie :
  version minimale prise en charge, dernière version, URL de téléchargement
  APK, message en français — l'application bloque sous le minimum (écran de
  mise à jour obligatoire, aucune donnée locale perdue).

## 7. Check-list de la phase 6 (à cocher au moment voulu)

- [ ] Keystore généré sur machine hors ligne, versé au coffre + sauvegarde froide
- [ ] Compte Play Console créé, inscription Play App Signing par « export/import »
- [ ] AAB signé téléversé, fiche Play renseignée (exemption facturation Google
      Play documentée pour services B2B — voir aussi PARITE.md §8.16)
- [ ] Page de téléchargement des APK directs (hébergement des 3 variantes + somme
      SHA-256 affichée)
- [ ] `GET /v1/app/version` alimenté avec la version minimale
- [ ] Test croisé : installer l'APK direct → mettre à jour via Play, et inversement
- [ ] Empreinte de signature vérifiée identique sur les 4 artefacts

---

*Ce document fait foi pour la phase 6 (signature et distribution). Toute
déviation (rotation, seconde clé, changement d'identifiant) requiert une
décision écrite du dirigeant, journalisée dans PARITE.md §10.*
