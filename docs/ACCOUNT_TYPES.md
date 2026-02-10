# Smuppy — Types de Comptes, Abonnements & Monetisation

> Derniere mise a jour : 10 fevrier 2026

---

## Vue d'ensemble

Smuppy propose **3 types de comptes** et **1 add-on de verification** :

| Type | Cible | Prix |
|------|-------|------|
| **Personal** | Utilisateurs, fans, sportifs | Gratuit |
| **Pro Creator** | Coachs, influenceurs, createurs de contenu fitness | $99/mois |
| **Pro Business** | Salles de sport, studios, centres wellness | $49/mois |
| **Verification** (add-on) | Tout utilisateur souhaitant un badge verifie | $14.90/mois |

---

## 1. COMPTE PERSONAL (Gratuit)

### Cible
Utilisateurs reguliers : fans de fitness, sportifs amateurs, personnes decouvrant du contenu et des createurs.

### Fonctionnalites incluses

| Categorie | Fonctionnalite | Details |
|-----------|---------------|---------|
| **Contenu** | Creer des posts | Photos + texte, visibilite : public, fans only, prive |
| **Contenu** | Creer des peaks | Stories video 3-10 sec, expirent apres 24h |
| **Social** | Follow / Unfollow | Suivre des createurs et businesses |
| **Social** | Likes, commentaires, partages | Sur posts et peaks |
| **Social** | Messagerie directe | Conversations privees |
| **Decouverte** | Fan Feed & Vibes Feed | Flux de contenu personnalise |
| **Decouverte** | Xplorer (carte) | Decouvrir des spots, events, businesses |
| **Decouverte** | Recherche | Profils, posts, peaks, events |
| **Events** | Creer des events | **Max 3 par mois** |
| **Events** | Creer des groupes/activites | **Max 3 par mois** |
| **Events** | Rejoindre des events | Illimite |
| **Business** | Decouvrir des businesses | Carte + recherche par categorie |
| **Business** | Reserver chez un business | Booking + abonnements |
| **Createurs** | S'abonner a une chaine live | Acces aux lives du createur |
| **Createurs** | Booker des sessions privees | En tant que fan/client |
| **Createurs** | Envoyer des tips | Pourboires aux createurs |
| **Bien-etre** | Vibe Guardian | Anti-doom-scroll avec exercice de respiration |
| **Bien-etre** | Vibe Prescriptions | Missions bien-etre contextuelles |
| **Bien-etre** | Vibe Score | Score passif + niveaux + badges |

### Limitations

- **3 events/mois** maximum (reset le 1er du mois)
- **3 groupes/mois** maximum
- Pas de live streaming
- Pas de reception de paiements (tips, sessions, abonnements)
- Pas de challenges
- Pas de wallet ni analytics
- Pas de posts reserves aux abonnes
- Pas d'events payants

---

## 2. COMPTE PRO CREATOR ($99/mois)

### Cible
Coachs sportifs, influenceurs fitness, createurs de contenu, formateurs, athletes qui veulent construire et monetiser leur communaute.

### Ce qui est inclus

**Tout ce que Personal offre** + les fonctionnalites suivantes :

#### Fonctionnalites de creation

| Fonctionnalite | Details |
|---------------|---------|
| **Events illimites** | Plus de limite de 3/mois |
| **Groupes illimites** | Plus de limite de 3/mois |
| **Events payants** | Facturer l'entree aux events (necessite verification) |
| **Challenges** | Creer des defis viraux pour les fans (necessite verification) |
| **Posts subscribers-only** | Visibilite reservee aux abonnes de la chaine |

#### Fonctionnalites de monetisation

| Fonctionnalite | Details | Commission Smuppy |
|---------------|---------|-------------------|
| **Live Streaming** | Streamer en direct vers les fans | — |
| **Channel Subscriptions** | Les fans s'abonnent a la chaine live du createur (abo mensuel, prix libre) | 20-40% (selon taille communaute) |
| **Tips** | Les fans envoient des pourboires pendant les lives et sur le profil | 15% |
| **Sessions privees** | Appels video 1:1 payants (15 a 480 min, prix libre jusqu'a $10,000) | 20% |
| **Session Packs** | Forfaits de sessions a prix reduit (validite 30/60/90 jours) | 20% |
| **Battles** | Competitions live 1v1 entre createurs | — |

#### Outils createur

| Fonctionnalite | Details |
|---------------|---------|
| **Creator Wallet** | Dashboard de revenus, historique des transactions, retraits via Stripe Connect |
| **Analytics** | Stats d'engagement, revenus, performance des lives, retention des abonnes |
| **Visibilite boostee** | Apparait en priorite dans les resultats de recherche |
| **Creator Tier System** | Bronze, Silver, Gold, Platinum, Diamond (selon revenus) |

### Revenue Share — Channel Subscriptions (Chaine Live)

Le partage de revenus pour les abonnements a la chaine live est **progressif** selon la taille de la communaute du createur :

| Nombre de fans | Part createur | Part Smuppy |
|----------------|--------------|-------------|
| 1 — 999 | **60%** | 40% |
| 1,000 — 9,999 | **65%** | 35% |
| 10,000 — 99,999 | **70%** | 30% |
| 100,000 — 999,999 | **75%** | 25% |
| 1,000,000+ | **80%** | 20% |

**Exemple** : Un createur avec 5,000 fans et 200 abonnes a $9.99/mois :
- Revenu brut : 200 x $9.99 = $1,998/mois
- Part createur (65%) : **$1,298.70/mois**
- Part Smuppy (35%) : $699.30/mois

### Revenue Share — Sessions & Packs

| Type de transaction | Part createur | Part Smuppy |
|--------------------|--------------|-------------|
| Session privee | **80%** | 20% |
| Session Pack | **80%** | 20% |
| Tips | **85%** | 15% |

### Ecrans Pro Creator

```
src/screens/sessions/
  PrivateSessionsManageScreen   — Gerer disponibilites et prix
  BookSessionScreen             — Fan reserve une session
  WaitingRoomScreen             — Salle d'attente pre-appel
  PrivateCallScreen             — Appel video (Agora)
  SessionEndedScreen            — Resume post-appel
  PackPurchaseScreen            — Fan achete un pack
  ChannelSubscribeScreen        — Fan s'abonne a la chaine
  CreatorEarningsScreen         — Dashboard de revenus

src/screens/live/
  GoLiveIntroScreen             — Preparation avant le live
  GoLiveScreen                  — Lancement du live
  LiveStreamingScreen           — Diffusion en direct
  ViewerLiveStreamScreen        — Vue spectateur
  LiveEndedScreen               — Stats post-live

src/screens/battles/
  BattleStreamScreen            — Competition live 1v1
  BattleResultsScreen           — Resultats de la battle

src/screens/peaks/
  CreateChallengeScreen         — Creer un defi viral

src/screens/payments/
  CreatorWalletScreen           — Wallet + retraits
```

---

## 3. COMPTE PRO BUSINESS ($49/mois)

### Cible
Salles de sport, studios de yoga/pilates/danse, box CrossFit, centres wellness/spa, piscines, clubs de tennis/padel, salles d'arts martiaux, et tout etablissement fitness/sport.

### Ce qui est inclus

**Tout ce que Personal offre** + les fonctionnalites suivantes :

#### Vitrine & Decouverte

| Fonctionnalite | Details |
|---------------|---------|
| **Profil business complet** | Logo, couverture, horaires 7j/7, adresse, categorie, contact, site web |
| **Apparition sur la carte** | Decouverte Mapbox par geolocalisation |
| **Recherche par categorie** | 21 categories business (gym, yoga, crossfit, piscine, arts martiaux, etc.) |
| **Filtres avances** | Par distance, prix, rating, statut ouvert/ferme |
| **Avis et notes** | Rating etoiles + commentaires clients |

#### Gestion de l'etablissement

| Fonctionnalite | Details |
|---------------|---------|
| **Dashboard proprietaire** | KPIs : reservations du jour, membres actifs, check-ins |
| **Catalogue de services** | 6 types : Session, Cours, Membership, Pack, Produit, Location d'equipement |
| **Gestion des activites** | 8 types (Fitness, Yoga, Cardio, Strength, Flexibility, Combat, Aqua, Dance) |
| **Planning hebdomadaire** | Calendrier 7 jours avec creneaux horaires + instructeurs |
| **Import de planning** | Upload en masse via AI (PDF/image → planning) |
| **Tags personnalises** | "Beginner Friendly", "HIIT", "Low Impact", "Personal Training", etc. |

#### Booking & Paiements

| Fonctionnalite | Details | Commission Smuppy |
|---------------|---------|-------------------|
| **Reservations en ligne** | Les clients reservent des services/seances | 15% |
| **Abonnements/Memberships** | Hebdo/mensuel/annuel avec essais gratuits | 15% |
| **Paiements recurrents** | Prelevement automatique via Stripe | 15% |

#### Controle d'acces

| Fonctionnalite | Details |
|---------------|---------|
| **QR Code membres** | Les abonnes ont un QR code d'acces |
| **Scanner QR** | Le business scanne le QR pour valider l'entree |
| **Validation en temps reel** | Verifie : abonnement actif, date de validite, sessions restantes |
| **Journal d'acces** | Historique complet des check-ins avec audit trail |
| **Haptic feedback** | Retour tactile lors du scan (succes/echec) |

#### Monetisation & Social

| Fonctionnalite | Details |
|---------------|---------|
| **Events illimites** | Creer des events sans limite |
| **Groupes illimites** | Creer des activites de groupe sans limite |
| **Channel Subscriptions** | Proposer des abonnements a la chaine live |
| **Tips** | Recevoir des pourboires |
| **Creator Wallet** | Dashboard de revenus + retraits |

### 21 categories business supportees

| Categorie | Icone |
|-----------|-------|
| Gym | barbell |
| Yoga Studio | body |
| CrossFit Box | fitness |
| Pool / Aquatics | water |
| Martial Arts | flash |
| Dance Studio | musical-notes |
| Wellness / Spa | leaf |
| Sports Club | trophy |
| Personal Training | person |
| Bootcamp | people |
| Pilates Studio | body |
| Meditation Center | happy |
| Tennis Club | tennisball |
| Climbing Gym | trending-up |
| Boxing Gym | fitness |
| Running Club | walk |
| HIIT Studio | flash |
| Swim School | water |
| Nutrition Center | nutrition |
| Golf Club | golf |
| Cycling Studio | bicycle |

### Ecrans Pro Business

```
Cote client (public) :
  BusinessDiscoveryScreen           — Carte + liste des businesses
  BusinessProfileScreen             — Profil complet du business
  BusinessBookingScreen             — Reserver un service
  BusinessBookingSuccessScreen      — Confirmation de reservation
  BusinessSubscriptionScreen        — S'abonner a un membership
  BusinessSubscriptionSuccessScreen — Confirmation d'abonnement
  MySubscriptionsScreen             — Mes abonnements actifs
  MemberAccessScreen                — Afficher mon QR code d'acces

Cote proprietaire (dashboard) :
  BusinessDashboardScreen           — Tableau de bord
  BusinessServicesManageScreen      — Gerer les services/offres
  BusinessProgramScreen             — Gerer activites + planning + tags
  BusinessScheduleUploadScreen      — Import de planning AI
  BusinessScannerScreen             — Scanner QR des membres
```

### Backend — 18 endpoints API

```
Discovery & Profil :
  GET  /businesses/discover            — Recherche + filtres + carte
  GET  /businesses/:id                 — Profil business complet

Dashboard (proprietaire) :
  GET  /businesses/my/dashboard        — Stats du jour

Services (proprietaire) :
  GET  /businesses/my/services         — Liste des services
  POST /businesses/my/services         — Creer un service
  PUT  /businesses/my/services/:id     — Modifier un service
  DEL  /businesses/my/services/:id     — Supprimer un service

Programme (proprietaire) :
  GET  /businesses/my/program          — Activites + planning + tags
  PUT  /businesses/my/program          — Modifier le programme

Planning :
  GET  /businesses/my/schedule         — Planning hebdomadaire
  GET  /businesses/:id/availability    — Creneaux disponibles (clients)

Abonnements :
  POST /businesses/subscriptions       — S'abonner / gerer
  POST /businesses/subscriptions/:id/cancel     — Annuler
  POST /businesses/subscriptions/:id/reactivate — Reactiver
  GET  /businesses/my/subscriptions    — Mes abonnements

Controle d'acces :
  POST /businesses/access/validate     — Valider un QR code
  POST /businesses/access/pass         — Generer un QR d'acces
  POST /businesses/access/log          — Logger une entree
```

---

## 4. VERIFICATION (Add-on — $14.90/mois)

### Cible
Tout utilisateur (Personal, Pro Creator, ou Pro Business) souhaitant obtenir un badge de confiance verifie.

### Ce qui est inclus

| Fonctionnalite | Details |
|---------------|---------|
| **Badge verifie** | Checkmark visible sur le profil, les posts, les peaks et dans la recherche |
| **Priorite dans la recherche** | Meilleur classement dans les resultats de decouverte |
| **Signal de confiance** | Les fans/clients voient que le compte est authentique |
| **Verification d'identite** | Document officiel + selfie via Stripe Identity (une seule fois) |
| **Pre-requis monetisation** | Necessaire pour les challenges et recommande pour les payouts |

### Processus de verification

```
1. L'utilisateur clique "Get Verified" dans les parametres
2. Paiement de $14.90/mois via Stripe Checkout
3. Redirection vers Stripe Identity
4. L'utilisateur prend un selfie + scanne sa piece d'identite
5. Stripe valide l'identite automatiquement
6. Webhook met a jour is_verified = true dans le profil
7. Le badge apparait immediatement
```

### Annulation
- L'utilisateur peut annuler a tout moment
- Le badge reste actif jusqu'a la fin de la periode payee
- Si l'abonnement expire, le badge est retire
- L'utilisateur peut se re-verifier a tout moment

### Positionnement tarifaire

| Plateforme | Prix verification |
|-----------|------------------|
| X (Twitter) Blue | $8/mois |
| Meta Verified (Instagram/FB) | $11.99-14.99/mois |
| Snapchat+ | $3.99/mois |
| Bumble Premium | $14.99/mois |
| **Smuppy** | **$14.90/mois** |

---

## 5. TABLEAU COMPARATIF COMPLET

| Fonctionnalite | Personal (Gratuit) | Pro Creator ($99/mois) | Pro Business ($49/mois) |
|---------------|-------------------|----------------------|------------------------|
| **Contenu** | | | |
| Posts | Illimite | Illimite | Illimite |
| Peaks (stories) | Illimite | Illimite | Illimite |
| Posts subscribers-only | Non | Oui | Non |
| **Social** | | | |
| Follow / messagerie | Oui | Oui | Oui |
| Likes / commentaires | Oui | Oui | Oui |
| **Events & Groupes** | | | |
| Creer des events | 3/mois | Illimite | Illimite |
| Creer des groupes | 3/mois | Illimite | Illimite |
| Events payants | Non | Oui (+ verif) | Oui (+ verif) |
| **Live** | | | |
| Live Streaming | Non | Oui | Oui |
| Channel Subscriptions | Non (s'abonner: oui) | Oui (creer) | Oui (creer) |
| Battles | Non | Oui | Non |
| **Monetisation** | | | |
| Recevoir des tips | Non | Oui (85%) | Oui (85%) |
| Sessions privees | Non (booker: oui) | Oui (80%) | Oui (80%) |
| Session Packs | Non (acheter: oui) | Oui (80%) | Oui (80%) |
| Creator Wallet | Non | Oui | Oui |
| Analytics | Non | Oui | Oui |
| **Business** | | | |
| Profil business | Non | Non | Oui |
| Apparition sur la carte | Non | Non | Oui |
| Booking system | Non | Non | Oui |
| Memberships/Abonnements | Non | Non | Oui (85%) |
| QR Access Control | Non | Non | Oui |
| Dashboard proprietaire | Non | Non | Oui |
| Planning & activites | Non | Non | Oui |
| **Verification** | +$14.90/mois | +$14.90/mois | +$14.90/mois |
| **Bien-etre** | | | |
| Vibe Guardian | Oui | Oui | Non (desactive) |
| Vibe Prescriptions | Oui | Oui | Oui |
| Vibe Score | Oui | Oui | Oui |

---

## 6. GRILLE DES COMMISSIONS

### Pro Creator — Commissions sur les revenus

| Source de revenu | Part createur | Part Smuppy | Details |
|-----------------|--------------|-------------|---------|
| Channel Subscriptions (1-999 fans) | 60% | 40% | Abonnement a la chaine live |
| Channel Subscriptions (1K-9.9K) | 65% | 35% | |
| Channel Subscriptions (10K-99.9K) | 70% | 30% | |
| Channel Subscriptions (100K-999.9K) | 75% | 25% | |
| Channel Subscriptions (1M+) | 80% | 20% | |
| Sessions privees | 80% | 20% | Appels video 1:1 |
| Session Packs | 80% | 20% | Forfaits de sessions |
| Tips | 85% | 15% | Pourboires des fans |

### Pro Business — Commissions sur les revenus

| Source de revenu | Part business | Part Smuppy | Details |
|-----------------|--------------|-------------|---------|
| Reservations | 85% | 15% | Booking de services |
| Abonnements membres | 85% | 15% | Memberships recurrents |
| Packs de seances | 85% | 15% | Forfaits |

---

## 7. ROADMAP TARIFAIRE

### Pro Creator

| Phase | Prix | Nouvelles features activees | Objectif createur |
|-------|------|---------------------------|-------------------|
| **V1** (actuel) | **$99/mois** | Contenu illimite + events + challenges + visibilite | Construire sa communaute |
| **V2** | **$99/mois** | + Live Streaming + Channel Subs + Tips + Battles + Wallet | Premiers revenus |
| **V3** | **$129/mois** | + Sessions privees 1:1 + Packs + Analytics avancees | Vivre de Smuppy ($500-5,000+/mois) |
| **V4** (futur) | **$149/mois** | + Cours en ligne + multi-tier subs + promo tools | Scaler son activite |

**Logique** : Pas de hausse en V2 car c'est la que le createur commence a monetiser — il faut qu'il voie le ROI de ses $99 d'abord. La hausse en V3 ($129) coincide avec les sessions privees, ou un coach peut generer $1,000+/mois facilement.

### Pro Business

| Phase | Prix | Nouvelles features activees | Valeur pour le business |
|-------|------|---------------------------|------------------------|
| **V1** (actuel) | **$49/mois** | Vitrine + carte + decouverte + profil business | Visibilite locale |
| **V2** | **$69/mois** | + Dashboard + QR scanner + planning + gestion activites | Gestion de salle |
| **V3** | **$99/mois** | + Booking en ligne + memberships + paiements recurrents | Generer du CA via Smuppy |
| **V4** (futur) | **$149/mois** | + Multi-location + analytics + marketing + custom branding | Scale multi-sites |

**Logique** : $49 est correct pour une vitrine. La hausse a $69 en V2 quand le business a des outils de gestion. $99 en V3 quand le business genere du revenu directement via Smuppy (booking + memberships).

### Verification

| Phase | Prix | Evolution |
|-------|------|-----------|
| **Toutes phases** | **$14.90/mois** | Prix fixe, aligne avec le marche |

### Plan Annuel (prevu pour V2)

| Abonnement | Prix mensuel | Prix annuel | Economie |
|-----------|-------------|-------------|----------|
| Pro Creator | $99/mois | $990/an ($82.50/mois) | -17% |
| Pro Business | $49/mois | $490/an ($40.83/mois) | -17% |
| Verification | $14.90/mois | $149/an ($12.42/mois) | -17% |

### Grandfathering

- Les utilisateurs qui souscrivent a un prix donnent gardent ce prix tant qu'ils ne cancel pas
- S'ils cancel et re-souscrivent apres une hausse, ils paient le nouveau prix
- Les nouveaux utilisateurs paient toujours le prix de la phase actuelle

---

## 8. FLUX D'UPGRADE

### Personal vers Pro Creator

```
Parametres → Upgrade to Pro Creator
  → Presentation des fonctionnalites ($99/mois)
  → Double confirmation requise
  → Acceptation des conditions + commission plateforme (20%)
  → Paiement via Stripe Checkout
  → Compte upgrade vers pro_creator
  → (Optionnel) Verification d'identite recommandee
```

**Note** : L'upgrade est irreversible. Un pro_creator ne peut pas revenir en personal.

### Personal vers Pro Business

```
Onboarding → Choix du type de compte "Business"
  → Formulaire business (nom, categorie, adresse, telephone)
  → Configuration du profil business
  → Paiement de l'abonnement Pro Business ($49/mois)
  → Compte cree en pro_business
```

### Ajout de la Verification

```
Profil → Parametres → Get Verified
  → Paiement $14.90/mois via Stripe Checkout
  → Verification d'identite Stripe Identity (document + selfie)
  → Badge attribue automatiquement
```

---

## 9. FEATURE FLAGS (Production)

Certaines fonctionnalites sont developpees mais desactivees en production pour un lancement progressif :

| Feature | Status | Phase prevue |
|---------|--------|-------------|
| CREATE_POST | Actif | V1 |
| CREATE_PEAK | Actif | V1 |
| MESSAGING | Actif | V1 |
| SEARCH | Actif | V1 |
| XPLORER_MAP | Actif | V1 |
| CREATE_ACTIVITY | Actif | V1 |
| CHALLENGES | Actif | V1 |
| BUSINESS_DISCOVERY | Actif | V1 |
| DISPUTES | Actif | V1 |
| VIBE_GUARDIAN | Actif | V1 |
| VIBE_PRESCRIPTIONS | Actif | V1 |
| VIBE_SCORE | Actif | V1 |
| GO_LIVE | Desactive | V2 |
| VIEWER_LIVE_STREAM | Desactive | V2 |
| BATTLES | Desactive | V2 |
| BUSINESS_DASHBOARD | Desactive | V2 |
| BUSINESS_SCANNER | Desactive | V2 |
| PRIVATE_SESSIONS | Desactive | V3 |
| CHANNEL_SUBSCRIBE | Desactive | V2 |
| TIPPING | Desactive | V2 |
| CREATOR_WALLET | Desactive | V2 |
| BUSINESS_BOOKING | Desactive | V3 |
| UPGRADE_TO_PRO | Desactive | V2 |
| IDENTITY_VERIFICATION | Desactive | V2 |
| PLATFORM_SUBSCRIPTION | Desactive | V2 |

---

## 10. POSITIONNEMENT CONCURRENTIEL

### Pro Creator ($99/mois) vs. Concurrents

| Solution | Prix | Ce que ca inclut |
|----------|------|-----------------|
| Mindbody (coaching) | $139-449/mois | Scheduling + booking seulement |
| Kajabi (cours en ligne) | $149-399/mois | Cours + marketing, pas de live |
| Teachable (cours) | $39-119/mois | Cours seulement |
| Stan Store (boutique) | $29/mois | Boutique createur basique |
| Calendly Pro (RDV) | $12-20/mois | Prise de RDV seulement |
| StreamYard (streaming) | $25-49/mois | Streaming seulement |
| **Smuppy Pro Creator** | **$99/mois** | **Live + sessions + subs + tips + events + social** |

### Pro Business ($49/mois) vs. Concurrents

| Solution | Prix | Ce que ca inclut |
|----------|------|-----------------|
| Mindbody | $139-449/mois | Planning + booking + membership |
| Zen Planner | $117-257/mois | Gestion salle + acces |
| GloFox | $100-300/mois | Planning + membres + acces |
| Vagaro | $25-85/mois | Booking + POS basique |
| ClassPass (listing) | 10-15% par visite | Discovery seul |
| **Smuppy Pro Business** | **$49/mois** | **Vitrine + carte + booking + membership + QR + planning + social** |

---

## 11. INTEGRATION PAIEMENTS

Tous les paiements passent par **Stripe** (zero commission Apple/Google Store) :

| Methode | Usage |
|---------|-------|
| **Stripe Checkout** (navigateur) | Abonnements platform, verification, channel subs |
| **Stripe Connect** | Payouts aux createurs et businesses |
| **Stripe Identity** | Verification d'identite |
| **Webhooks** | Confirmation de paiement, renouvellement, annulation |

### Flux de paiement typique

```
1. Client demande un paiement au backend
2. Backend cree une Stripe Checkout Session
3. Client ouvre le lien dans le navigateur
4. L'utilisateur complete le paiement sur Stripe
5. Stripe envoie un webhook au backend
6. Backend confirme la transaction + met a jour le statut
7. Les fonds sont repartis selon les commissions
```

---

## 12. REFERENCES TECHNIQUES

### Fichiers cles

| Fichier | Role |
|---------|------|
| `src/config/featureFlags.ts` | Feature flags (on/off par feature) |
| `src/types/index.ts` | Type `AccountType = 'personal' \| 'pro_creator' \| 'pro_business'` |
| `src/screens/settings/UpgradeToProScreen.tsx` | Ecran d'upgrade Pro Creator |
| `src/screens/payments/IdentityVerificationScreen.tsx` | Ecran de verification |
| `aws-migration/lambda/api/payments/platform-subscription.ts` | Backend subscription Pro |
| `aws-migration/lambda/api/payments/identity.ts` | Backend verification |
| `aws-migration/lambda/api/payments/channel-subscription.ts` | Backend channel subs |
| `aws-migration/lambda/api/payments/web-checkout.ts` | Checkout unifie (sessions, packs, subs, tips) |
| `aws-migration/lambda/api/payments/webhook.ts` | Webhooks Stripe |
| `aws-migration/lambda/api/payments/wallet.ts` | Wallet createur |
| `aws-migration/lambda/api/payments/create-intent.ts` | PaymentIntents (sessions) |
| `aws-migration/lambda/api/payments/business-checkout.ts` | Checkout business |

### Constantes dans le code

```typescript
// Prix des abonnements platform
pro_creator:  { amount: 9900, name: 'Pro Creator' }   // $99/mois
pro_business: { amount: 4900, name: 'Pro Business' }   // $49/mois
VERIFICATION_FEE_CENTS = 1490                           // $14.90/mois

// Commissions
PLATFORM_FEE_PERCENT = 20    // Sessions/packs : 20% Smuppy
Tips : 15%                    // Tips : 15% Smuppy
Business : 15%                // Business transactions : 15% Smuppy
Channel Subs : 20-40%         // Variable selon fan_count (voir grille)
```

---

## Historique des versions

| Version | Date | Modifications |
|---------|------|--------------|
| 1.0.0 | 2024-01 | Types de comptes initiaux (Personal, Pro Creator) |
| 2.0.0 | 2024-02 | Ajout du type Pro Business |
| 2.1.0 | 2024-02 | Ajout du systeme QR d'acces |
| 2.2.0 | 2024-02 | Ajout de l'import de planning AI |
| 3.0.0 | 2026-02 | Refonte complete : pricing, roadmap, commissions, feature flags, verification |
