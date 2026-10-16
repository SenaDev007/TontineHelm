# Cahier des charges MVP et grille de prix : TontiHelm

YEHI OR Tech · Version 1.0 · Octobre 2026 · Nom de travail du produit : TontiHelm

## 1. Contexte et objectif

TontiHelm est un SaaS de gestion de tontines journalières pour les microfinances de proximité, les groupements d'épargne et les PME collectrices du Bénin. Un agent collecteur passe chaque jour chez ses clients, encaisse un montant fixe et le consigne dans un carnet papier. Le MVP remplace ce carnet par une application fiable, utilisable hors ligne, avec un tableau de bord pour le gérant.

Objectif du MVP : prouver en 90 jours que 3 structures pilotes abandonnent leur carnet papier et acceptent de payer un abonnement mensuel.

## 2. Principe cardinal

TontiHelm ne détient, ne reçoit et ne redistribue aucun fonds. L'argent circule uniquement entre le cotisant et la structure cliente, en espèces ou par mobile money vers le compte de la structure. TontiHelm enregistre, calcule et rapporte.

Conséquences de conception :

- Aucun portefeuille interne, aucun solde stocké au nom de TontiHelm.
- Chaque structure s'inscrit avec son justificatif d'agrément (arrêté du ministre pour un SFD, récépissé ou statut pour un groupement). Le compte reste en attente jusqu'à validation manuelle.
- Les conditions d'utilisation stipulent que le client déclare son agrément et reste responsable des fonds.

## 3. Utilisateurs et rôles

| Rôle | Mission | Droits |
| --- | --- | --- |
| Propriétaire | Dirige la structure | Tout, y compris facturation et utilisateurs |
| Gérant | Supervise les agents et la caisse | Clients, agents, clôtures, rapports |
| Agent collecteur | Encaisse sur le terrain | Ses clients et ses encaissements du jour |
| Contrôleur | Audite sans modifier | Lecture seule et export du journal |
| Cotisant | Épargne | Pas d'accès au MVP, il reçoit des reçus par SMS ou WhatsApp |

## 4. Fonctionnalités du MVP

### M1. Inscription de la structure et vérification

- Formulaire avec nom, type de structure, numéro d'agrément, pièce jointe du justificatif, contacts du dirigeant.
- File de validation côté administrateur YEHI OR Tech.
- Période d'essai de 60 jours activée à la validation.

### M2. Gestion des cotisants et des carnets

- Fiche cotisant : identité, téléphone, quartier, pièce d'identité (numéro seul, sans image au MVP), agent référent.
- Carnet : mise journalière, durée du cycle, date de début, commission de la structure (paramétrable, par exemple un jour de cotisation par cycle).
- Statuts du carnet : actif, en retard, clos, retiré.

### M3. Collecte journalière (application agent)

- Application web installable (PWA), conçue d'abord pour smartphone Android d'entrée de gamme.
- Liste des clients de la tournée du jour, triée par quartier.
- Saisie d'un encaissement en 2 touches : montant par défaut, validation.
- Fonctionnement complet hors ligne, synchronisation automatique au retour du réseau.
- Reçu immédiat par SMS ou WhatsApp au cotisant.
- Gestion des cas réels : paiement partiel, double jour payé d'avance, jour manqué.

### M4. Paiement mobile money en flux direct

- Lien de paiement envoyé au cotisant, via un agrégateur agréé (FedaPay en premier choix, KkiaPay en alternative).
- Les fonds arrivent sur le compte marchand de la structure. TontiHelm reçoit uniquement la notification de succès.
- Rapprochement automatique entre notification et ligne du carnet.

### M5. Clôture de caisse

- En fin de tournée, l'agent déclare le total en espèces remis.
- Le système compare ce total aux encaissements enregistrés et affiche l'écart.
- Le gérant valide ou conteste la clôture. Une clôture validée ne se modifie plus.

### M6. Tableau de bord du gérant

- Encaissements du jour, de la semaine, du mois, par agent et par quartier.
- Carnets en retard, classés par nombre de jours manqués.
- Écarts de caisse non résolus.
- Export Excel et PDF.

### M7. Notifications

- Reçu de cotisation, rappel de retard, fin de cycle.
- Canaux : SMS en base, WhatsApp Business en option payante.
- Modèles de messages rédigés en français simple, personnalisables par structure.

### M8. Journal d'audit

- Chaque écriture (encaissement, correction, clôture, suppression) est horodatée et attribuée à un utilisateur.
- Aucune suppression physique. Une correction crée une nouvelle ligne qui annule la précédente.
- Export du journal par le contrôleur.

### M9. Facturation de l'abonnement

- Plans et paliers de la section 11.
- Paiement de l'abonnement par mobile money.
- Blocage en lecture seule après 15 jours d'impayé, sans perte de données.

### Hors périmètre du MVP

Crédit et prêts, scoring par IA, comptabilité générale, portail cotisant, application iOS native, multi-agences complexes. Ces modules arrivent après validation des pilotes.

## 5. Règles métier clés

1. Un carnet appartient à une seule structure et à un seul agent référent à la fois.
2. Un encaissement ne dépasse jamais le montant restant du cycle, sauf paiement d'avance explicitement marqué.
3. La commission de la structure se calcule à la clôture du cycle et s'affiche sur le relevé du cotisant.
4. Un agent ne voit que ses propres clients.
5. Une clôture de caisse validée verrouille les encaissements de la journée.

## 6. Exigences non fonctionnelles

| Critère | Cible |
| --- | --- |
| Mode hors ligne | 100 % des fonctions agent disponibles sans réseau |
| Temps d'un encaissement | Moins de 10 secondes |
| Chargement sur 3G | Moins de 4 secondes |
| Disponibilité | 99,5 % mensuel |
| Isolation des données | Une structure n'accède jamais aux données d'une autre |
| Sauvegarde | Quotidienne, restauration testée chaque mois |
| Sécurité | Authentification par téléphone et code, double facteur pour propriétaire et gérant |
| Données personnelles | Conformité Code du numérique béninois, déclaration auprès de l'APDP à confirmer avec un juriste |

## 7. Architecture technique

- Frontend : Next.js, TypeScript, Tailwind, PWA avec service worker et file d'attente locale (IndexedDB).
- Backend : Node.js, API REST, validation Zod.
- Base de données : PostgreSQL avec row-level security par structure.
- Paiement : FedaPay, avec webhook signé.
- Messages : passerelle SMS locale, API WhatsApp Business.
- Hébergement : Vercel pour le frontend, base managée avec sauvegardes.
- Socle : réutilisation du module multi-tenant, des rôles et de la facturation des produits Helm existants.

## 8. Modèle de données (entités principales)

Structure, Utilisateur, Agent, Cotisant, Carnet, Encaissement, Clôture, Paiement mobile, Notification, Journal d'audit, Abonnement, Facture.

Relation centrale : Structure possède des Agents et des Cotisants, un Cotisant possède des Carnets, un Carnet reçoit des Encaissements, une Clôture regroupe les Encaissements d'un agent sur une journée.

## 9. Conformité et gestion du risque

| Risque | Mesure |
| --- | --- |
| Client sans agrément | Vérification manuelle à l'inscription, clause contractuelle, droit de suspension |
| Fraude d'un agent | Clôture quotidienne, écarts visibles, journal non modifiable |
| Perte de données au champ | Stockage local chiffré, synchronisation avec reprise sur erreur |
| Fuite de données | Isolation par structure, chiffrement en transit et au repos, journaux d'accès |
| Litige sur un paiement | Rapprochement automatique et historique complet par carnet |

Avant le lancement : consultation d'un avocat béninois spécialisé en finance et prise de contact avec l'ANSIFD.

## 10. Planning (12 semaines)

| Semaines | Livrables |
| --- | --- |
| 1 et 2 | Cadrage juridique, maquettes agent et gérant, base multi-tenant |
| 3 et 4 | M1, M2, rôles et authentification |
| 5 à 7 | M3 collecte hors ligne et synchronisation |
| 8 et 9 | M4 paiement mobile money, M7 notifications |
| 10 | M5 clôture de caisse, M6 tableau de bord |
| 11 | M8 audit, M9 facturation, tests de charge |
| 12 | Déploiement chez les 3 structures pilotes, formation des agents |

Critères de réussite à 90 jours : 3 pilotes actifs, au moins 70 % des encaissements saisis dans l'application, zéro perte de données, au moins 2 pilotes qui acceptent de passer à l'abonnement payant.

## 11. Grille de prix

Tous les montants sont des hypothèses de départ à valider avec les pilotes.

### Repère de valeur

Un collecteur qui suit 300 clients à 500 FCFA par jour manipule environ 4,5 millions de FCFA par mois. Un abonnement de 35 000 FCFA représente moins de 1 % de ce flux.

### Paliers mensuels

|  | Démarrage | Pro | Institution |
| --- | --- | --- | --- |
| Prix par mois | 15 000 FCFA | 35 000 FCFA | 75 000 FCFA |
| Agents inclus | 2 | 10 | 40 |
| Cotisants actifs inclus | 150 | 800 | 3 000 |
| Application agent hors ligne | Oui | Oui | Oui |
| Reçus SMS | Facturés à l'usage | Facturés à l'usage | Facturés à l'usage |
| Paiement mobile money | Oui | Oui | Oui |
| Clôture de caisse et audit | Oui | Oui | Oui |
| Export Excel et PDF | Oui | Oui | Oui |
| Rappels WhatsApp | Non | Oui | Oui |
| Rapports réglementaires | Non | Non | Oui |
| Multi-agences | Non | Non | Oui |
| Accès API | Non | Non | Oui |
| Support | E-mail | WhatsApp, 24 h | Dédié, 4 h ouvrées |

### Éléments variables

- Cotisant actif au-delà du quota : 50 FCFA par mois.
- Agent supplémentaire : 2 000 FCFA par mois.
- SMS : prix coûtant de la passerelle plus 20 % de marge.
- Mise en service avec paramétrage et formation des agents : 50 000 FCFA, offerte aux pilotes.

### Offres de lancement

- Pilotes : 60 jours gratuits, puis tarif fondateur de moins 30 % pendant 12 mois.
- Paiement annuel : 2 mois offerts.

### Projection de revenu récurrent

| Palier | Structures | Revenu mensuel |
| --- | --- | --- |
| Démarrage | 50 | 750 000 FCFA |
| Pro | 35 | 1 225 000 FCFA |
| Institution | 15 | 1 125 000 FCFA |
| Total pour 100 structures | 100 | 3 100 000 FCFA |

Ce total exclut les SMS, les agents supplémentaires et les frais de mise en service. Marge brute cible : 75 %, après coûts d'hébergement, de SMS et de support.

## 12. Prochaines décisions

1. Valider le nom TontiHelm et réserver le domaine.
2. Signer 3 structures pilotes avant la semaine 4.
3. Obtenir l'avis écrit d'un avocat et un premier échange avec l'ANSIFD avant la semaine 8.

## 13. Copywriting (landing page et micro-copy)

### 13.1 Principes éditoriaux

1. Le problème passe avant la vision. Le hero parle de la peur du carnet perdu, pas de la technologie.
2. Un seul bouton par section.
3. Les chiffres arrivent avant les arguments.
4. Chaque section ouvre une tension avant de la résoudre.
5. Chaque message système est écrit. Le développeur n'improvise aucun texte.
6. Aucun texte générique. Un concurrent ne peut pas copier une phrase telle quelle.
7. Tutoiement partout. Une variante au vouvoiement est à tester pour les SFD institutionnels.
8. Zéro statistique et zéro témoignage inventés. Les marqueurs \[PILOTE\] se remplissent avec les chiffres réels après les 90 jours.
9. Toute phrase qui touche à la réglementation passe chez l'avocat avant la mise en ligne.

### 13.2 Navigation

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| Lien 1 | Problème |
| Lien 2 | Fonctionnalités |
| Lien 3 | Tarifs |
| Lien 4 | Questions |
| Bouton | Essayer 60 jours → |

Note de production : barre blanche, logo lisible sur fond clair, bouton en couleur d'accent. Le bouton reste visible au défilement sur mobile.

### Section 1 · Hero · #accueil

Contexte stratégique. Le gérant de microfinance connaît la peur du carnet perdu avant de connaître le mot logiciel. Le hero nomme cette peur, puis promet un résultat que le gérant mesure lui-même en 60 jours. Aucun jargon technique au-dessus de la ligne de flottaison.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| Surtitre | Logiciel de gestion de tontine · Bénin |
| H1 | Un carnet perdu, ce sont des mois de cotisations envolés. |
| Sous-titre | TontiHelm remplace le carnet papier par une application qui marche sans réseau. Tes agents encaissent en 10 secondes, tes clients reçoivent leur reçu, ta caisse se clôture chaque soir. |
| Bouton unique | Essayer 60 jours gratuitement → |
| Micro-ligne sous le bouton | Aucun paiement pour démarrer. Aucun engagement. |

Note de production : H1 en grande taille, une seule couleur d'accent sur « mois de cotisations ». Capture de l'écran agent à droite sur ordinateur, sous le bouton sur mobile.

### Section 2 · Chiffres · #chiffres

Contexte stratégique. Quatre chiffres, tous vrais par construction du produit. Ils arrivent avant les arguments pour installer la crédibilité. Chaque chiffre répond à une objection : lenteur, réseau, confiance, risque.

| CHIFFRE | LABEL | SENS ÉMOTIONNEL |
| --- | --- | --- |
| 10 s | par encaissement | Ton agent passe vite à la maison suivante |
| 100 % | des fonctions hors réseau | Une coupure ne bloque plus la tournée |
| 0 FCFA | détenu par nous | Ton argent reste dans ta structure |
| 60 jours | d'essai gratuit | Tu juges sur tes propres chiffres |

Note de production : compteurs animés au défilement, une seule fois.

### Section 3 · Problème · #probleme

Contexte stratégique. Cette section fait reconnaître au gérant sa propre semaine. Chaque carte décrit une scène vécue, sans solution. La solution arrive à la section suivante.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| H2 | Ton carnet fonctionne jusqu'au jour où il disparaît. |
| Carte 1, titre | Le carnet mouillé |
| Carte 1, corps | Une tournée sous la pluie, une page illisible, un client qui conteste 12 versements. Tu n'as aucune trace à lui montrer. |
| Carte 2, titre | L'écart découvert trop tard |
| Carte 2, corps | Tu constates la différence de caisse en fin de mois. L'agent ne se souvient plus du jour exact. |
| Carte 3, titre | Le client qui doute |
| Carte 3, corps | Sans reçu, chaque cotisant garde un doute. Ce doute coûte des clients à ta structure. |
| Carte 4, titre | Le gérant aveugle |
| Carte 4, corps | Tu ne sais pas combien tes agents ont encaissé hier. Tu l'apprends quand ils rapportent les carnets. |

Note de production : quatre cartes sur fond sombre, icône simple par carte, aucune illustration décorative.

### Section 4 · Fonctionnalités · #fonctionnalites

Contexte stratégique. Chaque fonctionnalité répond à une carte de la section Problème, dans le même ordre. Le visiteur retrouve sa douleur et voit sa réponse immédiate. Un seul bouton clôt la section.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| H2 | Chaque problème du carnet a sa réponse dans l'application. |
| Fonction 1, titre | Collecte sans réseau |
| Fonction 1, hook | Le réseau coupe, la tournée continue. |
| Fonction 1, corps | L'application enregistre chaque encaissement sur le téléphone de l'agent et l'envoie dès le retour du réseau. Rien ne se perd, rien ne s'écrase. |
| Fonction 2, titre | Reçu immédiat |
| Fonction 2, hook | Ton client garde une trace dans sa poche. |
| Fonction 2, corps | Chaque versement déclenche un SMS avec le montant, le jour du cycle et le solde cumulé. Le doute disparaît. |
| Fonction 3, titre | Clôture de caisse |
| Fonction 3, hook | L'écart se voit le soir même. |
| Fonction 3, corps | L'agent déclare ce qu'il remet. L'application compare avec ses encaissements et affiche la différence. Une fois validée, la journée est verrouillée. |
| Fonction 4, titre | Tableau de bord gérant |
| Fonction 4, hook | Tu sais ce que chaque agent a encaissé avant qu'il rentre. |
| Fonction 4, corps | Encaissements du jour, carnets en retard, écarts non résolus. Export Excel et PDF en un clic. |
| Fonction 5, titre | Paiement mobile money |
| Fonction 5, hook | Le client paie depuis son téléphone. |
| Fonction 5, corps | L'agent envoie un lien de paiement. L'argent arrive directement sur le compte de ta structure. |
| Fonction 6, titre | Journal d'audit |
| Fonction 6, hook | Chaque ligne a un auteur et une heure. |
| Fonction 6, corps | Une correction ajoute une ligne et n'efface jamais la précédente. Ton contrôleur exporte le journal quand il veut. |
| Bouton unique | Voir l'application en action → |

Note de production : six cartes en grille, deux colonnes sur mobile. Le bouton ouvre la démonstration vidéo de 90 secondes.

### Section 5 · Méthode · #methode

Contexte stratégique. Le gérant se demande combien de temps la mise en route lui prendra. Quatre étapes courtes répondent à cette question.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| H2 | Quatre étapes entre ton carnet et ta première clôture numérique. |
| Étape 1 | Tu inscris ta structure et tu joins ton justificatif d'agrément. |
| Étape 2 | Nous configurons tes agents, tes carnets et tes règles de commission. |
| Étape 3 | Tes agents encaissent avec l'application dès la tournée suivante. |
| Étape 4 | Tu clôtures la caisse le soir et tu compares avec ton ancien carnet. |
| Bouton unique | Démarrer mon inscription → |

### Section 6 · Confiance · #confiance

Contexte stratégique. Les épargnants confient leur argent à la structure, et la structure nous confie ses registres. Cette section dit clairement où passe l'argent et qui voit quoi. Elle s'ouvre sur un chiffre.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| Chiffre d'ouverture | 0 FCFA |
| H2 | TontiHelm ne touche jamais à l'argent de tes clients. |
| Corps 1 | Les fonds vont du cotisant à ta structure, en espèces ou par mobile money. Nous tenons le registre, pas la caisse. |
| Corps 2 | Nous vérifions ton agrément avant d'activer ton compte. Une structure sans justificatif ne passe pas. |
| Corps 3 | Tes données restent isolées de celles des autres structures. Chaque ligne du journal est horodatée et attribuée. |
| Bouton unique | Lire comment nous protégeons tes données → |

Note de production : toute formule réglementaire est à valider par l'avocat avant publication. Ne jamais écrire « conforme ANSIFD » sans avis écrit.

### Section 7 · Tarifs · #tarifs

Contexte stratégique. Le prix se juge face à la valeur. On ancre d'abord le flux d'argent que la structure manipule, puis on montre l'abonnement.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| H2 | Un abonnement fixe. Aucune commission sur tes collectes. |
| Repère de valeur | 300 clients à 500 FCFA par jour représentent environ 4,5 millions de FCFA par mois. L'abonnement Pro en représente moins de 1 %. |
| Carte Démarrage | 15 000 FCFA par mois. Pour démarrer avec 2 agents et 150 cotisants. |
| Carte Pro | 35 000 FCFA par mois. Pour structurer une équipe de 10 agents et 800 cotisants. Rappels WhatsApp inclus. |
| Carte Institution | 75 000 FCFA par mois. Pour les SFD multi-agences, 40 agents et 3 000 cotisants. Rapports réglementaires et accès API. |
| Ligne sous les cartes | Paiement annuel : 2 mois offerts. Les SMS sont facturés à l'usage, tarif affiché avant envoi. |
| Bouton unique | Essayer 60 jours gratuitement → |

### Section 8 · Questions · #questions

Contexte stratégique. Chaque réponse désamorce une objection réelle d'achat. Les réponses restent courtes et factuelles.

| QUESTION | RÉPONSE |
| --- | --- |
| TontiHelm garde-t-il l'argent ? | Non. L'argent va du cotisant à ta structure. Nous enregistrons les opérations et nous produisons les rapports. |
| Dois-je être agréé ? | La loi béninoise exige l'agrément du ministre de l'Économie et des Finances pour collecter l'épargne. Nous demandons ton justificatif à l'inscription. |
| Ça marche sans internet ? | Oui. Tout l'écran agent fonctionne hors réseau. La synchronisation part automatiquement au retour du signal. |
| Mes agents ne sont pas à l'aise avec le téléphone. | Un encaissement tient en 2 touches. Nous formons tes agents lors de la mise en service. |
| Mes clients ont-ils besoin d'un smartphone ? | Non. Ils reçoivent leur reçu par SMS sur n'importe quel téléphone. |
| Mes données restent-elles à moi si j'arrête ? | Oui. Tu exportes tout en Excel à tout moment. En cas d'impayé, ton compte passe en lecture seule, sans suppression. |
| Où sont stockées mes données ? | Chez un hébergeur sécurisé, avec sauvegarde quotidienne. Chaque structure accède uniquement à ses propres données. |

### Section 9 · Appel final · #essai

Contexte stratégique. Dernier écran de la page. Il réduit l'effort au minimum : un agent, un carnet à comparer, 60 jours.

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| H2 | Ferme ton carnet papier ce mois-ci. |
| Sous-titre | Installe TontiHelm chez un agent. Compare avec ton carnet pendant 60 jours. |
| Bouton unique | Démarrer l'essai gratuit → |
| Micro-ligne | Nous te répondons sous 24 heures ouvrées. |

Note de production : confirmer la capacité de réponse avant de publier la promesse des 24 heures.

### Pied de page

| ÉLÉMENT | TEXTE FINAL |
| --- | --- |
| Signature | TontiHelm, un produit YEHI OR Tech · Parakou, Bénin |
| Contact | \[WhatsApp\] · \[e-mail\] |
| Liens | Conditions d'utilisation · Confidentialité · Mentions légales |

Note de production : fond noir profond légèrement teinté, logo jamais posé sur sa propre couleur d'accent.

### 13.3 SEO

|  |  |
| --- | --- |
| Meta title | TontiHelm : logiciel de gestion de tontine au Bénin |
| Meta description | Remplace le carnet papier par une app qui marche sans réseau. Encaissement en 10 secondes, caisse clôturée chaque soir. Essai gratuit 60 jours. |
| H1 unique | Un carnet perdu, ce sont des mois de cotisations envolés. |
| Locale | fr\_BJ |
| Schema.org | SoftwareApplication avec offres par palier |
| Canonical | URL du domaine à confirmer |

| PRIORITÉ | MOT-CLÉ | SECTION CIBLÉE |
| --- | --- | --- |
| P1 | logiciel gestion tontine | H1, meta, Fonctionnalités |
| P1 | application tontine Bénin | Meta, Hero |
| P2 | logiciel microfinance Bénin | Confiance, Tarifs |
| P2 | carnet de collecte numérique | Problème |
| P3 | logiciel collecteur épargne journalière | Article de blog |
| P3 | gérer une tontine journalière | Article de blog |

### 13.4 Micro-copy de l'application

| CONTEXTE | TEXTE FINAL |
| --- | --- |
| Inscription envoyée | Demande reçue. Nous vérifions ton justificatif d'agrément et nous te répondons sous 24 heures ouvrées. |
| Numéro invalide | Numéro invalide. Saisis ton numéro complet, sans espace. |
| Bannière hors réseau | Pas de réseau. Continue ta tournée, tout est enregistré sur ton téléphone. |
| Envoi en attente | {n} encaissements en attente d'envoi. Ils partent dès le retour du réseau. |
| Synchronisation réussie | Tout est synchronisé. |
| Encaissement validé | {montant} FCFA encaissés chez {nom}. |
| Écart de caisse | Écart de {montant} FCFA entre ta déclaration et tes encaissements. Vérifie la tournée avant de valider. |
| Clôture validée | Clôture validée. Les encaissements du jour sont verrouillés. |
| Paiement en attente | En attente de confirmation du client sur son téléphone. |
| Paiement non abouti | Paiement non abouti. Renvoie le lien ou encaisse en espèces. |
| Abonnement en retard | Ton abonnement est impayé depuis {n} jours. Dans {x} jours, ton compte passe en lecture seule. Tes données restent intactes. |
| Lecture seule | Compte en lecture seule. Règle ton abonnement pour reprendre les encaissements. |

### 13.5 SMS aux cotisants

Les SMS s'écrivent sans accent pour rester dans la limite de 160 caractères par message.

| CONTEXTE | TEXTE FINAL |
| --- | --- |
| Reçu de cotisation | {Structure} : {montant} FCFA recus le {date}. Carnet {numero}, jour {n}/{total}. Solde cumule : {solde} FCFA. |
| Rappel de retard | {Structure} : ton carnet {numero} a {n} jours sans versement. Passe voir {agent} ou paie ici : {lien} |
| Fin de cycle | {Structure} : ton cycle est termine. Total verse : {total} FCFA. Presente-toi a {lieu} avec ta piece d'identite. |

### 13.6 Messages de prospection et d'accueil

Message WhatsApp pré-rempli du bouton de contact :

```
Bonjour YEHI OR Tech,
Je m'appelle {nom}. Je gère {structure}.
Je veux essayer TontiHelm.
Nous avons environ {nombre} clients et {nombre} agents.
Mon numéro : {téléphone}
```

Message de premier contact envoyé par YEHI OR Tech à un gérant :

```
Bonjour {nom}. Je m'appelle Dawes, fondateur de YEHI OR Tech à Parakou.
Nous avons construit une application qui remplace le carnet de tontine papier.
Elle marche sans réseau, envoie un reçu SMS à chaque versement et clôture la caisse chaque soir.
Je te propose 60 jours d'essai gratuit avec un de tes agents.
Tu as 10 minutes cette semaine pour que je te montre ?
```

Séquence d'accueil après inscription :

| MOMENT | MESSAGE |
| --- | --- |
| Jour 0 | Bienvenue {nom}. Ton compte est actif. Premier objectif : enregistrer les carnets d'un agent aujourd'hui. Je t'accompagne par WhatsApp. |
| Jour 7 | Une semaine d'usage. Ouvre ton tableau de bord et compare les encaissements de la semaine avec ton carnet papier. Dis-moi ce qui diffère. |
| Jour 45 | Il reste 15 jours d'essai. Tes agents ont saisi {n} encaissements. Pour garder ton historique, choisis ton palier avant la fin de l'essai. |

## 14. Spécifications techniques

### 14.1 Principes d'architecture

1. Les encaissements sont des événements en ajout seul. Une erreur se corrige par une écriture d'annulation, jamais par une modification. Ce choix supprime les conflits de synchronisation et rend l'audit naturel.
2. L'application agent fonctionne d'abord hors ligne. Le réseau améliore l'expérience, il ne conditionne rien.
3. Chaque requête porte l'identité de la structure. La base refuse l'accès à toute autre donnée, même en cas de bug applicatif.
4. Aucun montant n'est stocké en décimal. Le FCFA n'a pas de centimes, donc tous les montants sont des entiers.
5. Les fournisseurs externes (SMS, paiement, WhatsApp) passent derrière des interfaces. Un changement de fournisseur ne touche pas le métier.

### 14.2 Stack et composants

| COUCHE | CHOIX | RÔLE |
| --- | --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind 4, shadcn/ui | Back-office gérant et site vitrine |
| Application agent | PWA dans le même projet, Serwist pour le service worker, Dexie pour IndexedDB | Collecte hors ligne |
| API | Route Handlers Next.js, validation Zod, tRPC ou REST typé | Logique métier exposée |
| Base de données | PostgreSQL 16 managé avec sauvegarde à la minute (PITR) | Source de vérité |
| ORM et migrations | Drizzle ou Prisma avec migrations versionnées | Schéma maîtrisé |
| Tâches de fond | pg-boss (file de tâches dans PostgreSQL) | SMS, webhooks, facturation, rapprochement |
| Paiement | FedaPay (principal), KkiaPay (secours) derrière une interface PaymentProvider | Liens de paiement mobile money |
| SMS | Passerelle locale derrière une interface SmsProvider | Reçus et rappels |
| WhatsApp | API Cloud de Meta, modèles de messages pré-approuvés | Rappels des paliers Pro et Institution |
| Surveillance | Sentry, journaux structurés (pino), contrôle de disponibilité externe | Détection des pannes |
| CI/CD | GitHub Actions, déploiements de prévisualisation, trois environnements | Livraison continue |

L'hébergeur et la région de la base se choisissent avec l'avocat, car ils fixent la localisation des données personnelles.

### 14.3 Organisation du code

```
tontihelm/
├── apps/
│   └── web/                 Next.js (site, back-office, PWA agent)
├── packages/
│   ├── db/                  schéma, migrations, politiques RLS
│   ├── domain/              règles métier pures (solde, commission, clôture)
│   ├── providers/           interfaces et adaptateurs (paiement, SMS, WhatsApp)
│   ├── sync/                protocole de synchronisation partagé client et serveur
│   └── ui/                  composants partagés
├── infra/                   scripts de déploiement et de sauvegarde
└── .github/workflows/       intégration continue
```

Le paquet domain ne dépend d'aucune bibliothèque externe. Il se teste en isolation avec des cas chiffrés.

### 14.4 Isolation multi-structure (multi-tenant)

Chaque table métier porte une colonne tenant\_id. À chaque requête, l'API ouvre une transaction et fixe la structure courante.

```sql
SET LOCAL app.tenant_id = '<uuid de la structure>';
SET LOCAL app.user_id = '<uuid de l utilisateur>';
SET LOCAL app.role = 'agent';

ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON collections
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY agent_own_rows ON collections
  AS RESTRICTIVE
  USING (current_setting('app.role') <> 'agent'
         OR agent_id = current_setting('app.user_id')::uuid);
```

L'application se connecte avec un rôle de base de données sans droit de contournement des politiques. Un jeu de tests automatisé tente chaque requête depuis une structure A vers les données d'une structure B et doit échouer à chaque fois.

### 14.5 Modèle de données

Tous les identifiants sont des UUID version 7 (triables dans le temps). Les identifiants des encaissements sont générés par l'application agent, ce qui garantit l'idempotence à la synchronisation.

```sql
CREATE TABLE structures (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sfd','groupement','pme')),
  license_ref text NOT NULL,
  license_doc_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','suspended','closed')),
  commission_rule jsonb NOT NULL DEFAULT '{"type":"days","value":1}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contributors (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES structures(id),
  full_name text NOT NULL,
  phone text,
  neighborhood text,
  id_number_enc bytea,
  agent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE passbooks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES structures(id),
  contributor_id uuid NOT NULL REFERENCES contributors(id),
  agent_id uuid NOT NULL,
  daily_amount bigint NOT NULL CHECK (daily_amount > 0),
  cycle_days int NOT NULL CHECK (cycle_days BETWEEN 1 AND 366),
  starts_on date NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','late','closed','withdrawn')),
  closed_at timestamptz
);

CREATE TABLE collections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES structures(id),
  passbook_id uuid NOT NULL REFERENCES passbooks(id),
  agent_id uuid NOT NULL,
  device_id uuid,
  amount bigint NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','mobile_money')),
  reverses_id uuid REFERENCES collections(id),
  payment_id uuid,
  closing_id uuid,
  collected_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((reverses_id IS NULL AND amount > 0)
      OR (reverses_id IS NOT NULL AND amount < 0))
);

CREATE TABLE audit_log (
  seq bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL,
  prev_hash bytea,
  hash bytea NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON audit_log, collections FROM app_role;
```

Autres tables, avec leurs colonnes principales :

| TABLE | COLONNES PRINCIPALES |
| --- | --- |
| users | id, tenant\_id, phone, role, pin\_hash (Argon2id), totp\_secret\_enc, status, last\_login\_at |
| devices | id, user\_id, label, registered\_at, revoked\_at, last\_sync\_at, clock\_offset\_ms |
| closings | id, tenant\_id, agent\_id, day, declared\_cash, expected\_cash, gap, status (open, declared, validated, disputed), validated\_by, validated\_at |
| payments | id, tenant\_id, passbook\_id, provider, provider\_ref, amount, status (created, pending, approved, declined, expired, canceled), raw\_event jsonb, created\_at, settled\_at |
| notifications | id, tenant\_id, channel (sms, whatsapp, email), template, to\_phone, status, provider\_ref, cost\_fcfa, created\_at |
| subscriptions | id, tenant\_id, plan, status (trial, active, past\_due, read\_only, canceled), trial\_ends\_at, period\_start, period\_end |
| invoices | id, tenant\_id, period, base\_amount, extras jsonb, vat\_rate, total, status, paid\_at |
| webhook\_events | id, provider, event\_id (unique), received\_at, processed\_at, outcome |

### 14.6 Règles de calcul

- Solde d'un carnet : somme des montants des encaissements du carnet, annulations incluses (elles sont négatives).
- Jours payés : solde divisé par la mise journalière, arrondi à l'entier inférieur.
- Jours manqués : jours écoulés depuis le début du cycle moins jours payés, plancher à zéro.
- Statut en retard : jours manqués supérieurs ou égaux à 3 (seuil réglable par structure).
- Commission de fin de cycle, règle jours : valeur multipliée par la mise journalière. Exemple : 31 jours à 500 FCFA donnent 15 500 FCFA cotisés, la commission d'un jour est de 500 FCFA, le montant restitué est de 15 000 FCFA.
- Écart de clôture : espèces déclarées moins espèces attendues, où espèces attendues égale la somme des encaissements en espèces de l'agent pour le jour, hors mobile money.
- Cotisant actif pour la facturation : au moins un encaissement non annulé dans le mois civil.

Ces règles vivent dans le paquet domain et se couvrent par des tests chiffrés, dont les cas limites (paiement d'avance, annulation, cycle de 1 jour, changement d'agent en cours de cycle).

### 14.7 Synchronisation hors ligne

Snapshot local. Au démarrage et après chaque synchronisation, l'application télécharge la tournée de l'agent : cotisants, carnets, soldes, jours manqués. Le tout se range dans IndexedDB.

File d'envoi (outbox). Chaque encaissement saisi s'écrit localement avec son UUID, son horodatage local et l'identifiant de l'appareil. La ligne reste en statut « en attente » jusqu'à l'accusé du serveur.

Envoi. L'application pousse les lignes par lots de 50 vers le serveur, dans l'ordre de saisie. Le serveur traite chaque événement de façon idempotente grâce à l'UUID : un doublon retourne le même accusé sans nouvelle écriture. En cas d'échec réseau, reprise avec attente croissante (2, 4, 8, 16 secondes, plafond 5 minutes).

Déclenchement. Synchronisation en arrière-plan quand le navigateur la propose (Background Sync sur Android Chrome), à l'ouverture de l'application, au retour du réseau et sur bouton manuel.

Horloge. Le serveur calcule le décalage entre l'horloge de l'appareil et la sienne à chaque synchronisation. Un décalage supérieur à 10 minutes lève une alerte au gérant et marque les lignes concernées.

Limites. Durée maximale hors ligne : 7 jours. Passé ce délai, l'application bloque la saisie et demande une synchronisation. Un appareil révoqué efface ses données locales à sa prochaine connexion.

Protection locale. Les données IndexedDB sont chiffrées avec une clé dérivée du code PIN de l'agent (AES-GCM par la Web Crypto API). Un téléphone perdu ne livre pas les carnets.

Cohérence. Les encaissements ne se modifient pas, donc aucun conflit de fusion n'existe. Les seuls conflits possibles concernent les données de référence (nouveau cotisant, changement d'agent), où la version du serveur gagne.

### 14.8 Authentification et autorisations

| ÉLÉMENT | SPÉCIFICATION |
| --- | --- |
| Identifiant | Numéro de téléphone |
| Secret | Code PIN à 6 chiffres, haché avec Argon2id |
| Premier appareil | Code SMS à usage unique pour enregistrer l'appareil |
| Double facteur | Propriétaire et gérant : code SMS ou application TOTP à chaque nouvelle session |
| Verrouillage | 5 essais erronés, blocage de 15 minutes, alerte au gérant |
| Sessions web | Jeton d'accès de 15 minutes, jeton de renouvellement à rotation, cookie httpOnly et SameSite |
| Sessions agent | Jeton lié à l'appareil, durée 30 jours, révocation à distance par le gérant |
| Administrateur YEHI OR Tech | Compte séparé, double facteur obligatoire, chaque accès aux données d'une structure s'inscrit au journal d'audit |

Matrice des droits :

| ACTION | AGENT | CONTRÔLEUR | GÉRANT | PROPRIÉTAIRE |
| --- | --- | --- | --- | --- |
| Voir ses propres clients | Oui | Oui | Oui | Oui |
| Voir tous les clients | Non | Oui | Oui | Oui |
| Enregistrer un encaissement | Oui | Non | Oui | Oui |
| Annuler un encaissement | Non | Non | Oui | Oui |
| Déclarer sa clôture | Oui | Non | Non | Non |
| Valider une clôture | Non | Non | Oui | Oui |
| Exporter le journal d'audit | Non | Oui | Oui | Oui |
| Gérer agents et appareils | Non | Non | Oui | Oui |
| Changer de palier et payer | Non | Non | Non | Oui |

### 14.9 Interface de programmation (API)

Toutes les routes passent par HTTPS, portent le préfixe /v1 et exigent un jeton. Les réponses d'erreur suivent un format unique avec un code lisible par machine et un message en français.

| MÉTHODE ET ROUTE | RÔLE MINIMAL | DESCRIPTION |
| --- | --- | --- |
| POST /auth/login | public | Connexion par téléphone et PIN |
| POST /auth/otp/verify | public | Validation du code SMS |
| POST /auth/refresh | connecté | Renouvellement du jeton |
| POST /structures | public | Demande d'inscription avec justificatif |
| GET /me/route | agent | Tournée du jour et soldes |
| POST /sync/push | agent | Envoi d'un lot d'événements, réponse idempotente |
| GET /sync/pull | agent | Données de référence depuis un curseur |
| GET /contributors | agent | Liste filtrée par agent ou quartier |
| POST /contributors | gérant | Nouveau cotisant |
| POST /passbooks | gérant | Nouveau carnet |
| POST /collections/{id}/reverse | gérant | Annulation d'un encaissement |
| POST /payments/link | agent | Génération d'un lien de paiement |
| POST /webhooks/fedapay | public signé | Réception des événements de paiement |
| POST /closings/declare | agent | Déclaration de caisse |
| POST /closings/{id}/validate | gérant | Validation ou contestation |
| GET /dashboard/summary | gérant | Indicateurs du jour, de la semaine, du mois |
| GET /exports/{type} | gérant | Export Excel ou PDF |
| GET /audit | contrôleur | Journal d'audit paginé et exportable |
| GET /billing/invoices | propriétaire | Factures et état de l'abonnement |
| POST /admin/structures/{id}/approve | administrateur | Validation d'une structure en attente |

Limites de débit : 60 requêtes par minute et par utilisateur, 10 par minute sur les routes d'authentification, 300 par minute sur la route de synchronisation.

### 14.10 Paiement mobile money

Parcours.

1. L'agent demande un lien de paiement pour un carnet. L'API écrit une ligne payments au statut created, puis appelle le fournisseur et passe à pending.
2. Le cotisant règle sur son téléphone.
3. Le fournisseur appelle le webhook. L'API vérifie la signature de l'en-tête selon la documentation du fournisseur, enregistre l'événement dans webhook\_events (clé unique sur event\_id) et répond immédiatement.
4. Une tâche de fond traite l'événement. Si le statut est approved, elle écrit l'encaissement correspondant avec method égal à mobile\_money et envoie le reçu SMS.
5. Un rapprochement nocturne interroge le fournisseur pour chaque paiement resté pending depuis plus de 30 minutes et corrige le statut.

Règles. Le montant d'un paiement approuvé doit correspondre exactement au montant demandé, sinon le paiement passe en revue manuelle. Un événement reçu deux fois ne produit qu'une écriture. Le contrat exact des webhooks et des signatures se relit dans la documentation du fournisseur avant l'implémentation.

Les fonds ne transitent jamais par un compte TontiHelm. Le compte marchand appartient à la structure cliente, qui l'ouvre auprès du fournisseur. L'ouverture du compte marchand est une étape de l'inscription pour les structures qui veulent le mobile money.

### 14.11 Notifications

- Chaque envoi passe par la table notifications et une tâche de fond avec trois essais.
- Le coût de chaque SMS s'enregistre en FCFA pour la refacturation mensuelle.
- Un quota quotidien par structure évite les envois en boucle (valeur de départ : 3 SMS par cotisant et par jour).
- Les modèles WhatsApp se soumettent à l'approbation de Meta avant le lancement du palier Pro. Le SMS sert de secours si l'envoi WhatsApp échoue.
- Les textes des modèles figurent à la section 13.5.

### 14.12 Journal d'audit

- Chaque écriture métier (encaissement, annulation, clôture, changement de droits, export) crée une ligne dans audit\_log dans la même transaction que l'écriture.
- Chaque ligne stocke le hash de la ligne précédente de la même structure. Le hash se calcule sur le contenu et le hash précédent. Toute altération casse la chaîne.
- Une tâche quotidienne recalcule la chaîne et alerte l'administrateur en cas de rupture.
- Le rôle de base de données de l'application n'a aucun droit de modification ni de suppression sur cette table.

### 14.13 Facturation de l'abonnement

États de l'abonnement : essai, actif, en retard, lecture seule, annulé.

| TRANSITION | DÉCLENCHEUR |
| --- | --- |
| essai vers actif | Paiement de la première facture avant la fin des 60 jours |
| essai vers lecture seule | Fin de l'essai sans paiement |
| actif vers en retard | Facture non réglée à l'échéance |
| en retard vers lecture seule | 15 jours après l'échéance |
| lecture seule vers actif | Règlement de la facture |
| tout état vers annulé | Demande du propriétaire, export complet proposé avant |

Calendrier de relance : message à l'échéance, puis aux jours 5, 10 et 14. Le mode lecture seule conserve toutes les données et autorise les exports. Il bloque la saisie d'encaissements.

Facture mensuelle : montant du palier, cotisants actifs au-delà du quota multipliés par 50 FCFA, agents supplémentaires multipliés par 2 000 FCFA, SMS consommés avec marge, TVA au taux en vigueur (à confirmer avec le comptable). Les quotas se mesurent au dernier jour du mois.

### 14.14 Sécurité

| SUJET | SPÉCIFICATION |
| --- | --- |
| Transport | TLS 1.2 minimum, HSTS, redirection forcée vers HTTPS |
| Stockage | Chiffrement au repos par l'hébergeur, chiffrement applicatif AES-256-GCM pour les numéros de pièce d'identité |
| Clés | Stockées dans le coffre de secrets de l'hébergeur, rotation annuelle |
| Web | Politique CSP stricte, protection CSRF, en-têtes de sécurité, validation Zod sur chaque entrée |
| Dépendances | Analyse automatique à chaque requête de fusion, mises à jour hebdomadaires |
| Accès base | Aucune connexion directe depuis l'extérieur, comptes nominatifs pour les administrateurs, journal des accès |
| Sauvegardes | Sauvegarde continue avec restauration à la minute sur 7 jours, test de restauration mensuel documenté |
| Incident | Procédure écrite : détection, isolement, information des structures concernées, analyse après coup |
| Données personnelles | Registre des traitements, base légale par traitement, durée de conservation fixée avec le juriste, export et suppression sur demande d'une structure |

### 14.15 Performance et dimensionnement

| MESURE | CIBLE |
| --- | --- |
| Envoi de 50 événements de synchronisation | 95e centile sous 500 ms |
| Chargement du tableau de bord | Sous 2 secondes avec 100 000 encaissements |
| Première ouverture de l'application agent sur 3G | Sous 4 secondes |
| Poids du paquet JavaScript de l'application agent | Sous 200 Ko compressés |
| Capacité de départ | 1 000 agents, 300 000 encaissements par jour |
| Index obligatoires | collections (tenant\_id, collected\_at), collections (passbook\_id), passbooks (agent\_id, status), audit\_log (tenant\_id, seq) |

Un test de charge avec k6 simule 500 agents qui se synchronisent en même temps après une coupure de réseau. Il passe avant la mise en production.

### 14.16 Observabilité

- Journaux structurés avec identifiant de requête et identifiant de structure, sans donnée personnelle en clair.
- Alertes : taux d'erreur de synchronisation supérieur à 2 %, webhooks de paiement en échec, file de tâches en retard de plus de 10 minutes, rupture de la chaîne d'audit, espace disque de la base.
- Tableau de bord interne : structures actives, encaissements par jour, SMS envoyés, paiements approuvés, abonnements par état.

### 14.17 Back-office YEHI OR Tech

- File de validation des structures avec visualisation du justificatif et boutons d'approbation, de refus avec motif et de demande de complément.
- Fiche structure : palier, quotas, consommation de SMS, factures, appareils.
- Suspension immédiate d'une structure avec motif consigné.
- Prise de contrôle en lecture seule pour le support, consignée au journal d'audit.

### 14.18 Environnements et livraison

| ENVIRONNEMENT | USAGE | DONNÉES |
| --- | --- | --- |
| Développement | Poste du développeur | Données fictives |
| Préproduction | Recette et démonstrations | Données fictives réalistes, fournisseurs en mode test |
| Production | Clients | Données réelles |

Pipeline à chaque modification : analyse de style, vérification des types, tests unitaires du paquet domain, tests d'intégration sur une vraie base PostgreSQL, tests de bout en bout avec Playwright (dont le scénario hors ligne), déploiement de prévisualisation. Les migrations de base passent d'abord en préproduction et doivent pouvoir se défaire.

### 14.19 Critères de recette

1. Un agent hors ligne enregistre 100 encaissements, retrouve le réseau et le serveur contient exactement 100 lignes, sans doublon, même après 3 envois répétés.
2. Un agent d'une structure A n'obtient jamais une donnée de la structure B, sur toutes les routes testées.
3. Un encaissement annulé laisse deux lignes dans la base et un solde correct.
4. Une clôture validée refuse toute modification des encaissements de la journée.
5. Un webhook de paiement reçu deux fois produit un seul encaissement et un seul SMS.
6. Un paiement approuvé au montant différent passe en revue manuelle.
7. Un téléphone révoqué efface ses données locales à la connexion suivante.
8. Une modification manuelle d'une ligne d'audit en base est détectée par la tâche de contrôle de la chaîne.
9. Une facture impayée à 15 jours place la structure en lecture seule sans suppression de données.
10. Le test de charge de 500 agents respecte les cibles de la section 14.15.
11. La restauration d'une sauvegarde à un instant donné se réalise en moins de 2 heures lors du test mensuel.
12. L'export Excel d'une structure de 100 000 encaissements se termine en moins de 60 secondes.

### 14.20 Hors périmètre technique du MVP

Application iOS native, portail cotisant, module de crédit, comptabilité générale, scoring par IA, API publique pour partenaires. Chacun de ces blocs s'ajoute sans refonte, car le modèle en événements et les interfaces de fournisseurs sont prévus pour cela.

## 15. Document de design (design system, composants, responsivité)

### 15.1 Principes de design

1. Lisible en plein soleil. L'agent travaille dehors sur un téléphone Android d'entrée de gamme. Contrastes forts, texte de 16 px minimum, aucune information portée par la couleur seule.
2. Une main, un pouce. Sur mobile, les actions principales se placent dans le tiers bas de l'écran, avec des cibles tactiles de 48 px minimum.
3. Le montant au centre. Les chiffres sont le contenu. Ils s'affichent grands, alignés, en chiffres tabulaires.
4. Sobre et institutionnel. La cible gère l'argent d'autrui. L'interface inspire la rigueur : peu de couleurs, aucune décoration gratuite, aucun emoji.
5. Léger. Chaque composant ajouté pèse sur le budget JavaScript de 200 Ko de l'application agent. Un composant spectaculaire mais lourd est refusé.
6. Mobile d'abord. Chaque écran se conçoit à 360 px de large, puis s'enrichit pour la tablette et le bureau.

### 15.2 Trois surfaces, trois usages

| SURFACE | UTILISATEUR | APPAREIL PRINCIPAL | PRIORITÉ DE DESIGN |
| --- | --- | --- | --- |
| Site vitrine | Gérant, dirigeant de SFD | Smartphone, puis ordinateur | Conviction et lisibilité |
| Back-office | Gérant, propriétaire, contrôleur | Ordinateur et tablette | Densité d'information et rapidité de lecture |
| Application agent (PWA) | Agent collecteur | Smartphone Android | Vitesse de saisie et robustesse hors ligne |

### 15.3 Identité visuelle

La palette ci-dessous est une palette de travail. Elle se confirme dès que le logo TontiHelm existe, et les couleurs se lisent alors sur le logo lui-même, sans approximation. Le logo ne se pose jamais sur une couleur issue de sa propre palette.

| ROLE | NOM | VALEUR | USAGE | CONTRASTE |
| --- | --- | --- | --- | --- |
| Primaire | Vert institution | #0F6B4A | Boutons, liens, états actifs | 6,5 à 1 sur blanc |
| Accent | Or | #C8962E | Détails sur fond sombre, chiffres clés du hero | 6,7 à 1 sur l'encre, insuffisant sur blanc |
| Encre | Noir vert | #0B1A14 | Texte principal, pied de page, hero sombre | Base |
| Fond | Papier | #F7F8F5 | Fond des pages | Base |
| Surface | Blanc | #FFFFFF | Cartes, tableaux, formulaires | Base |
| Bordure | Gris vert | #DDE3DC | Séparateurs, contours | Décoratif |
| Texte secondaire | Gris encre | #4A5A50 | Légendes, aides | 7,3 à 1 sur blanc |
| Succès | Vert franc | #167A3E | Carnet à jour, clôture validée | 5,4 à 1 sur blanc |
| Alerte | Ambre foncé | #B45309 | Retard léger, vérification | 5,0 à 1 sur blanc |
| Danger | Rouge profond | #B42318 | Écart de caisse, erreur | 6,6 à 1 sur blanc |
| Information | Bleu | #1D5FA8 | Synchronisation, aide | 6,5 à 1 sur blanc |

Règles d'usage : l'or ne porte jamais de texte sur fond clair. Chaque statut combine une couleur, une icône et un mot, jamais la couleur seule. Les ratios se revérifient avec le contrôleur de contraste WebAIM avant la livraison.

Jetons de design (Tailwind 4) :

```css
@import "tailwindcss";

@theme {
  --color-primary: #0F6B4A;
  --color-primary-foreground: #FFFFFF;
  --color-accent: #C8962E;
  --color-ink: #0B1A14;
  --color-canvas: #F7F8F5;
  --color-surface: #FFFFFF;
  --color-border: #DDE3DC;
  --color-muted: #4A5A50;
  --color-success: #167A3E;
  --color-warning: #B45309;
  --color-danger: #B42318;
  --color-info: #1D5FA8;
  --radius-md: 8px;
  --radius-lg: 12px;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-display: "Plus Jakarta Sans", "Inter", system-ui, sans-serif;
}
```

Les variables sémantiques de shadcn/ui (background, foreground, primary, muted, destructive, ring) se branchent sur ces jetons dans le fichier global. Tous les composants installés héritent ainsi de la palette sans modification locale.

### 15.4 Typographie et format des montants

Polices : Plus Jakarta Sans pour les titres, Inter pour le texte et les chiffres. Chargement par next/font, sous-ensemble latin, deux graisses par police au maximum. Les montants utilisent les chiffres tabulaires (font-variant-numeric: tabular-nums) pour aligner les colonnes.

| RÔLE | MOBILE | TABLETTE | BUREAU |
| --- | --- | --- | --- |
| Titre principal du site (H1) | 32 px | 40 px | 56 px |
| Titre de section (H2) | 24 px | 28 px | 36 px |
| Titre de carte (H3) | 20 px | 22 px | 24 px |
| Corps | 16 px | 16 px | 17 px |
| Texte secondaire | 14 px | 14 px | 14 px |
| Montant saisi par l'agent | 40 px | 48 px | non applicable |
| Cellule de tableau | 14 px | 14 px | 14 px |

Le corps ne descend jamais sous 16 px sur les écrans de saisie, pour éviter le zoom automatique des navigateurs mobiles dans les champs.

Format des montants, une seule fonction pour toute l'application :

```ts
export const formatFCFA = (n: number) =>
  new Intl.NumberFormat("fr-FR").format(n) + "\u00A0FCFA";
// 15500 devient "15 500 FCFA" avec espaces insécables
```

### 15.5 Grille, espacements et points de rupture

Échelle d'espacement : multiples de 4 px (4, 8, 12, 16, 24, 32, 48, 64). Rayons : 8 px pour les champs et boutons, 12 px pour les cartes. Ombres légères, uniquement sur les surfaces flottantes (menus, dialogues).

| APPAREIL | LARGEUR | PRÉFIXE TAILWIND | COLONNES | MARGES | CONTENU MAXIMUM |
| --- | --- | --- | --- | --- | --- |
| Mobile | moins de 768 px | base | 4 | 16 px | pleine largeur |
| Tablette | 768 à 1023 px | md | 8 | 24 px | pleine largeur |
| Bureau | 1024 px et plus | lg | 12 | 32 px | 1200 px au site, pleine largeur au back-office |
| Grand écran | 1280 px et plus | xl | 12 | 32 px | 1200 px |

Largeurs de test obligatoires : 360, 390, 768, 820, 1024, 1280 et 1440 px, en portrait et en paysage pour la tablette.

### 15.6 Stratégie des composants avec 21st.dev

Principe. La base est shadcn/ui, déjà dans la stack. 21st.dev complète cette base avec des composants communautaires, tous écrits en React, Tailwind et compatibles shadcn. Chaque composant publié sur 21st.dev affiche un aperçu interactif et son code TSX complet, et s'installe par la commande shadcn ou se récupère dans Cursor et Claude Code par MCP.

Procédure d'adoption d'un composant :

1. Chercher sur 21st.dev par famille (voir tableau ci-dessous) et retenir 2 candidats.
2. Appliquer la grille de contrôle : code TSX lisible, dépendances limitées, licence compatible avec un usage commercial, clavier et lecteur d'écran fonctionnels, aucun emoji dans le rendu, aucun effet WebGL ou animation permanente, poids ajouté inférieur à 15 Ko compressés.
3. Installer avec la commande shadcn en collant l'adresse du composant copiée depuis sa page 21st.dev.
4. Rebrancher sur les jetons de design de la section 15.3. Aucune couleur écrite en dur.
5. Ranger le composant dans packages/ui, le déclarer dans le fichier COMPONENTS.md (nom, source, date, version, modifications faites) et fixer sa version.
6. Le tester aux largeurs de la section 15.5.

L'adresse exacte de chaque composant retenu se relève sur sa page 21st.dev au moment de l'installation et s'inscrit dans COMPONENTS.md. Ce document ne fige aucune adresse, car le catalogue évolue.

Correspondance besoin, primitive et famille à chercher :

| BESOIN | PRIMITIVE SHADCN/UI | FAMILLE 21ST.DEV À CHERCHER | SURFACE |
| --- | --- | --- | --- |
| Navigation latérale | Sidebar, Sheet, Breadcrumb | sidebar, navbar | Back-office |
| Barre du bas pour l'agent | composant maison sur Tabs | bottom navigation, tab bar | Application agent |
| Liste de cotisants et d'encaissements | Table, Data Table (TanStack), Pagination | data table | Back-office |
| Cartes de chiffres | Card | stats, kpi | Back-office |
| Graphiques | Chart (Recharts) | charts | Back-office |
| Formulaires | Form, Input, Select, Combobox, Calendar | form, input | Toutes |
| Code SMS à saisir | Input OTP | otp input | Connexion |
| Messages de retour | Sonner, Alert, Badge | toast, alert | Toutes |
| Chargement | Skeleton | skeleton | Toutes |
| Fenêtres de confirmation | Dialog, Drawer | dialog, drawer | Toutes |
| Section d'accueil du site | Button, Badge | hero | Site vitrine |
| Grille de fonctionnalités | Card | features | Site vitrine |
| Tarifs | Card, Badge, Toggle | pricing | Site vitrine |
| Questions fréquentes | Accordion | faq | Site vitrine |
| Pied de page | aucune | footer | Site vitrine |
| Étapes d'inscription | composant maison | stepper | Inscription |
| État vide | composant maison | empty state | Back-office |

Composants refusés d'office : tout rendu WebGL, shader, animation de fond permanente, curseur personnalisé, effet de particules. Ils alourdissent le téléphone de l'agent et brouillent un produit financier.

### 15.7 Catalogue des composants du produit

Composants maison, construits sur les primitives ci-dessus et rangés dans packages/ui.

| COMPOSANT | BASE | PROPRIÉTÉS PRINCIPALES | ÉTATS |
| --- | --- | --- | --- |
| AmountKeypad | Button | value, onChange, defaultAmount, maxAmount | normal, erreur de dépassement, désactivé |
| CollectionRow | Card | contributorName, passbookNo, dayIndex, cycleDays, status, amountDue | à faire, encaissé, en retard, en attente d'envoi |
| PassbookCard | Card | contributor, balance, paidDays, missedDays, status | actif, en retard, clos |
| SyncStatusPill | Badge | state, pendingCount | synchronisé, en attente, hors réseau, erreur |
| OfflineBanner | Alert | pendingCount | visible seulement hors réseau |
| ClosingSummary | Card | declared, expected, gap | à déclarer, écart nul, écart à vérifier, validée |
| GapBadge | Badge | gap | nul, positif, négatif |
| KpiCard | Card | label, value, delta, trend | chargement, vide, normal |
| ReceiptPreview | Card | structure, amount, date, passbook, balance | aperçu du SMS |
| ResponsiveTable | Table | columns, rows, priorityColumns, cardRenderer | tableau à partir de 768 px, cartes en dessous |
| StatusBadge | Badge | status | chaque statut avec icône, couleur et mot |

États communs à tout composant de données : chargement (squelette), vide (message et action), erreur (message en français et bouton de reprise), hors réseau (indication claire), désactivé.

Icônes : lucide-react, trait de 1,75 px, tailles 16, 20 et 24 px. Aucun emoji dans l'interface, les messages affichés ni les modèles de SMS.

### 15.8 Disposition par surface et par appareil

Application agent (PWA)

| ÉLÉMENT | MOBILE | TABLETTE |
| --- | --- | --- |
| Navigation | Barre du bas à 4 entrées : Tournée, Encaisser, Clôture, Compte | Rail latéral compact à gauche |
| Écran Tournée | Liste verticale de CollectionRow, filtre par quartier en haut | Deux volets en paysage : liste à gauche, détail du carnet à droite |
| Écran Encaissement | Clavier numérique en bas, bouton Encaisser pleine largeur collé en bas | Clavier centré dans une carte de 420 px, détail du carnet à côté |
| Indicateur de synchronisation | SyncStatusPill dans la barre du haut | Même emplacement |
| Bannière hors réseau | Sous la barre du haut | Sous la barre du haut |
| Cible tactile minimale | 48 px | 48 px |

Back-office du gérant

| ÉLÉMENT | MOBILE | TABLETTE | BUREAU |
| --- | --- | --- | --- |
| Navigation | Barre du haut et menu en tiroir (Sheet) | Sidebar réduite à des icônes, 72 px | Sidebar étendue, 256 px |
| Cartes de chiffres | 1 colonne, défilement vertical | 2 colonnes | 4 colonnes |
| Tableaux | Cartes empilées par ligne, 3 informations clés visibles | Tableau avec colonnes prioritaires, défilement horizontal limité au tableau | Tableau complet |
| Filtres | Tiroir du bas (Drawer) | Barre de filtres repliable | Barre de filtres fixe |
| Graphiques | Un graphique par écran, légende sous le graphique | 2 graphiques côte à côte | 2 à 3 graphiques en grille |
| Actions de ligne | Menu à trois points | Menu à trois points | Boutons visibles au survol et menu |

Site vitrine

| SECTION | MOBILE | TABLETTE | BUREAU |
| --- | --- | --- | --- |
| Hero | Texte puis capture d'écran dessous | Texte puis capture dessous, grande taille | Texte à gauche, capture à droite |
| Chiffres | Grille 2 par 2 | 4 en ligne | 4 en ligne |
| Problème | 1 colonne | 2 colonnes | 4 colonnes |
| Fonctionnalités | 1 colonne | 2 colonnes | 3 colonnes |
| Tarifs | Cartes empilées, palier Pro en premier | 3 cartes côte à côte, resserrées | 3 cartes, Pro mise en avant |
| Questions | Accordéon pleine largeur | Accordéon, largeur limitée à 720 px | Accordéon centré, 720 px |
| Navigation | Menu en tiroir, bouton d'essai toujours visible | Menu complet en ligne | Menu complet en ligne |

### 15.9 Maquette de l'écran d'encaissement (mobile, 360 px)

```
+--------------------------------+
|  <  Carnet 0142    [Synchronisé]|
|  Adjovi Marie                  |
|  Jour 12 sur 31                |
|                                |
|  Solde cumulé      6 000 FCFA  |
|  [ Carnet à jour ]             |
|                                |
|  Montant                       |
|  +--------------------------+  |
|  |        500 FCFA          |  |
|  +--------------------------+  |
|   [ 1 ]    [ 2 ]    [ 3 ]      |
|   [ 4 ]    [ 5 ]    [ 6 ]      |
|   [ 7 ]    [ 8 ]    [ 9 ]      |
|   [ 0 ]    [ 00 ]   [ eff ]    |
|                                |
|  [  Encaisser 500 FCFA      ]  |
+--------------------------------+
```

Règles de l'écran : le montant par défaut est la mise du carnet, validé en une touche. Le bouton Encaisser reste collé au bas de l'écran. Après validation, un retour visuel et une vibration courte confirment l'écriture, puis l'écran revient à la tournée.

### 15.10 Écrans à maquetter

| # | ÉCRAN | SURFACE | PRIORITÉ |
| --- | --- | --- | --- |
| 1 | Connexion par téléphone et PIN | Agent, back-office | MVP |
| 2 | Tournée du jour | Agent | MVP |
| 3 | Fiche carnet et encaissement | Agent | MVP |
| 4 | Déclaration de clôture | Agent | MVP |
| 5 | Tableau de bord du gérant | Back-office | MVP |
| 6 | Liste des cotisants et fiche cotisant | Back-office | MVP |
| 7 | Validation des clôtures et écarts | Back-office | MVP |
| 8 | Journal d'audit | Back-office | MVP |
| 9 | Abonnement et factures | Back-office | MVP |
| 10 | Inscription d'une structure avec justificatif | Site, back-office | MVP |
| 11 | Landing page (sections 1 à 9 du copywriting) | Site vitrine | MVP |
| 12 | File de validation des structures | Administrateur | MVP |

Chaque écran se livre en trois tailles (360, 768, 1280 px) avec ses états : chargement, vide, erreur, hors réseau.

### 15.11 Accessibilité

- Norme visée : WCAG 2.2 niveau AA.
- Contraste du texte : 4,5 à 1 minimum, 3 à 1 pour les grands textes et les composants d'interface.
- Focus clavier toujours visible, avec un anneau de 2 px dans la couleur primaire.
- Cibles tactiles de 48 px minimum dans l'application agent, 40 px au back-office.
- Chaque champ possède une étiquette visible. Les erreurs s'affichent sous le champ, en texte, et se lisent par les technologies d'assistance (aria-describedby).
- La synchronisation et les confirmations s'annoncent dans une région aria-live polie.
- Les statuts combinent icône, couleur et mot.
- Le texte se zoome à 200 % sans perte de contenu ni défilement horizontal.
- Les animations respectent la préférence de réduction de mouvement du système.
- Langue de la page déclarée en français, noms accessibles pour chaque icône-bouton.

### 15.12 Mouvement

- Durées de 150 à 250 ms, courbe d'accélération douce, aucune animation en boucle.
- Site vitrine : apparition progressive des sections au défilement et compteurs animés une seule fois, avec Framer Motion, désactivés si la réduction de mouvement est demandée.
- Application agent : retour visuel court à l'encaissement, aucune autre animation.
- Back-office : transitions de tiroirs et de dialogues uniquement.

### 15.13 Performance du design

| RÈGLE | SEUIL |
| --- | --- |
| Polices | 2 familles, sous-ensemble latin, chargement par next/font |
| Images | WebP ou AVIF, composant next/image, dimensions déclarées |
| JavaScript de l'application agent | Moins de 200 Ko compressés |
| Composants lourds du back-office (graphiques, tableaux) | Chargement différé |
| Décalage de mise en page | Inférieur à 0,1 |
| Plus grand élément affiché (LCP) | Inférieur à 2,5 s sur le site vitrine |

### 15.14 Matrice de tests responsive

| APPAREIL | RÉSOLUTION | ORIENTATION | À VÉRIFIER |
| --- | --- | --- | --- |
| Android d'entrée de gamme | 360 par 640 | Portrait | Saisie à une main, lisibilité au soleil, fluidité |
| Smartphone courant | 390 par 844 | Portrait | Barre du bas, clavier numérique, zone sûre |
| Tablette | 768 par 1024 | Portrait et paysage | Rail latéral, deux volets, tableaux |
| Tablette large | 820 par 1180 | Portrait et paysage | Même contrôle, grille à 8 colonnes |
| Petit portable | 1024 par 768 | Paysage | Sidebar étendue, tableaux complets |
| Ordinateur | 1280 et 1440 | Paysage | Largeur maximale, graphiques en grille |

Contrôles à chaque livraison : aucun défilement horizontal de la page, aucune cible tactile sous 48 px dans l'application agent, texte lisible à 200 %, changement d'orientation sans perte de saisie, fonctionnement correct en mode hors réseau.

### 15.15 Livrables et planning du design

| LIVRABLE | FORMAT | SEMAINE |
| --- | --- | --- |
| Palette confirmée sur le logo, jetons de design | Fichier CSS et page de référence | 1 |
| Choix des composants 21st.dev et fichier COMPONENTS.md | Document | 1 et 2 |
| Maquettes des écrans 1 à 4 en trois tailles | Prototype cliquable | 2 |
| Catalogue des composants maison | Storybook avec vues à 360, 768 et 1280 px | 3 à 4 |
| Maquettes des écrans 5 à 12 | Prototype cliquable | 3 à 5 |
| Landing page assemblée avec le copywriting de la section 13 | Site déployé en préproduction | 6 à 7 |
| Audit d'accessibilité et rapport Lighthouse | PDF avec captures | 11 |

Le design et le développement avancent en parallèle : chaque composant validé dans Storybook s'intègre aussitôt aux écrans.
