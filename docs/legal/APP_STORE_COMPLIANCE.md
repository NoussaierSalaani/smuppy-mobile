# App Store Compliance - Smuppy

> **Parent**: [CLAUDE.md](../../CLAUDE.md) | **Account types**: [ACCOUNT_TYPES.md](../ACCOUNT_TYPES.md) | **TOS**: [TERMS_OF_SERVICE_PAYMENTS.md](./TERMS_OF_SERVICE_PAYMENTS.md)

## Classification des Services

### Services Exempts d'In-App Purchase (Apple Guidelines 3.1.3)

Selon les [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase):

> "Apps may facilitate approved virtual currencies and gift cards as long as these are redeemed for merchandise or services that are not otherwise considered in-app purchases."

> "Apps may use in-app purchase to sell and sell services offered in real life." - Cette phrase clé indique que les services réels peuvent être vendus via des moyens externes.

### Nos Services Classifiés comme "Services Réels"

| Service | Classification | Justification |
|---------|---------------|---------------|
| Sessions 1:1 Live | Service Réel | Consultation/coaching en temps réel avec un créateur |
| Packs de Sessions | Service Réel | Prépaiement pour des services de consultation |
| Abonnement Créateur | Contenu Digital | Accès à du contenu exclusif |

### Précédents Juridiques

1. **Uber/Lyft** - Services de transport payés hors IAP
2. **Airbnb** - Réservations payées hors IAP
3. **ClassPass** - Cours de fitness payés hors IAP
4. **Cameo** - Messages personnalisés payés hors IAP (similaire à nos sessions!)
5. **Calendly** - Réservations de consultations payées hors IAP

## Stratégie de Conformité

### 1. Description App Store

```
Smuppy permet aux fans de réserver des sessions de consultation 1:1
en direct avec leurs créateurs préférés.

Les sessions sont des services de coaching/consultation personnalisés
fournis en temps réel par des créateurs indépendants.

Note: Les paiements pour les services de consultation sont traités
via notre site web sécurisé conformément aux conditions de service.
```

### 2. Termes Clés à Utiliser

**UTILISER:**
- "Consultation"
- "Coaching session"
- "Service personnalisé"
- "Rendez-vous en direct"
- "Session de conseil"

**ÉVITER:**
- "Achat digital"
- "Contenu premium"
- "Débloquer"
- "Crédits virtuels"

### 3. Flow Utilisateur Conforme

```
Écran Session:
┌─────────────────────────────────────┐
│  Réserver une session avec @creator │
│                                     │
│  📅 30 min de consultation live     │
│  💰 20€                              │
│                                     │
│  [Réserver sur smuppy.com]          │
│                                     │
│  ℹ️ Les paiements sont traités sur  │
│  notre site web sécurisé.           │
└─────────────────────────────────────┘
```

### 4. Mention Obligatoire (External Link Entitlement)

Si vous utilisez l'entitlement External Link d'Apple:

```
"Vous allez quitter l'application pour effectuer votre paiement
sur smuppy.com. Apple n'est pas responsable de la confidentialité
ou de la sécurité des transactions effectuées en dehors de l'App Store."
```

## Exemples de Textes pour l'App

### Dans les CGU

```
5. PAIEMENTS ET SERVICES

5.1 Services de Consultation
Les sessions 1:1 proposées sur Smuppy constituent des services de
consultation personnalisés fournis par des créateurs indépendants.
Ces services sont similaires à des consultations professionnelles
(coaching, conseil, mentorat) et ne constituent pas des biens
numériques ou du contenu digital.

5.2 Traitement des Paiements
Les paiements pour les services de consultation sont traités par
notre prestataire de paiement certifié (Stripe) via notre plateforme
web sécurisée. Cette méthode garantit une protection optimale de
vos données bancaires conformément aux normes PCI-DSS.

5.3 Nature des Services
En réservant une session, vous achetez un service de consultation
en temps réel avec un créateur, et non un bien numérique. Le créateur
s'engage à fournir son temps et son expertise pendant la durée
convenue de la session.
```

### Dans la FAQ In-App

```
Q: Pourquoi le paiement se fait-il sur le web?

R: Les sessions Smuppy sont des services de consultation personnalisés
(comme un coaching ou un rendez-vous avec un expert). Conformément
aux politiques des app stores, les services réels peuvent être payés
via des prestataires de paiement externes. Cela nous permet également
de vous offrir des tarifs plus avantageux et une meilleure rémunération
pour les créateurs.
```

## Checklist Avant Soumission

- [ ] Description App Store mentionne "consultation" et "services"
- [ ] CGU à jour avec section paiements
- [ ] Pas de bouton "Acheter" in-app pour les sessions
- [ ] Lien externe avec disclosure approprié
- [ ] FAQ expliquant le processus de paiement
- [ ] Screenshots ne montrent pas de prix in-app pour les sessions
- [ ] Metadata ne contient pas "in-app purchase" pour les sessions

## Références

- [Apple App Store Guidelines 3.1.3](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
- [Google Play Payments Policy](https://support.google.com/googleplay/android-developer/answer/9858738)
- [EU Digital Markets Act](https://digital-markets-act.ec.europa.eu/)
- [Epic v. Apple Ruling](https://cand.uscourts.gov/cases-e-filing/cases-of-interest/epic-games-inc-v-apple-inc/)
