# Dispute & Resolution Center - Architecture Complete

> **Parent**: [CLAUDE.md](../CLAUDE.md) | **Legal**: [legal/TERMS_OF_SERVICE_PAYMENTS.md](./legal/TERMS_OF_SERVICE_PAYMENTS.md) | **Compliance**: [legal/APP_STORE_COMPLIANCE.md](./legal/APP_STORE_COMPLIANCE.md)

## Vue d'ensemble

Système de protection des utilisateurs pour les sessions 1:1 et live streams avec :
- **Vérification automatique** (durée, présence, logs)
- **Portail de réclamation** pour les utilisateurs
- **Investigation manuelle** par les admins
- **Système de remboursement** intégré Stripe
- **Protection anti-fraude** pour les créateurs

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COUCHE UI                                    │
├─────────────────────────────────────────────────────────────────────┤
│  SessionCompleteScreen        DisputeFormScreen     DisputeTracker  │
│  └── Confirmation présence    └── Upload preuves    └── Status      │
│                                                                     │
│  MySessionsScreen (ajout)     AdminDisputeDashboard                 │
│  └── "Réclamer" button        └── Review & Decision                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                      COUCHE API (Lambda)                             │
├─────────────────────────────────────────────────────────────────────┤
│  POST   /disputes                    Créer une réclamation           │
│  GET    /disputes/:id                Voir détails                    │
│  POST   /disputes/:id/evidence       Ajouter preuves                 │
│  POST   /disputes/:id/resolve        Résoudre (admin)                │
│                                                                     │
│  GET    /session-verification/:id    Vérification auto               │
│  POST   /sessions/:id/confirm        Confirmation présence           │
│                                                                     │
│  Webhook Stripe: gère les remboursements liés aux disputes          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    COUCHE BASE DE DONNÉES                           │
├─────────────────────────────────────────────────────────────────────┤
│  TABLE: session_disputes                                            │
│  ├── id, session_id, payment_id                                     │
│  ├── complainant_id (user), respondent_id (creator)                 │
│  ├── type: 'no_show' | 'incomplete' | 'quality' | 'technical'       │
│  ├── status: 'open' | 'under_review' | 'resolved' | 'appealed'      │
│  ├── resolution: 'refunded' | 'partial_refund' | 'rejected'         │
│  ├── auto_verification_data (JSON)                                  │
│  └── created_at, resolved_at                                        │
│                                                                     │
│  TABLE: dispute_evidence                                            │
│  ├── id, dispute_id, type: 'screenshot' | 'chat' | 'recording'      │
│  ├── url, uploaded_by, uploaded_at                                  │
│                                                                     │
│  TABLE: session_verification_logs                                   │
│  ├── session_id, event_type, timestamp, metadata                    │
│  └── events: joined, left, duration, connection_quality             │
│                                                                     │
│  TABLE: session_attendance (Agora + app tracking)                   │
│  ├── user_id, session_id, joined_at, left_at, duration_seconds      │
│  ├── connection_quality_avg, reconnect_count                        │
│  └── device_info (for fraud detection)                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flux de Workflow

### 1. Session Normale (Happy Path)

```
User A (acheteur)          Créateur              Système
     |                         |                    |
     |── Joint la session ──────>│                    |
     |                         │                    |
     │<── Session 30min ────────│                    |
     |                         │                    |
     |── Quitte ───────────────>│                    |
     |                         │                    |
     |                         │── Marque complete ──>│
     |                         │                    │── Log attendance
     |                         │                    │── Vérification auto OK
     |                         │                    │── Paiement released
```

### 2. Réclamation (Dispute Path)

```
User A (insatisfait)       Admin                Système
     |                         |                    |
     |── Report problème ───────>│                    │
     │   (dans 24h)           │                    │
     |                         │                    │
     │<── Formulaire ───────────│                    │
     |                         │                    │
     |── Soumet preuves ────────>│                    │
     │   + justification      │                    │
     |                         │                    │
     │                         │<── Notification ────│
     │                         │                    │
     │<── Investigation ────────│                    │
     │   (48-72h)             │                    │
     |                         │                    │
     │── Résolution ────────────>│                    │
     │   refund/partial/     │                    │
     │   reject               │                    │
```

---

## 🛡️ Vérification Automatique

### Données Collectées

| Source | Données | Usage |
|--------|---------|-------|
| **Agora SDK** | Join time, leave time, duration, network quality, reconnections | Preuve de présence/absence |
| **App Events** | Screen on/off, app background/foreground | Détection inattention |
| **Chat** | Messages envoyés | Engagement proof |
| **Stripe** | Payment status, refund history | Financial tracking |
| **Creator Check** | Confirmation créateur post-session | Counter-claim |

### Algorithme de Vérification

```typescript
interface VerificationResult {
  userPresent: boolean;
  creatorPresent: boolean;
  actualDuration: number; // minutes
  expectedDuration: number;
  quality: 'good' | 'fair' | 'poor';
  evidence: {
    userJoined: boolean;
    userStayedMinTime: boolean; // > 50% scheduled
    creatorJoined: boolean;
    creatorStayedMinTime: boolean;
  };
  recommendation: 'approve_refund' | 'investigate' | 'reject';
}

function autoVerify(sessionId: string): VerificationResult {
  // 1. Récupérer logs Agora
  const agoraLogs = getAgoraAttendance(sessionId);
  
  // 2. Vérifier durées
  const userDuration = agoraLogs.user.leftAt - agoraLogs.user.joinedAt;
  const creatorDuration = agoraLogs.creator.leftAt - agoraLogs.creator.joinedAt;
  const expectedDuration = getSessionDuration(sessionId);
  
  // 3. Calculer présence effective
  const overlapDuration = calculateOverlap(userDuration, creatorDuration);
  
  // 4. Prendre décision
  if (!agoraLogs.creator.joined) {
    return { recommendation: 'approve_refund', creatorPresent: false, ... };
  }
  
  if (overlapDuration < expectedDuration * 0.5) {
    return { recommendation: 'approve_refund', actualDuration: overlapDuration, ... };
  }
  
  if (overlapDuration < expectedDuration * 0.8) {
    return { recommendation: 'investigate', ... };
  }
  
  return { recommendation: 'reject', ... };
}
```

---

## 📱 UI/UX Design

### Écran Post-Session (Nouveau)

```
┌─────────────────────────────────────┐
│  ✓ Session Completed                │
│                                     │
│  Durée: 28 min / 30 min prévus     │
│                                     │
│  [ Tout s'est bien passé ]          │
│                                     │
│  ─── ou signaler un problème ───   │
│                                     │
│  [ Le créateur n'est pas venu ]    │
│  [ Session trop courte ]            │
│  [ Qualité insuffisante ]           │
│  [ Problème technique ]             │
│                                     │
└─────────────────────────────────────┘
```

### Formulaire de Réclamation

```
┌─────────────────────────────────────┐
│  🚨 Ouvrir une réclamation          │
│                                     │
│  Type de problème:                  │
│  ○ Créateur absent                  │
│  ○ Session incomplète               │
│  ○ Qualité insuffisante             │
│  ○ Problème technique               │
│                                     │
│  Description détaillée:             │
│  ┌─────────────────────────────┐   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  Preuves (optionnel):               │
│  [ 📷 Screenshot ] [ 🎥 Enregistr. ]│
│                                     │
│  Remboursement demandé:             │
│  ○ Total (100%)  ○ Partiel (50%)   │
│                                     │
│  [ Soumettre la réclamation ]       │
│                                     │
│  Vous avez 24h après la session     │
│  pour ouvrir une réclamation.       │
└─────────────────────────────────────┘
```

### Dashboard Admin

```
┌─────────────────────────────────────────────────────┐
│  📋 Gestion des Réclamations                        │
│                                                     │
│  Filtres: [Ouvertes ▼] [Tous types ▼] [24h ▼]      │
│                                                     │
│  ┌────────────────────────────────────────────────┐│
│  │ 🔴 #DIS-128 - Absence créateur                 ││
│  │ User: @john_doe | Creator: @fitness_pro       ││
│  │ Session: 2024-02-08 14:00 | €50               ││
│  │ Auto-verif: ❌ Créateur absent | ⏱️ 0 min      ││
│  │ [ Voir détails ] [ Approuver ] [ Rejeter ]    ││
│  └────────────────────────────────────────────────┘│
│                                                     │
│  ┌────────────────────────────────────────────────┐│
│  │ 🟡 #DIS-127 - Qualité insuffisante            ││
│  │ User: @jane_smith | Creator: @coach_mike      ││
│  │ Auto-verif: ✅ Présent mais durée: 15/30 min  ││
│  │ [ Voir détails ] [ Demander preuves ]         ││
│  └────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

---

## 🗄️ Schéma SQL

```sql
-- ============================================
-- SESSION DISPUTES
-- ============================================
CREATE TABLE IF NOT EXISTS session_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_number VARCHAR(20) UNIQUE NOT NULL, -- DIS-2024-XXXXX
  
  -- Relations
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  refund_id UUID REFERENCES refunds(id) ON DELETE SET NULL,
  
  -- Parties
  complainant_id UUID NOT NULL REFERENCES profiles(id), -- User who complains
  respondent_id UUID NOT NULL REFERENCES profiles(id),  -- Creator being complained about
  
  -- Dispute details
  type VARCHAR(50) NOT NULL, -- 'no_show', 'incomplete', 'quality', 'technical', 'other'
  status VARCHAR(50) DEFAULT 'open', -- 'open', 'under_review', 'evidence_requested', 'resolved', 'appealed', 'closed'
  priority VARCHAR(20) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  -- Descriptions
  complainant_description TEXT NOT NULL,
  respondent_response TEXT,
  admin_notes TEXT,
  
  -- Financial
  amount_cents INTEGER NOT NULL, -- Amount in dispute
  refund_amount_cents INTEGER, -- Actual refund processed
  currency VARCHAR(3) DEFAULT 'eur',
  
  -- Resolution
  resolution VARCHAR(50), -- 'full_refund', 'partial_refund', 'no_refund', 'rescheduled'
  resolution_reason TEXT,
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  
  -- Auto-verification (populated automatically)
  auto_verification JSONB DEFAULT '{}', -- { userPresent, creatorPresent, duration, recommendation }
  
  -- Timestamps
  evidence_deadline TIMESTAMPTZ, -- When evidence must be submitted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_disputes_complainant ON session_disputes(complainant_id, status);
CREATE INDEX idx_disputes_respondent ON session_disputes(respondent_id, status);
CREATE INDEX idx_disputes_session ON session_disputes(session_id);
CREATE INDEX idx_disputes_status_created ON session_disputes(status, created_at DESC);

-- ============================================
-- DISPUTE EVIDENCE
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES session_disputes(id) ON DELETE CASCADE,
  
  evidence_type VARCHAR(50) NOT NULL, -- 'screenshot', 'recording', 'chat_log', 'document', 'other'
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size_bytes INTEGER,
  mime_type VARCHAR(100),
  
  description TEXT,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- For admin review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE INDEX idx_evidence_dispute ON dispute_evidence(dispute_id);

-- ============================================
-- SESSION ATTENDANCE (Agora + App tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Timing
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Connection quality
  agora_uid VARCHAR(50),
  network_quality_avg INTEGER, -- 0-6 Agora scale
  reconnect_count INTEGER DEFAULT 0,
  
  -- Device/App info
  device_type VARCHAR(50), -- 'ios', 'android', 'web'
  app_version VARCHAR(50),
  
  -- Events log (JSON array of events)
  events JSONB DEFAULT '[]', -- [{ type: 'joined', at: '...' }, { type: 'network_changed', quality: 3 }]
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attendance_session ON session_attendance(session_id, user_id);
CREATE INDEX idx_attendance_user ON session_attendance(user_id, joined_at DESC);

-- ============================================
-- SESSION VERIFICATION LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS session_verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES private_sessions(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL, -- 'session_started', 'user_joined', 'user_left', 'creator_joined', 'creator_left', 'quality_changed', 'ended'
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  
  metadata JSONB DEFAULT '{}', -- { userId, duration, quality, reason }
  
  source VARCHAR(50) DEFAULT 'app' -- 'app', 'agora_webhook', 'stripe_webhook'
);

CREATE INDEX idx_verification_logs_session ON session_verification_logs(session_id, occurred_at DESC);
CREATE INDEX idx_verification_logs_event ON session_verification_logs(event_type, occurred_at);

-- ============================================
-- DISPUTE NOTIFICATIONS (for users)
-- ============================================
CREATE TABLE IF NOT EXISTS dispute_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id UUID NOT NULL REFERENCES session_disputes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  notification_type VARCHAR(50) NOT NULL, -- 'dispute_opened', 'evidence_requested', 'resolved', 'appealed'
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispute_notifs_user ON dispute_notifications(user_id, read_at);
```

---

## 🔒 Anti-Fraude & Protection

### Pour les Utilisateurs
- ✅ Vérification automatique objective
- ✅ Fenêtre de réclamation limitée (24h)
- ✅ Preuves requises pour les réclamations
- ✅ Historique des disputes visible sur profil créateur

### Pour les Créateurs
- ✅ Contre-notification possible
- ✅ Evidence de présence automatique
- ✅ Grace period pour répondre (48h)
- ✅ Protection contre réclamations abusives (max 3/mois)
- ✅ Impact réputation graduel (pas de ban immédiat)

### Détection de Fraude
```typescript
// Flags qui déclenchent une review manuelle:
- User avec >3 disputes en 30 jours
- Créateur avec >5 disputes en 30 jours
- Dispute montant > €500
- Evidence contradictoire (user vs créateur)
- Pattern de "chargebacks" récurrents
- IP/Device mismatch suspect
```

---

## 📊 KPIs & Monitoring

| Métrique | Objectif | Alertes |
|----------|----------|---------|
| Dispute rate | < 2% des sessions | > 3% = alerte |
| Avg resolution time | < 48h | > 72h = alerte |
| Refund rate | < 1% du volume | > 2% = review |
| Creator satisfaction | > 4.5/5 | < 4.0 = action |
| Auto-resolution rate | > 60% | < 40% = optimiser algo |

---

## 🚀 Phases de Déploiement

### Phase 1: Foundation (Semaine 1-2)
- [ ] Migration DB (tables disputes)
- [ ] Lambda GET/POST disputes
- [ ] Agora attendance tracking
- [ ] Auto-verification algorithm

### Phase 2: UI User (Semaine 3)
- [ ] Post-session confirmation screen
- [ ] Dispute form screen
- [ ] Dispute tracker screen
- [ ] Upload evidence

### Phase 3: UI Admin (Semaine 4)
- [ ] Admin dispute dashboard
- [ ] Review interface
- [ ] Decision workflow
- [ ] Notifications system

### Phase 4: Polish (Semaine 5)
- [ ] Tests E2E
- [ ] Anti-fraud tuning
- [ ] Documentation
- [ ] Training support team

---

*Document de conception - Système Dispute & Resolution*
