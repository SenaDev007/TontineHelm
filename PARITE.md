# PARITE.md — TontiHelm web vers mobile natif Android

Phase 0 (audit du code web existant, avant toute ligne de code mobile).
Source de vérité auditée : frontend Next.js (`/home/z/my-project/src`), backend Express (`/home/z/my-project/backend/src`), schéma Prisma (`/home/z/my-project/backend/prisma/schema.prisma`).
Date de l'audit : 17 octobre 2026. Déploiement : frontend Vercel, API Railway, PostgreSQL Neon.
Mise à jour : **18 octobre 2026 — phase 1 LIVRÉE** — décisions écrites du dirigeant intégrées (journal complet en section 10) ; phase 0 validée ; phase 1 livrée le même jour (monorepo logique, `packages/schemas`, routes `/v1` auth/appareils/sync testées, socle `apps/mobile`, `SIGNATURE.md` — suivi d'exécution en section 11) ; revue de phase 1 : interprétation de l'écart n° 5 confirmée par écrit (§7.5, §10).

Convention de statut utilisée dans ce document (phase 0) :
- **existant** : présent dans le code web, à reproduire tel quel sur mobile ;
- **écart** : divergence entre le brief et le code web, décision demandée ;
- **à ajouter** : absent du web, ajout backend additif prévu par le brief.

---

## 1. Inventaire des rôles et de leurs droits

Cinq rôles existent (`User.role`, schéma Prisma ; `AuthUser`, `backend/src/lib/auth.ts`). Aucun rôle « cotisant » avec compte : le cotisant consulte par lien public (voir section 6).

| Rôle | Identification | Droits constatés dans le code |
|---|---|---|
| `owner` (dirigeant, administrateur principal) | téléphone + PIN 6 chiffres | Tout le back-office : tableau de bord, équipe (crée agents ET gérants — seul rôle autorisé à créer un `manager`, `manager.ts` L207), cotisants, carnets, encaissements, annulations, clôtures (valide/conteste), archive, audit, relances. Onglet Abonnement réservé à ce rôle (`ManagerApp.tsx` L90). Créé à l'inscription self-service (ou par l'admin plateforme historiquement). |
| `manager` (gérant) | téléphone + PIN | Même back-office que le dirigeant sauf : ne crée pas de comptes gérant, pas d'onglet Abonnement. Peut créer des agents (`POST /api/manager/agents`), valider/contester les clôtures, annuler un encaissement (écriture inverse). |
| `agent` (agent collecteur) | téléphone + PIN | Tournée du jour, encaissements (sync par lots), déclaration de caisse, portefeuille clients (création client + premier livret + nouveaux carnets + lien de carnet), consultation des carnets de SA tournée uniquement (`manager.ts` L534-538), fin de souscription (`POST /passbooks/:id/complete`). Ne voit jamais : dashboard, équipe, audit, facturation, carnets d'un autre agent. |
| `controller` (contrôleur) | téléphone + PIN | Lecture seule sur tout le back-office (dashboard, cotisants, carnets, encaissements, clôtures — lecture, archive, audit, facturation, alertes) + exports. Aucune route d'écriture ne l'accepte (`requireRole` ne l'inclut jamais sur les POST). Bannière « Mode contrôleur : consultation et export uniquement. » |
| `admin` (administrateur plateforme YEHI OR Tech) | téléphone + PIN (amorcé par `bootstrap-admin.ts` avec ADMIN_PHONE/ADMIN_PIN) | File des structures : approbation (essai 60 jours), refus avec motif, suspension, réactivation (`admin.ts`). `tenantId` null. C'est le seul rôle sans structure. |
| cotisant | **sans compte** | Lien personnel `/e/{slug}/carnet/{token}` : consultation de ses livrets + signature de fin de souscription. Voir section 6. |

Isolation multi-structure : `tenantId` sur chaque table métier, contrôlé dans chaque requête (`requireTenant` + filtres `where tenantId`). L'agent est en plus filtré par `agentId = user.id` sur sa tournée et son portefeuille. Isolation applicative (pas de RLS PostgreSQL).

---

## 2. Inventaire des modules et des écrans web

### 2.1 Pages Next.js (routes physiques)

| Route | Composant | Rôle | Contenu |
|---|---|---|---|
| `/` | `TontiHelmApp` + sections vitrine | visiteur | Vitrine : Hero, Stats, Problem, Features, Method, Trust, Pricing, LiveDemo (démonstration interactive sans compte), Faq, Footer. |
| `/connexion` | `ConnexionScreen` → `LoginScreen` | tous | Téléphone + PIN 6 chiffres. Normalisation béninoise (+229 si saisie locale). |
| `/inscription` | `RegisterScreen` + `FedaPayCheckout` | visiteur | Inscription en 3 étapes : (1) structure + dirigeant + PIN, (2) palier + période, (3) paiement FedaPay ; activation immédiate après vérification serveur. |
| `/e/[slug]` | `EntityPortalPage` → `LoginScreen` | agents/gérants de la structure | Portail dédié par entité : branding de la structure (nom, ville) puis connexion. |
| `/e/[slug]/carnet/[token]` et `/carnet/[token]` (legacy) | `PublicCarnetScreen` | cotisant | Carnet public du cotisant : livrets, signature de fin de souscription. |
| `/livret/[id]` | `LivretDetailScreen` | manager, owner, controller, agent | Carnet détaillé d'un cotisant (livret annuel 12 feuilles + récap, écritures, fin de souscription). |
| `/confidentialite`, `/conditions-utilisation`, `/mentions-legales` | `LegalPage` | visiteur | Textes légaux. |

### 2.2 Vues internes (post-connexion, routeur par rôle dans `TontiHelmApp.tsx`)

**AgentApp** (`agent/AgentApp.tsx`) — PWA mobile-first, barre du bas à **5** entrées (Tournée, Encaisser, Clients, Clôture, Compte), en-tête avec pilule de synchronisation, simulation hors ligne intégrée (préproduction) :

| Écran | Données lues | Données écrites | Actions |
|---|---|---|---|
| `TourScreen` (Tournée) | `GET /api/agent/tour` : arrêts triés par quartier puis nom, livret de chaque carnet (ligne due, feuille courante, avance, reste), encaissé du jour, quartiers, espèces attendues du jour, mobile money du jour, clôture du jour | — | Ouvrir un arrêt pour encaisser ; filtre par quartier. |
| `CollectScreen` (Encaisser) | tournée locale + fenêtre de lignes encaissables (`payable` : 40 lignes max, ligne due + lignes d'avance, 31e ligne « Entreprise »), `advanceOptions` | outbox locale (localStorage) : un événement UUID par ligne couverte, ou une écriture unique pour une avance mensuelle | 2 modes : ligne à ligne (sélection de lignes, montant ajustable au clavier numérique, lignes partielles autorisées) et avance mensuelle (« Ce mois / +1 mois / +2 mois… », montant et reste calculés). Vibración 60 ms, toasts de confirmation. Contrôles : montant > restant du livret sans avance → refus ; montant > lignes sélectionnées → refus. |
| `ClientsScreen` (Clients) | `GET /api/agent/clients` : portefeuille, tous carnets par client, lien de carnet | `POST /api/agent/clients` (client + 1er livret), `POST /api/agent/clients/:id/carnets` (livret supplémentaire), `POST /api/agent/clients/:id/share` (régénération lien) | Recherche, création en formulaire court, partage WhatsApp/e-mail du lien, « Encaisser sur ce carnet » (ouvre CollectScreen). |
| `ClosingScreen` (Clôture) | espèces attendues du jour + encaissements en attente | `POST /api/agent/closing` (declaredCash) | Déclare ses espèces ; écart affiché ; état de la clôture du jour. |
| `AccountScreen` (Compte) | profil, structure, outbox | — | Synchronisation manuelle, simulation hors ligne, déconnexion (purge des données locales). |

**ManagerApp** (`manager/ManagerApp.tsx`) — sidebar bureau, icônes tablette, menu tiroir mobile ; onglets filtrés par rôle (Abonnement = owner seulement ; contrôleur = lecture seule) :

| Onglet | Données lues | Écritures | Actions |
|---|---|---|---|
| Tableau de bord (`DashboardTab`) | `GET /api/manager/dashboard` : jour/semaine/mois (totaux, espèces/mobile), série 7 jours, répartition du jour par agent et quartier, carnets en retard (classés lignes manquées), écarts de caisse non résolus, activité récente (20), cotisants actifs, montée en charge, alertes de palier, lien d'entité | — | Consultation, navigation vers détail. |
| Équipe (`TeamTab`) | `GET /api/manager/agents` (agents + gérants actifs) | `POST /api/manager/agents` (agent ou gérant) | Création de comptes (gérant : owner uniquement), quotas avec montée en charge automatique. |
| Cotisants (`ContributorsTab`) | `GET /api/manager/contributors` (avec tous carnets + liens) | `POST /api/manager/contributors`, `POST /api/manager/contributors/:id/share` | Recherche, filtres, création (agent référent obligatoire, pièce d'identité obligatoire côté gérant), partage lien, exports PDF/Excel (`GET /api/manager/export/contributors`). |
| Carnets (`PassbooksTab`) | `GET /api/manager/passbooks`, `GET /api/manager/contributors` | `POST /api/manager/passbooks` (nouveau livret), `POST /api/manager/passbooks/:id/remind` (relance WhatsApp, paliers Pro/Institution) | Statut dérivé (retard), détail via `/livret/[id]`, relances. |
| Encaissements (`CollectionsTab`) | `GET /api/manager/collections` (pagination 25, filtres méthode/période/recherche) | `POST /api/manager/collections` (action `reverse` : annulation par écriture inverse, motif obligatoire) | Journal, annulation, exports PDF/Excel filtrés. |
| Clôtures (`ClosingsTab`) | `GET /api/manager/closings` (30 dernières) | `POST /api/manager/closings` (`validate`/`contest`) | Validation (verrouille la journée), contestation avec note. |
| Archive (`ArchiveTab`) | `GET /api/manager/archive` (filtres année/quartier/client/recherche, totaux) | — | Catalogue des souscriptions terminées et signées. |
| Journal d'audit (`AuditTab`) | `GET /api/manager/audit` (pagination 30, filtre action, `chainOk`, compteurs par action) | — | Lecture, filtres, vérification de la chaîne de hash. |
| Abonnement (`BillingTab`, owner) | `GET /api/manager/billing` (abonnement, usage/quotas, volume 30 jours, factures, alertes) | — | Consultation, lien d'entité. |

**AdminApp** (`admin/AdminApp.tsx`) : `GET /api/admin/structures` (file complète avec dirigeant, palier, compteurs), `POST /api/admin/structures` (approve / refuse avec motif / suspend / reactivate).

**PendingScreen** : structure `pending` ou `suspended` — écran d'attente, aucune action.

**Composants transverses** : `OfflineLayer` (service worker + bannière hors ligne + pastille de file + toasts de synchronisation), `AlertsBell` (alertes de palier), `StatusBadge`, `SignaturePad`, `ShareLinkSheet`, `ExportMenu`, `usePlanQuota`.

---

## 3. Inventaire des points d'accès API

Base : backend Express monté sous `/api` (`backend/src/index.ts`). Aucune version d'API n'existe (pas de `/v1`). Format d'erreur unique `{ error: { code, message } }` avec messages en français. Auth : jeton de session opaque 30 jours (Bearer ou cookie httpOnly).

### 3.1 Authentification et inscription

| Méthode et route | Rôles | Entrée | Sortie |
|---|---|---|---|
| `POST /api/auth/login` | public | `{ phone, pin }` (PIN 6 chiffres, scrypt) | `{ token, user { id, phone, fullName, role, tenantId, structureName/Kind/Status } }` + cookie. Essais illimités (aucun verrouillage). |
| `GET /api/auth/me` | session | — | `{ user, subscription { plan, status, periodEnd } }` |
| `POST /api/auth/logout` | session | — | `{ ok }` (supprime la session) |
| `POST /api/structures/register` | public | `{ structureName, kind sfd/groupement/pme, licenseRef?, city, ownerName, ownerPhone, pin, plan, billingPeriod }` | `{ ok, paymentId, amount (calculé serveur : mensuel = prix, annuel = 10 mois), mode }` — draft JSON avec PIN hashé. |
| `POST /api/structures/register/payment` | public | `{ paymentId }` | `{ mode: fedapay/test, paymentUrl (page hébergée FedaPay), transactionId, checkout { public_key, environment, transaction, customer } }` — repli widget intégré sans identifiant. |
| `POST /api/structures/register/verify` | public | `{ paymentId, outcome?, fedapayTransactionId? }` | `{ status: approved/declined/pending, activated, token?, structureName, entityUrl, message }` — statut TOUJOURS relu auprès de FedaPay, activation idempotente (structure ACTIVE + owner + abonnement actif + facture acquittée + audit). |
| `POST /api/structures/register/cleanup` | public | — | `{ ok, expired }` (intention > 24 h → expired) |

### 3.2 Agent

| Méthode et route | Entrée | Sortie |
|---|---|---|
| `GET /api/agent/tour` | — | `{ date, structure { name, lateThreshold }, agent, neighborhoods[], stops[] { contributorId/Name, phone, neighborhood, passbookId/Number/Label, dailyAmount, livret { …feuille courante, payable[40], dueLineInSheet, recap, advanceOptions }, balance, status, statusLabel, collectedToday }, summary { totalStops, collected, remaining, expectedCash, mobileToday }, closing? }` — tri quartier puis nom. |
| `POST /api/agent/sync` | `{ events[≤50] { id: UUID, passbookId, amount ≠ 0, method cash/mobile_money, advance?, coversOn? AAAA-MM-JJ, collectedAt ISO } }` | `{ acks[] { id, status: created/duplicate, collectionId } }`. Rejets en échec HTTP du lot : `day_locked` (409), `bad_state` (409, carnet clos/terminé), `day_out_of_cycle` (422, coversOn hors livret), `amount_exceeds` (422, sans avance au-delà du restant), `read_only`/`suspended` (403). |
| `GET /api/agent/clients` | — | `{ clients[] { id, fullName, phone, email, neighborhood, shareToken, shareUrl, status, carnets[] { id, number, label, status, statusLabel, dailyAmount, balance, livret } } }, entity { name, url } }` |
| `POST /api/agent/clients` | `{ fullName, phone, email?, neighborhood, idNumber?, dailyAmount (min 100), label? }` | 201 `{ contributor, passbook { number }, shareUrl, autoUpgrade? }` — livret démarrant au mois courant, numéro séquence tenant. |
| `POST /api/agent/clients/:id/carnets` | `{ dailyAmount, label? }` | 201 `{ passbook }` |
| `POST /api/agent/clients/:id/share` | — | `{ url }` |
| `POST /api/agent/closing` | `{ declaredCash }` | `{ closing { declaredCash, expectedCash, gap, status: declared }, message }` — écart : « Écart de {montant} FCFA… ». Refus `already_declared` (409). |

### 3.3 Manager / owner / controller

Voir section 2.2 pour l'usage par écran. Routes : `GET /dashboard`, `GET /agents`, `POST /agents` (agent/gérant), `GET /contributors`, `POST /contributors`, `POST /contributors/:id/share`, `GET /passbooks`, `POST /passbooks`, `GET /passbooks/:id/carnet` (également accessible à l'agent pour SA tournée), `POST /passbooks/:id/complete` (fin de souscription : calcule partClient/partEntreprise, passe `closing`, renvoie lien de signature), `POST /passbooks/:id/remind` (relance WhatsApp, palier Pro+), `GET /collections` (pagination 25, filtres), `POST /collections` (action `reverse`), `GET /closings`, `POST /closings` (validate/contest), `GET /audit` (chainOk + pagination 30), `GET /alerts`, `POST /alerts/read`, `GET /billing`, `GET /archive`.

### 3.4 Exports (générés serveur, marque TontiHelm)

| Route | Paramètres | Sortie |
|---|---|---|
| `GET /api/manager/export/contributors` | `format=pdf|xlsx` | Fichier : cotisants groupés par quartier (nom, téléphone, quartier, carnets avec surnom, mises versées, solde, dates). |
| `GET /api/manager/export/collections` | `format`, `from`, `to` (bornes incluses, 5 ans max), `method?` | Fichier : historique des encaissements sur la période. |

### 3.5 Paiements mobile money (M4)

| Route | Entrée | Sortie |
|---|---|---|
| `POST /api/payments` | `{ action: create_link, passbookId, amount ≥ 100 }` | `{ payment { id, amount, linkUrl, status: pending }, message }` — enregistre un paiement `fedapay` avec `linkUrl` simulé en préproduction. |
| `POST /api/payments` | `{ action: simulate_webhook, paymentId, outcome approved/declined }` | approved : écriture `mobile_money` créée avec `id = paymentId` (idempotence : un webhook reçu deux fois = une seule écriture, accusé `deduplicated`), jour calqué sur `paidDays` ; declined : paiement marqué refusé. |

Aucune clé fournisseur côté client ; aucun webhook FedaPay réel n'est encore branché pour les encaissements (seule l'inscription paie réellement via FedaPay).

### 3.6 Public (carnet du cotisant)

| Route | Entrée | Sortie |
|---|---|---|
| `GET /api/public/entities/:slug` | — | `{ name, kind, city }` (identité publique de l'entité, cache 5 min). |
| `GET /api/public/carnets/:token` | — | `{ structure { name, slug }, contributor { fullName, neighborhood }, passbooks[] { number, label, dailyAmount, startsOn, status, statusLabel, balance, coveredLines, missedLines, livret complet, completion }, generatedAt }` — sans auth, anti-abus 60 consultations / 10 min / IP (en mémoire). |
| `POST /api/public/carnets/:token/sign` | `{ passbookId, name, signature? (PNG dataURL ≤ 120 Ko) } | `{ ok, message, passbook { status: completed } }` — archive le carnet. |

### 3.7 Divers

`GET /api/health` (sonde Railway + diagnostic de configuration). Scripts backend : `bootstrap-admin`, vérifications e2e/recette/export/plans, backdate.

---

## 4. Règles de calcul — formules exactes lues dans le code

Références : `backend/src/lib/domain.ts` (règles pures), `backend/src/lib/livret.ts` (moteur du livret annuel), `backend/src/lib/autoscale.ts`, `backend/src/lib/plans.ts`, routes `agent.ts` / `manager.ts` / `payments.ts`.

### 4.1 Le modèle réel : le LIVRET ANNUEL (écart majeur avec le brief, voir section 7)

Le carnet du web n'est plus un « cycle de N jours » : c'est un **livret annuel** (`livret.ts`).

- `LIVRET_MONTHS = 12`, `SHEET_DAYS = 31`, `LIVRET_DAYS = 372` lignes. `Passbook.cycleDays = 372`, `startsOn = premier jour du mois de création` (`monthStart`).
- Chaque feuille mensuelle porte 31 lignes ; **la 31e ligne est la mise de l'entreprise** : marquée, jamais inscrite — le client verse 31 mises par mois, les 30 premières créditent son livret, la 31e revient à la structure.
- Les écritures remplissent les lignes **séquentiellement** (comme le marquage du carnet papier) : chaque encaissement couvre la prochaine ligne non couverte ; payer davantage avance le marquage ; être en retard laisse la ligne due non couverte ; le reliquat constitue une ligne partielle.
- **Règle d'équité (2026-10-17)** : personne n'est en retard pour des jours antérieurs à son arrivée. `effectiveStartDay = max(1er du mois de départ, jour de création)` ; `firstPayableLine` = ligne du jour d'arrivée ; les lignes précédentes sont « excusées » (non dues, hors attendu, hors retard).

### 4.2 Formules unitaires (`domain.ts`, inchangées côté web)

- `formatFCFA(n) = Intl.NumberFormat("fr-FR").format(n) + "\u00A0FCFA"` — une seule fonction pour toute l'application.
- `passbookBalance(collections) = Σ amount` (annulations négatives incluses).
- `paidDays(balance, dailyAmount) = max(0, floor(balance / dailyAmount))`.
- `elapsedDays(passbook, today) = min(max(floor((today − startsOn)/1j) + 1, 0), cycleDays)`.
- `missedDays = max(0, elapsedDays − paidDays)`.
- `isLate = missedDays ≥ lateThreshold` (3 par défaut, `Structure.lateThreshold`).
- `cycleCommission(dailyAmount, cycleDays, commissionDays = 1) = commissionDays × dailyAmount` — **présente dans domain.ts mais plus utilisée par les flux actifs** : la commission réelle est la « part entreprise » du livret (4.4). `Structure.commissionDays` existe toujours (affiché dans le détail carnet).
- `closingGap(declaredCash, expectedCash) = declaredCash − expectedCash` ; `expectedCash = Σ encaissements espèces du jour` (hors mobile money).
- `maxCollectionAmount(passbook, balance, advanceAllowed) = advanceAllowed ? cycleTotal + dailyAmount : max(0, cycleTotal − balance)` — utilisée en esprit dans `agent.ts` (le contrôle effectif compare au `recap.attendu` du livret).

### 4.3 Formules du livret (`livret.ts`, buildLivret)

- `firstLine = firstPayableLine(passbook)` ; `excusedTotal = firstLine − 1` ; `payableTotal = 372 − excusedTotal`.
- `coveredLines = min(payableTotal, floor(max(0, balance) / mise))` ; `partial = balance − coveredLines × mise` (ligne partielle).
- `attendu (feuille) = mise × payableCount` où `payableCount = 31 − excused(feuille)` ; `encaisse (feuille) = coveredInSheet × mise + sheetPartial`.
- `attenduTotal = mise × payableTotal` ; `reste = max(0, attenduTotal − balance)` (« il lui reste à prendre »).
- `partEntreprise (feuille) = min(mise, max(0, encaisse − mise × clientLines))` avec `clientLines = payableCount − 1` ; `partClient (feuille) = min(encaisse, mise × clientLines)`. Totaux : `partEntreprise`, `partClient = max(0, balance − partEntreprise)`.
- `missedLines = max(0, Σ lignes échues − coveredLines)` — les lignes échues se comptent par calendrier depuis le jour d'arrivée.
- `avance (feuille) = max(0, encaisse − mise × elapsedLines)` ; `avanceTotale = Σ feuilles`.
- **Avances mensuelles** (options proposées à l'encaissement) : pour chaque feuille cible m : `amount = mise × (m×31 − firstLine + 1) − balance` si > 0 ; `resteAfter = max(0, attenduTotal − balance − amount)`.
- Statut dérivé : `late = (status == active) && missedLines ≥ lateThreshold`. Libellés : « À jour », « En retard », « Remise en cours », « Terminé et signé », « Clos », « Retiré ».

### 4.4 Fin de souscription (`POST /passbooks/:id/complete`)

`payoutAmount = recap.partClient` (montant à remettre), `companyAmount = recap.partEntreprise` (part de la structure). Le carnet passe `closing` ; le client signe sur son lien (`/sign`) → `completed` + archivage. Exemple de cohérence avec le brief : une feuille mensuelle complète à 500 FCFA = 15 500 FCFA cotisés, 500 FCFA de part entreprise (la 31e mise), 15 000 FCFA au client — la règle « 31 jours / commission d'un jour » du brief correspond à UNE feuille du livret.

### 4.5 Encaissement et annulation

- `dayIndex` d'une écriture sync : `min(firstPayableLine + paidDays(balance + amount) − 1, 372)` (numérotation séquentielle, lignes d'avant arrivée excusées).
- Annulation (`POST /api/manager/collections`, action `reverse`) : écriture `amount = −original.amount`, même `dayIndex`/`coversOn`/`method`, `reversesId = original.id`, `collectedAt = maintenant` ; refus si déjà annulée, déjà négative, ou journée verrouillée par clôture validée. Jamais de modification ni suppression.
- Paiement mobile money approuvé : `dayIndex = min(paidDays(balance + amount), cycleDays)` ; `Collection.id = Payment.id` (idempotence webhook).
- Clôture validée → `POST /api/agent/sync` refusé avec `day_locked` pour la journée.

### 4.6 Abonnement et facturation

- Paliers (`plans.ts`) : Démarrage 15 000 FCFA/mois, 1 agent, 50 cotisants, sans relances ; Pro 35 000, 10 agents, 300 cotisants, relances ; Institution 75 000, 40 agents, 3 000 cotisants, relances. Annuel = 10 mois (2 offerts) à l'inscription.
- « Cotisant actif pour la facturation » = `count(Contributor WHERE status = active)` (usage `billing`, autoscale).
- Montée en charge automatique (`autoscale.ts`) : palier requis par cotisants/agents ; **le volume encaissé sur 30 jours glissants fait monter le palier tout seul** (≥ 2 M FCFA → Pro, ≥ 20 M → Institution) ; approche ≥ 80 % des quotas → alerte « tu vas scaler » (au plus une tous les 7 jours) ; dépassement → bascule automatique + événement `plan_upgraded` + audit.
- `assertWritable` : refus d'écrire si structure `suspended` ou abonnement `read_only` (« Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements. »).
- Statuts d'abonnement : `trial | active | past_due | read_only | canceled`. **Aucun code ne bascule `past_due` → `read_only`** (le commentaire de `tenant.ts` évoque 15 jours mais la bascule n'existe pas) — écart à trancher (section 7).
- Essai 60 jours uniquement via l'approbation admin (`admin.ts`). L'inscription self-service crée directement `active`.

### 4.7 Journal d'audit

Chaîne scellée : chaque entrée porte `prevHash` (hash de la précédente) et `hash = sha256(prevHash + corps JSON)` ; `seq` auto-increment par structure. `verifyAuditChain` re-parcourt et valide. Actions journalisées : login, collection, reverse, closing_declared, closing_validated, contributor_created, passbook_created, passbook_completion_initiated, passbook_signed, reminder_sent, payment_link_created, payment_approved, team_member_created, structure_approved/suspended/reactivated/activated, plan_auto_upgraded, report_exported.

---

## 5. Matrice de parité web → mobile

Légende statut (phase 0) : **planifié** (reproduction conforme), **adapté** (interface adaptée, fonction conservée), **écart** (décision demandée section 7), **ajout** (nouveau, autorisé par le brief).

| # | Fonction/écran web | Équivalent mobile | Adaptation d'interface prévue | Point d'accès à ajouter ou modifier | Risque |
|---|---|---|---|---|---|
| 1 | Connexion `/connexion` (téléphone + PIN 6) | Écran de connexion personnel | Identique (PIN 6, normalisation +229) | **Ajout** : authentification mobile dédiée (OTP SMS d'enregistrement d'appareil, 2FA owner/gérant, jetons 15 min + rotation 30 j, Argon2id, verrouillage 15 min après 5 essais) — le web garde sa session 30 jours telle quelle | Moyen — deux schémas d'auth parallèles, ne pas toucher au web |
| 2 | Portail d'entité `/e/[slug]` | Écran d'accueil : choix de profil après connexion | Le cotisant et le personnel partagent l'application ; sélecteur « Continuer en tant que… » | Réutiliser `GET /api/public/entities/:slug` | Faible |
| 3 | Inscription self-service 3 étapes + FedaPay | **Reproduite sur mobile** (décision n° 12, 18/10/2026) | 3 étapes plein écran, PIN 6 chiffres, paiement FedaPay en navigateur intégré | — (routes `/api/structures/register*` réutilisées) | Moyen — retour applicatif après paiement |
| 4 | Vitrine `/` (landing, LiveDemo, FAQ) | Hors périmètre mobile | — | — | Faible — aucune fonction métier |
| 5 | Tournée (`TourScreen`) | Onglet Tournée | Tri par quartier conservé, cartes empilées, pilule de synchronisation permanente | `GET /v1/sync/pull` **à ajouter** (instantané tournée + données de référence avec curseur) — `/api/agent/tour` reste pour le web | Moyen — cohérence des deux canaux |
| 6 | Encaissement (`CollectScreen`) : ligne à ligne + avance mensuelle | Écran Encaisser | En-tête carnet + clavier numérique en bas + bouton collé « Encaisser {montant} FCFA » ; 2 modes conservés ; vibration courte ; chiffré localement | `POST /v1/sync/push` **à ajouter** (accusé par événement : accepté/doublon/rejeté avec motif — aujourd'hui le rejet métier fait échouer tout le lot en HTTP) | Élevé — reprises par lots, idempotence UUID, rejets par événement |
| 7 | File d'envoi agent (localStorage, lots de 50, idempotence UUID) | Outbox SQLite chiffrée | Identique + indicateur permanent, écran de reprise en cas de rejet, blocage après 7 jours hors ligne | UUID **v7 imposé** côté téléphone (le schéma Zod actuel accepte tout UUID) ; `deviceId` et décalage d'horloge dans l'événement | Moyen |
| 8 | Clients de l'agent (`ClientsScreen`) | Onglet Clients | Recherche instantanée, filtres agent/quartier, création en formulaire multi-étapes court | — (routes `/api/agent/clients*` réutilisées) | Faible |
| 9 | Déclaration de caisse (`ClosingScreen`) | Onglet Clôture | Identique (déclarer espèces, écart, verrouillage après validation gérant) | — (route `/api/agent/closing` réutilisée) | Faible |
| 10 | Tableau de bord (`DashboardTab`) | Onglet Tableau de bord | Cartes de chiffres + graphiques simples (react-native-svg), filtres en tiroir bas | — (route `/api/manager/dashboard` réutilisée) | Faible |
| 11 | Équipe (`TeamTab`) | Onglet Équipe | Cartes empilées téléphone, tableau tablette | — | Faible |
| 12 | Cotisants (`ContributorsTab`) + création | Onglet Cotisants | Formulaire court multi-étapes ; pièce d'identité masquée | — | Faible |
| 13 | Carnets (`PassbooksTab`) + création livret | Onglet Carnets | Identique, cartes | — | Faible |
| 14 | Détail carnet `/livret/[id]` (livret 12 feuilles + récap) | Écran Détail du carnet | Feuilles en onglets/carrousel, anneau de progression, filtre par mois | — (route `/api/manager/passbooks/:id/carnet` réutilisée) | Moyen — densité de l'affichage livret |
| 15 | Encaissements + annulation (`CollectionsTab`) | Onglet Encaissements | Cartes empilées, annulation par écriture inverse conservée | — | Faible |
| 16 | Clôtures validation/contest (`ClosingsTab`) | Onglet Clôtures | Identique | — | Faible |
| 17 | Archive (`ArchiveTab`) | Onglet Archive | Filtres année/quartier/client | — | Faible |
| 18 | Journal d'audit (`AuditTab`) + chaîne | Onglet Audit | Lecture + filtres + vérification chaîne + **export du journal** (décision n° 10) | **Ajout** : `GET /api/manager/export/audit` (PDF/Excel, filtres) | Faible |
| 19 | Abonnement (`BillingTab`, owner) | Onglet Abonnement | Consultation usage/factures/alertes | — | Faible |
| 20 | Administration plateforme (`AdminApp`) | Onglet Administration | Interface adaptée (cartes), fonction conservée | — | Faible — décision n° 11 : conservée sur mobile |
| 21 | Exports PDF/Excel (`ExportMenu`, `downloadFile`) | Export + partage | `expo-sharing`/`expo-file-system` : téléchargement puis partage natif | — (routes export réutilisées) | Faible |
| 22 | Relance WhatsApp (`remind`) | Bouton Relance | Ouverture WhatsApp (Linking) avec message préparé | — | Faible |
| 23 | Notifications modèles `receipt`/`late_reminder`/`cycle_end` | **Décision n° 2** : le web n'émet plus de reçu SMS ; le mobile reproduit l'état du web (lien de carnet), relance WhatsApp conservée | — | — (aucun envoi SMS à reproduire) | Faible |
| 24 | Fin de souscription + signature + archivage | Écran Fin de cycle (côté gérant) + signature du cotisant dans l'espace cotisant | Signature au doigt ( tracé natif) | — | Moyen |
| 25 | Espace cotisant web (lien public par jeton) | **Espace cotisant mobile authentifié** (téléphone + OTP + PIN 4/biométrie) | Écrans dédiés simples (18 px, chiffres grands, tutoiement) | **Ajout** : points d'accès `/v1/me/*` isolés par identité (section 8.5) — le lien public du web reste en service | Élevé — seule fonctionnalité nouvelle autorisée |
| 26 | PWA offline (SW + cache GET + outbox générique) | Mode hors ligne natif | SQLCipher + expo-background-task ; reprise 2/4/8/16 s puis 5 min ; blocage 7 jours | `deviceId` obligatoire dans les événements ; mesure du décalage d'horloge | Moyen |
| 27 | Lecture seule abonnement (bannière + `assertWritable`) | Bandeau + verrouillage de saisie | Identique | — | Faible |
| 28 | Paliers/quota/autoscale (création agents/cotisants) | Identique | Toasts d'auto-upgrade conservés | — | Faible |
| 29 | Statuts et libellés (À jour, En retard, Remise en cours, Terminé et signé, Clos, Retiré) | Identique | Couleur + icône + mot | — | Faible |
| 30 | Textes français et messages de référence | Identiques, fichier unique de chaînes | Reprendre les textes du web | — | Faible |

---

## 6. État de l'espace cotisant dans le web

**Il existe, sous une forme différente de celle du brief.**

- Le cotisant n'a **pas de compte** : il consulte un **lien personnel** détenu seul, `/e/{slug}/carnet/{token}` (et `/carnet/[token]` legacy), où `token = Contributor.shareToken` (24 caractères URL-sûrs, non énumérable, généré à la création ou à la première demande — `share.ts`).
- Contenu (route publique `GET /api/public/carnets/:token`, sans auth, `no-store`, anti-abus 60/10 min/IP) : nom de la structure, nom et quartier du cotisant, et pour **tous ses livrets** : numéro, surnom, mise, solde, statut dérivé (retard), livret complet (12 feuilles avec attendu/encaissé/avance/reste/part client/part entreprise + 13e récapitulatif, lignes excusées, avances possibles), état de la signature de fin de souscription (`payoutAmount`, `companyAmount` quand la remise est préparée).
- **Écriture unique possible** : `POST /api/public/carnets/:token/sign` — signature de fin de souscription (nom + tracé PNG) qui archive le carnet.
- Aucune donnée sensible : pas de pièce d'identité, pas de téléphone, pas de données d'abonnement, pas de journal d'audit.
- Isolation : par possession du jeton (un jeton = un cotisant = une structure). Le téléphone n'est **pas** une identité dans le web ; il n'y a donc ni regroupement multi-structures, ni OTP, ni PIN, ni choix de profil.
- Distribution du lien : l'agent/le gérant partage par WhatsApp (`wa.me` pré-rempli, message `shareMessage`) ou e-mail (`mailto`). Historiquement des reçus SMS existaient ; ils ont été **supprimés** (tâche 5 du journal) au profit du lien.

Conséquence pour le mobile : l'espace cotisant authentifié du brief (numéro de téléphone = identité, OTP SMS, PIN 4, regroupement par structure, lecture seule stricte) est **la seule fonctionnalité nouvelle autorisée** ; les points d'accès `/v1/me/*` sont des ajouts. Le lien public du web reste valable et doit continuer de fonctionner.

---

## 7. Écarts entre le brief et le code web (dans les deux sens)

Décisions **tranchées par écrit par le dirigeant le 18 octobre 2026** (journal en section 10) ; le texte des écarts est conservé ci-dessous avec chaque décision annexée. Les écarts sans décision explicite suivaient déjà la règle « le web est la source de vérité » ou des ajouts planifiés par le brief.

**Sens : le brief décrit une chose que le web ne fait plus ou pas.**

1. **Modèle de carnet.** Le brief décrit un cycle de N jours (« Jour {n} sur {total} », « date de fin prévue », formule « jours du cycle × mise − solde », commission = commissionDays × mise). Le web a évolué vers le **livret annuel** : 372 lignes, 12 feuilles mensuelles, 31e ligne = mise entreprise, lignes excusées avant l'arrivée, avances mensuelles calculées, « reste à prendre » = `max(0, attendu − encaissé)`. La règle de parité dit que le code web est la source de vérité ; le cas de test « 31 jours à 500 FCFA → 15 500 / 500 / 15 000 » du brief correspond exactement à **une feuille mensuelle** du livret (cohérent). Décision demandée : confirmer que le mobile reproduit le **livret annuel** (recommandé : oui, sinon divergence web/mobile immédiate) et que l'anneau de progression s'appuie sur `coveredLines/payableLines`. **Décision (18/10/2026) : le mobile reproduit le livret annuel.** Recommandation suivie — parité stricte avec le web ; anneau de progression sur `coveredLines / payableLines` ; le cas « 31 jours à 500 FCFA → 15 500 / 500 / 15 000 » est validé comme UNE feuille mensuelle du livret.
2. **Reçus SMS.** Le brief exige « Le reçu SMS part du serveur après la synchronisation » (M3) et mentionne des modèles `receipt`/`cycle_end`. Le web a **supprimé** tout envoi de SMS : le cotisant consultte son lien. Le schéma `Notification` existe (modèles listés) mais seule `late_reminder` (WhatsApp) est réellement écrite. Décision demandée : le mobile reproduit-il l'état actuel (lien de carnet, aucun SMS — recommandé pour la parité) ou réactive-t-on les reçus SMS côté serveur (ajout backend + coût + texte à valider) ? **Décision (18/10/2026) : le web les a supprimés — lien de carnet à la place.** Le mobile reproduit l'état actuel du web : aucun SMS de reçu ni de fin de cycle, le cotisant consulte son lien de carnet (puis son espace mobile authentifié) ; la relance WhatsApp `late_reminder` est conservée. Précision : les OTP d'authentification (enregistrement d'appareil du personnel, espace cotisant `/v1/me/*`) ne sont pas des reçus — ils restent au programme.
3. **Clôture « validée verrouille les encaissements de la journée »** : vrai côté web au sens strict pour la **synchronisation du jour courant** et l'annulation (`day_locked`). Les événements datés d'un autre jour que la clôture ne sont pas bloqués par cette garde. À reproduire à l'identique ; signalé pour précision.
4. **Changement d'agent en cours de cycle** (cas de test obligatoire du brief) : **aucune fonction du web** ne réassigne un carnet à un autre agent (`Passbook.agentId` fixé à la création ; aucune route, aucun écran). Le mobile ne peut pas reproduire une fonction inexistante. Décision demandée : abandonner ce cas de test, ou l'ajouter (ce serait une nouvelle règle métier, donc hors parité). **Décision (18/10/2026) : fonction à ajouter.** Réassignation d'un cotisant et de ses carnets actifs à un autre agent en cours de cycle — ajout backend additif journalisé (`agent_reassigned`), interface web d'abord (source de vérité), puis mobile ; spécification en section 8.13. Le cas de test obligatoire du brief redevient exécutable.
5. **Cycle de 1 jour** (cas de test du brief) : impossible dans le modèle livret (12 mois fixes, `cycleDays = 372`, `dailyAmount ≥ 100`). Le cas de test « cycle de 1 jour » n'a pas d'équivalent web. Décision demandée : remplacer ce cas par « feuille du mois d'arrivée proratisée » (lignes excusées) qui couvre le même risque de bornes. **Décision (18/10/2026) : fonction à ajouter.** Interprétation retenue : la durée de cycle devient paramétrable à la création du carnet — livret annuel (372 lignes) par défaut et produit standard, cycles courts possibles jusqu'à la borne minimale de 1 jour, le moteur du livret se généralisant (dernière ligne de chaque feuille = mise entreprise, dernière feuille éventuellement partielle) ; le cas « cycle de 1 jour » redevient exécutable en borne minimale (une ligne, mise entièrement en part entreprise). **Interprétation confirmée en revue de phase 1 (18/10/2026, écrit du dirigeant : « écarts 4 et 5 : spécifiés en §8.13/§8.14 — réassignation d'agent et durée de cycle paramétrable, livret annuel par défaut »)** — la recommandation initiale de remplacement du cas de test est écartée ; l'extraction de `packages/domain` (comportement actuel, faite et testée) précède cette modification, qui reste à implémenter web d'abord. Spécification en section 8.14.
6. **Flux d'abonnement « essai → actif → en retard → lecture seule → réactivation »** : le web gère `trial` (approbation admin, 60 jours), `active`, `read_only` (verrouillage d'écriture), `canceled` ; mais **aucun code ne fait passer `past_due` à `read_only`** (la bascule « impayé > 15 jours » est évoquée en commentaire, jamais implémentée), et la facturation mensuelle n'a pas de cron de relance. Décision demandée : implémenter la bascule (ajout backend additif, recommandé) ou documenter que la lecture seule n'est today déclenchée que manuellement. **Décision (18/10/2026) : ajouter.** Bascule automatique `past_due` → `read_only` après 15 jours d'impayé — vérification au fil des requêtes + passe quotidienne, journalisée ; spécification en section 8.12.
7. **Authentification mobile** : le web n'a ni Argon2id, ni OTP SMS, ni 2FA, ni jetons courts, ni rotation, ni verrouillage après 5 essais, ni gestion des appareils. Le brief prévoit ces ajouts (« si absente du web ») — ils sont donc des ajouts backend, sans toucher à l'authentification web. Confirmé : à construire en phase 1.
8. **Limite de débit 300 req/min sur la synchronisation** : inexistante (seul le carnet public est limité, 60/10 min/IP, en mémoire). À ajouter.
9. **`GET /v1/app/version`** : inexistant. À ajouter (phase 6).
10. **Export du journal d'audit** (M8 du brief : « lecture, filtres et export du journal ») : le web exporte les cotisants et les encaissements, **pas le journal d'audit**. Décision demandée : ajouter l'export du journal (ajout backend additif, recommandé pour satisfaire le brief) ou le retirer du périmètre mobile. **Décision (18/10/2026) : ajouter.** `GET /api/manager/export/audit` en PDF/Excel avec filtres, journalisé `report_exported` ; spécification en section 8.15.
11. **Administration de la plateforme sur mobile** : elle existe dans le web (AdminApp) et le brief demande de la conserver avec adaptation (« précise à z.ai de la laisser sur le web si tu préfères »). Recommandation : la conserver sur mobile en interface adaptée (la matrice ligne 20 la planifie) — décision du dirigeant attendue. **Décision (18/10/2026) : la conserver sur mobile** (interface adaptée en cartes, routes `/api/admin/*` réutilisées).

**Sens : le web possède des fonctions absentes du brief (à reproduire pour parité).**

12. **Inscription self-service avec paiement FedaPay** (3 étapes, activation immédiate) : le brief ne la mentionne pas. Recommandation : non reproduite sur mobile (inscription sur le web), l'application mobile sert les comptes existants. Décision demandée. **Décision (18/10/2026) : l'ajouter.** L'inscription self-service (3 étapes + paiement FedaPay) est reproduite sur mobile — paiement en navigateur intégré, vérification serveur du statut, activation idempotente (section 8.16) ; la recommandation initiale est écartée.
13. **Avances mensuelles calculées** (options « Ce mois / +1 mois / +2 mois », montant et reste affichés) : fonction majeure du web absente du brief — sera reproduite (règle de zéro suppression).
14. **Lignes excusées avant l'arrivée du cotisant** (règle d'équité 2026-10-17) : absente du brief — sera reproduite.
15. **Fin de souscription + signature numérique + module Archive** : absents du brief — seront reproduits (l'espace cotisant mobile hébergera aussi la signature, comme le lien public du web).
16. **Montée en charge automatique des paliers** (autoscale par volume/cotisants/agents, alertes dirigeants) : absente du brief — sera reproduite (création agents/cotisants sur mobile déclenche les mêmes contrôles).
17. **Portails d'entité `/e/{slug}`** : le brief n'en parle pas — le mobile affichera la structure courante après connexion ; le portail web reste.
18. **Cinquième onglet agent** : le web a **5** entrées (Tournée, Encaisser, Clients, Clôture, Compte), le brief en spécifie 4 (sans Clients). Recommandation : conserver 5 entrées pour la parité des fonctions (création de clients sur le terrain). Décision demandée. **Décision (18/10/2026) : barre agent à 5 entrées** — Tournée, Encaisser, Clients, Clôture, Compte (parité avec la PWA web).
19. **Démo en direct / vitrine / pages légales** : sans objet sur mobile ; les textes légaux seront accessibles depuis l'écran Compte (exigence de distribution).

**Points de vigilance technique constatés dans le web (à ne pas régresser).**

20. L'outbox agent du web vit dans `localStorage` (non chiffré) — le mobile utilisera SQLite chiffrée conformément au brief ; comportement fonctionnel identique.
21. La reprise réseau du web agent est naïve (relance au retour en ligne) alors que le client générique a un backoff [2 s, 5 s, 15 s, 45 s, 60 s] avec gigue — le mobile implémentera la séquence 2/4/8/16 s puis 5 min du brief dans `packages/sync`.
22. Aucune pull incrémentale : `/api/agent/tour` renvoie tout l'état ; `/v1/sync/pull` avec curseur est un ajout.
23. Le rejet métier d'un événement sync fait échouer **tout le lot** (erreur HTTP) ; le brief exige un accusé par événement — l'endpoint `/v1/sync/push` devra répondre événement par événement (le point 4 de la section 8 détaille la compatibilité).
24. `day_out_of_cycle` du web s'appelle désormais « hors du livret annuel (12 feuilles) » — même code d'erreur, message à reprendre.

---

## 8. Modifications backend nécessaires (toutes additives)

Principe vérifié : le web continue de fonctionner sans changement ; les routes `/api/*` existantes restent ; tout ajout est monté sous `/v1`.

1. **Préfixe `/v1` stable** : nouveau point de montage dans `backend/src/index.ts` ; aucune route existante déplacée.
2. **`POST /v1/sync/push`** : lot ≤ 50 événements, idempotent par UUID généré par le téléphone (imposer **v7** côté mobile ; le schéma actuel `z.string().uuid()` l'accepte déjà), réponse **accusé par événement** (`accepté | doublon | rejeté + motif`) au lieu de l'échec HTTP de lot. Réutilise les règles métier de `POST /api/agent/sync` (verrous de clôture, contrôles de montant, jour calé par `firstPayableLine + paidDays`). Tests : idempotence (3 envois répétés = 100 lignes), rejets par événement.
3. **`GET /v1/sync/pull?cursor=`** : données de référence (cotisants, carnets, soldes, quartiers) + tournée de l'agent, incrémental. Le web garde `GET /api/agent/tour`.
4. **Identifiants d'encaissements côté téléphone** : déjà conforme (UUID client, unicité par clé primaire, accusé `duplicate`). Complément : champ `deviceId` + horodatage téléphone dans le payload d'événement (sans casser le schéma — JSON toléré).
5. **Enregistrement des appareils** : nouvelle table `Device { id, userId, label, registeredAt, revokedAt, lastSyncAt, clockSkewMs }` + routes de listing/révocation pour le gérant (interface web conservée telle quelle, ajout mobile). Effacement des données locales à la reconnexion après révocation : détection côté mobile via l'état de l'appareil renvoyé par `/v1/sync/pull` ou l'authentification.
6. **Décalage d'horloge** : calculé à chaque synchronisation (horodatage téléphone vs serveur) ; au-delà de 10 minutes : alerte au gérant (Notification/PlanEvent) et marquage des lignes concernées.
7. **Authentification mobile du personnel** : Argon2id pour le PIN (le web garde scrypt — les deux schémas coexistent sur des colonnes distinctes ou un préfixe de hachage), code SMS à usage unique pour l'enregistrement d'appareil, second facteur owner/gérant, jeton d'accès 15 min + jeton de renouvellement à rotation lié à l'appareil (30 j), blocage 15 min après 5 essais erronés. **Aucune modification de `/api/auth/*`**.
8. **Annulation par écriture négative** : **déjà conforme** (`reversesId`, montant négatif, journal d'audit chaîné, aucune modification/suppression). Aucun changement requis ; le SMS éventuellement associé dépend de la décision n° 2.
9. **Limite de débit 300 req/min** sur `/v1/sync/*` : middleware dédié (compteur par jeton/appareil).
10. **`GET /v1/app/version?versionCode=`** : dernière version, version minimale prise en charge, URL de téléchargement APK, message en français. Alimenté par la page de téléchargement (phase 6).
11. **Espace cotisant `/v1/me/*`** (lecture seule stricte) : `GET /me/passbooks`, `GET /me/passbooks/{id}`, `GET /me/passbooks/{id}/collections?cursor=`, `GET /me/receipts/{collectionId}`, `GET /me/structures/{id}/contact`. Isolation par identité cotisant authentifiée (politique au niveau base ou équivalent applicatif strict), y compris entre structures ; OTP SMS (3 envois/heure/numéro, blocage 15 min après 5 essais), PIN 4/biométrie côté téléphone. Déclaré comme écart/ajout conformément au brief ; proposition web équivalente documentée.
12. **`past_due` → `read_only`** (décision n° 6 : à ajouter) : vérification au fil des requêtes authentifiées (bascule au plus une fois, journalisée `subscription_read_only`) + passe quotidienne inspirée de `register/cleanup` ; 15 jours d'impayé après la fin de période.

13. **Réassignation d'agent en cours de cycle (décision n° 4)** : `POST /api/manager/contributors/:id/reassign` `{ agentId }` — tous les carnets actifs du cotisant suivent le nouvel agent ; contrôles : agent cible actif et de la même structure ; écriture d'audit `agent_reassigned` (agent source, agent cible) ; les encaissements passés conservent leur agent d'origine ; tournée du jour recalculée pour les deux agents. Interface web (onglet Cotisants) d'abord, puis mobile.
14. **Cycles courts paramétrables (décision n° 5, interprétation à confirmer en revue de phase 1)** : `Passbook.cycleDays` paramétrable à la création, bornes 1..372, défaut 372 (livret annuel inchangé) ; généralisation du moteur `livret.ts` (feuilles de 31 lignes, dernière ligne de chaque feuille = mise entreprise, dernière feuille éventuellement partielle) ; champ optionnel « durée du cycle » à la création d'un carnet (agent et gérant). Implémenté web d'abord, tests de bornes (1 jour, mois d'arrivée proratisé, 372).
15. **Export du journal d'audit (décision n° 10)** : `GET /api/manager/export/audit?format=pdf|xlsx` — mêmes générateurs serveur (marque TontiHelm), filtres action/période, journalisation `report_exported`. Bouton dans l'onglet Audit du web ; export + partage natif sur mobile.
16. **Inscription sur mobile (décision n° 12)** : réutilisation des routes `/api/structures/register*` sans modification ; paiement FedaPay en navigateur intégré avec retour applicatif ; le statut est TOUJOURS revérifié serveur (activation idempotente). Vigilance distribution : documenter l'exemption Google Play Billing (services B2B) dans DISTRIBUTION.md (phase 6).

Chaque ajout recevra ses tests d'intégration (idempotence, isolation cotisant entre cotisants et entre structures, non-régression webhook dupliqué, verrous de clôture, réassignation d'agent, bornes des cycles courts).

**Dépendances mobiles à poids justifié (au-delà d'Expo requis par le brief)** : aucune envisagée hors de la liste imposée à ce stade ; toute dépendance > 100 Ko ajoutée en phase 1+ sera justifiée ici même (Skia reste interdit sauf justification chiffrée).

---

## 9. Ce que la phase 0 conclut

- Le web est **la source de vérité** : le livret annuel (12 feuilles, 31e ligne entreprise, lignes excusées, avances mensuelles), l'annulation par écriture inverse, la chaîne d'audit, les paliers avec montée en charge automatique, la fin de souscription signée et l'archive sont les règles à reproduire à l'identique.
- **Phase 0 validée le 18 octobre 2026** : les 9 écarts bloquants (n° 1, 2, 4, 5, 6, 10, 11, 12, 18) sont tranchés par décision écrite du dirigeant — journal en section 10. Les ajouts métier décidés (réassignation d'agent, cycles courts, bascule `read_only`, export du journal d'audit) seront implémentés **web d'abord**, puis reproduits sur mobile.
- **Phase 1 ouverte** : monorepo (`apps/web` sans régression, `apps/mobile`, `packages/domain` / `sync` / `api-client` / `schemas`), extraction de `packages/domain` avec tests de non-régression écrits AVANT l'extraction, socle mobile, ajouts backend additifs `/v1`, SIGNATURE.md. Le déplacement physique du frontend dans `apps/web` sera coordonné avec le réglage Vercel (Root Directory) afin de n'interrompre à aucun moment le déploiement web ; en attendant, `packages/domain` est la source de vérité et le backend la consomme par synchronisation vérifiée (diff nul).

**Phase 1 — livrée le 18 octobre 2026** (détail et statuts en section 11) : `packages/schemas` (Zod, diff nul backend), routes `/v1` montées et testées (auth mobile, appareils, sync push/pull — 29 tests dédiés, suite backend 62 tests verts, non-régression `/api/agent/sync` prouvée par test), socle `apps/mobile` (Expo, connexion + OTP + sonde de synchronisation sur `/v1`), `apps/web/README.md` (procédure de déménagement différé), `SIGNATURE.md`. Les ajouts métier web d'abord (§8.12-§8.15) restent à implémenter — ils ne font PAS partie de la phase 1 livrée.

---

## 10. Journal des décisions du dirigeant — 18 octobre 2026

Réponse écrite du dirigeant aux écarts bloquants (section 7). Ces décisions font foi pour toutes les phases suivantes.

| Écart | Sujet | Décision |
|---|---|---|
| 1 | Modèle de carnet | **Le mobile reproduit le livret annuel.** |
| 2 | Reçus SMS | **Le web les a supprimés (lien de carnet à la place)** — le mobile reproduit l'état du web ; les OTP d'authentification restent au programme. |
| 4 | Changement d'agent en cours de cycle | **Fonction à ajouter** (réassignation, web d'abord). |
| 5 | Cas « cycle de 1 jour » | **Fonction à ajouter** — durée de cycle paramétrable, livret annuel par défaut. Interprétation CONFIRMÉE en revue de phase 1 (voir après le tableau). |
| 6 | Bascule `past_due` → `read_only` | **Ajouter** (15 jours d'impayé). |
| 10 | Export du journal d'audit | **Ajouter** (`GET /api/manager/export/audit`, PDF/Excel). |
| 11 | Administration plateforme sur mobile | **La conserver sur mobile.** |
| 12 | Inscription sur mobile | **L'ajouter** (3 étapes + FedaPay reproduites). |
| 18 | Barre de l'agent | **5 entrées** : Tournée, Encaisser, Clients, Clôture, Compte. |

Revue de phase 1 (18 octobre 2026, même jour) : le dirigeant confirme par écrit la
spécification des écarts 4 et 5 — « spécifiés en §8.13/§8.14 — réassignation
d'agent et durée de cycle paramétrable (livret annuel par défaut) » — validant
du même coup l'interprétation de l'écart n° 5 (§7.5). Ces fonctions restent à
implémenter web d'abord.

---

## 11. Suivi d'exécution — phase 1 (18 octobre 2026)

Ce qui suit est l'état constaté du dépôt après livraison de la phase 1. Le canal
web `/api/*` est inchangé (non-régression testée) ; tout ce qui suit est additif.

### 11.1 Routes /v1 livrées

| Point d'accès | Rôle | Statut | Vérification |
|---|---|---|---|
| `POST /v1/auth/login` | public | Livré | v1-auth : OTP, jetons directs, verrouillage, normalisation |
| `POST /v1/auth/otp/verify` | public | Livré | v1-auth : enregistrement d'appareil, 2FA, essais max |
| `POST /v1/auth/refresh` | public | Livré | v1-auth : rotation + rejeu idempotent + expiration |
| `POST /v1/auth/logout` | session mobile | Livré | v1-auth : jeton révoqué, appareil conservé |
| `GET /v1/auth/me` | session mobile | Livré | v1-auth : utilisateur + abonnement + appareil |
| `GET /v1/devices` (ou `?userId=`) | session mobile | Livré | v1-auth : listing propre + vue gérant/dirigeant |
| `DELETE /v1/devices/:id` | session mobile | Livré | v1-auth : coupure immédiate + audit `device_revoked` |
| `POST /v1/sync/push` | agent | Livré | v1-sync : accusés par événement, idempotence ×3, rejets web exacts |
| `GET /v1/sync/pull` | agent | Livré | v1-pull : full + delta + curseur + appareil révoqué |

### 11.2 Choix d'implémentation notables (fidèles aux décisions, transparents)

- **Moteur partagé** : l'application d'un événement d'encaissement vit dans
  `backend/src/lib/sync-engine.ts`, consommé par `/api/agent/sync` (comportement
  de lot conservé : rejet métier = échec HTTP) ET `/v1/sync/push` (accusé par
  événement). La sérialisation de tournée vit dans `backend/src/lib/tour.ts`.
  Non-régression `/api` prouvée par test (422 de lot, libellés `created`/`duplicate`).
- **Verrou de clôture** : sur `/v1`, appliqué **par événement sur la journée qu'il
  couvre** (écart n° 3 : un événement daté d'un autre jour passe) ; le canal web
  garde sa garde de lot d'origine, inchangée.
- **PIN Argon2id** (`@noble/hashes`, paramètres OWASP m=19 Mio/t=3/p=1) : au
  premier login mobile, le PIN est vérifié contre le scrypt du web puis la
  credential Argon2id est créée (table séparée, scrypt web intact — §8.7).
- **Jetons** : accès = HMAC-SHA256 compact 15 min (`MOBILE_TOKEN_SECRET`, ≥ 32
  caractères, exigée en production sinon 503 explicite) ; renouvellement = opaque
  haché, rotation par remplacement, 30 jours glissants ; rejeu réseau toléré
  60 s (réponse idempotente) puis 401 — jamais de déconnexion abusive pour un
  réseau perdu.
- **OTP SMS** : 6 chiffres, 5 min, 5 essais, 3 envois/h/numéro. **Aucune
  passerelle SMS n'étant branchée** (l'état du web), la production refuse
  explicitement (`503 sms_unconfigured`, même garde que FedaPay
  `payment_unconfigured`) ; hors production le code est renvoyé dans la réponse
  (`devCode`) pour le terrain. Brancher une passerelle est un prérequis de mise
  en production du canal mobile.
- **Débit** : 300 req/min par appareil sur `/v1/sync/*` (surchargeable par
  `SYNC_RATE_LIMIT_PER_MIN` pour les tests), fenêtre 60 s en mémoire.
- **Décalage d'horloge** : mesuré à chaque sync (clientTime), conservé sur
  l'appareil (`clockSkewMs`), marqué dans l'audit des écritures concernées,
  alerte au gérant (`PlanEvent device_clock_skew`, ≤ 1/jour/appareil).
- **Curseur pull** : horodatage serveur capturé avant les lectures — un doublon
  de reprise est possible et idempotent (upsert côté téléphone) ; `updatedAt`
  (nullable) ajouté à `Passbook`/`Contributor` pour le delta.

### 11.3 Modèles Prisma ajoutés (additifs, production : `db push` au déploiement)

`Device`, `MobileCredential`, `MobileToken`, `OtpCode` + colonnes
`updatedAt` (nullables) sur `Passbook`/`Contributor` + `PlanEvent.toPlan`
nullable. Aucune table web existante n'est lue ou modifiée par les routes
`/api/*`.

### 11.4 Reste à faire (hors phase 1, planifié)

- §8.12-§8.15 (web d'abord) : réassignation d'agent, cycles courts
  paramétrables, bascule `past_due→read_only`, export du journal d'audit.
- §8.10/§8.11 : `GET /v1/app/version` (phase 6), espace cotisant `/v1/me/*`
  (phase 3).
- Phase 2 : SQLite chiffrée + outbox + écrans agent ; branchement d'une
  passerelle SMS avant la mise en production du canal mobile.
