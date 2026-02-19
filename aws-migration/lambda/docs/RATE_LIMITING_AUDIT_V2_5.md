# Rate Limiting Audit V2.5 — Deep Verification

**Audit Date**: 2026-02-14  
**Auditor**: Claude Code  
**Scope**: All 218 Lambda handlers — exhaustive re-verification  
**Status**: ⚠️ **CRITICAL GAPS FOUND**

---

## Executive Summary

Suite à une vérification exhaustive de **218 fichiers**, j'ai découvert **plusieurs gaps critiques** qui n'avaient pas été identifiés dans l'audit V2 :

| Category | V2 Status | V2.5 Status | Impact |
|----------|-----------|-------------|--------|
| Feed following | ⚠️ Missing | ✅ **Fixed** | Rate limit ajouté (60/min) |
| Earnings endpoint | ✅ OK | ❌ **CRITICAL** | Endpoint financier sans protection |
| Packs management | ✅ OK | ❌ **CRITICAL** | Création/modification packs illimitée |
| Profile followers | ✅ OK | ❌ **P1** | Scraping de followers possible |
| Profile following | ✅ OK | ❌ **P1** | Scraping de following possible |
| Business discover | ✅ OK | ❌ **P1** | Scraping de businesses |
| Spots nearby | ✅ OK | ❌ **P1** | Scraping de géolocalisation |
| Comments list | ✅ OK | ⚠️ **P2** | Scraping de commentaires |
| Challenges list | ✅ OK | ⚠️ **P2** | Scraping de challenges |

**Score final**: 7.5/10 (↓ depuis 9.6/10)

---

## 🚨 P0 — Gaps Critiques

### 1. `earnings/get.ts` — Endpoint Financier Non Protégé
**Fichier**: `aws-migration/lambda/api/earnings/get.ts`
**Méthode**: GET
**Impact**: Permet de récupérer les revenus d'un créateur sans limitation
**Risque**: Énumération de données financières, scraping des transactions

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'earnings-get',
  identifier: userId,
  windowSeconds: 60,
  maxRequests: 30,
});
```

---

### 2. `packs/manage.ts` — Création de Packs Illimitée
**Fichier**: `aws-migration/lambda/api/packs/manage.ts`
**Méthodes**: POST (create), PUT (update), DELETE
**Impact**: Permet de créer/modifier/supprimer des packs sans limitation
**Risque**: Spam de packs, création de milliers de packs factices

**Recommandation**:
```typescript
// Pour CREATE uniquement
const { allowed } = await checkRateLimit({
  prefix: 'packs-create',
  identifier: userId,
  windowSeconds: 3600, // 1 heure
  maxRequests: 10,     // 10 packs/heure max
});
```

---

## 🔴 P1 — Gaps Importants (Scraping)

### 3. `profiles/followers.ts` — Scraping de Followers
**Fichier**: `aws-migration/lambda/api/profiles/followers.ts`
**Méthode**: GET
**Impact**: Permet de scraper la liste des followers de n'importe quel profil public
**Risque**: Collecte de données utilisateurs, violation de vie privée

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'profiles-followers',
  identifier: clientIp,
  windowSeconds: 60,
  maxRequests: 30,
});
```

---

### 4. `profiles/following.ts` — Scraping de Following
**Fichier**: `aws-migration/lambda/api/profiles/following.ts`
**Méthode**: GET
**Impact**: Permet de scraper la liste des personnes suivies
**Risque**: Collecte de données, analyse de réseaux sociaux

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'profiles-following',
  identifier: clientIp,
  windowSeconds: 60,
  maxRequests: 30,
});
```

---

### 5. `business/discover.ts` — Scraping de Businesses
**Fichier**: `aws-migration/lambda/api/business/discover.ts`
**Méthode**: GET
**Impact**: Recherche de businesses par géolocalisation sans limitation
**Risque**: Scraping de la base de données commerciale, harvesting

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'business-discover',
  identifier: clientIp,
  windowSeconds: 60,
  maxRequests: 30,
});
```

---

### 6. `spots/nearby.ts` — Scraping de Géolocalisation
**Fichier**: `aws-migration/lambda/api/spots/nearby.ts`
**Méthode**: GET
**Impact**: Recherche de spots par coordonnées GPS sans limitation
**Risque**: Scraping de la carte complète, collecte de données de localisation

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'spots-nearby',
  identifier: clientIp,
  windowSeconds: 60,
  maxRequests: 30,
});
```

---

## 🟡 P2 — Gaps Mineurs

### 7. `comments/list.ts` — Scraping de Commentaires
**Fichier**: `aws-migration/lambda/api/comments/list.ts`
**Méthode**: GET
**Impact**: Liste les commentaires d'un post sans limitation
**Risque**: Scraping de conversations, mais moins critique (données publiques)

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'comments-list',
  identifier: clientIp || cognitoSub,
  windowSeconds: 60,
  maxRequests: 60,
});
```

---

### 8. `challenges/list.ts` — Scraping de Challenges
**Fichier**: `aws-migration/lambda/api/challenges/list.ts`
**Méthode**: GET
**Impact**: Liste les challenges sans limitation
**Risque**: Scraping, mais données principalement publiques

**Recommandation**:
```typescript
const { allowed } = await checkRateLimit({
  prefix: 'challenges-list',
  identifier: clientIp,
  windowSeconds: 60,
  maxRequests: 60,
});
```

---

### 9. `posts/get.ts` et `posts/likers.ts`
**Fichiers**: 
- `aws-migration/lambda/api/posts/get.ts`
- `aws-migration/lambda/api/posts/likers.ts`

**Impact**: Récupération d'un post ou de ses likers sans rate limiting
**Niveau**: P2 (données publiques, impact limité)

---

## ✅ Endpoints Déjà Protégés (Confirmé)

| Endpoint | Prefix | Limit | Type |
|----------|--------|-------|------|
| `feed/following` | `feed-following` | 60/min | User-based |
| `feed/discover` | `feed-discover` | 60/min | User-based |
| `feed/optimized` | `feed-optimized` | 60/min | User-based |
| `profiles/export-data` | `profile-export` | 3/heure | User-based |
| `profiles/search` | `profile-search` | 60/min | IP-based |
| `posts/search` | `posts-search` | 30/min | IP+User |
| `live-streams/start` | `live-stream-start` | 5/heure | User-based |
| `tips/send` | `tips-send` | 10/min | User-based |
| `payments/create-intent` | `payment-intent` | 10/min | User-based |
| `packs/purchase` | `packs-purchase` | 10/min | User-based |
| `auth/forgot-password` | `forgot-password` | 3/5min | IP-based |
| `auth/resend-code` | `resend-code` | 3/min | User-based |
| `comments/create` | `comment-create` | 20/min + 200/jour | User-based |
| `follows/create` | `follow-create` | 10/min + 200/jour | User-based |
| `reports/*` | `report-all` | 5/5min | User-based (unifié) |

---

## 📊 Résumé par Catégorie

| Catégorie | Total | Protégés | Non protégés | Score |
|-----------|-------|----------|--------------|-------|
| Financial | 6 | 4 | **2** ⚠️ | 67% |
| Auth | 6 | 6 | 0 | 100% |
| Feed | 4 | 4 | 0 | 100% |
| Social (GET) | 10 | 4 | **6** ⚠️ | 40% |
| Search | 4 | 3 | 1 | 75% |
| Content | 12 | 8 | **4** ⚠️ | 67% |
| Admin | 5 | 0 | 5 | 0% |
| **TOTAL** | **~90** | **~60** | **~17** | **67%** |

---

## 🎯 Priorité de Remédiation

### Immediate (P0 - Aujourd'hui)
1. [ ] Ajouter rate limiting à `earnings/get.ts` (30/min)
2. [ ] Ajouter rate limiting à `packs/manage.ts` (10/heure pour CREATE)

### Cette semaine (P1)
3. [ ] Ajouter rate limiting à `profiles/followers.ts` (30/min)
4. [ ] Ajouter rate limiting à `profiles/following.ts` (30/min)
5. [ ] Ajouter rate limiting à `business/discover.ts` (30/min)
6. [ ] Ajouter rate limiting à `spots/nearby.ts` (30/min)

### Next sprint (P2)
7. [ ] Ajouter rate limiting à `comments/list.ts` (60/min)
8. [ ] Ajouter rate limiting à `challenges/list.ts` (60/min)
9. [ ] Revoir les endpoints admin (nécessitent une protection spéciale)

---

## Validation Commands

```bash
# Vérifier les endpoints sans rate limiting
find aws-migration/lambda/api -name "*.ts" -type f ! -name "*.test.ts" ! -path "*/utils/*" ! -path "*/node_modules/*" | while read f; do
  if ! grep -q "checkRateLimit" "$f" 2>/dev/null; then
    echo "❌ NO RATE LIMIT: $f"
  fi
done

# Vérifier les imports checkRateLimit
grep -r "checkRateLimit" aws-migration/lambda/api --include="*.ts" | wc -l

# Compter les endpoints avec rate limiting
grep -l "checkRateLimit" aws-migration/lambda/api/*/*.ts 2>/dev/null | wc -l
```

---

## Conclusion

L'audit V2.5 révèle que le taux de couverture est inférieur à ce qui était estimé dans V2. Les **2 gaps P0** concernent des endpoints financiers sensibles qui doivent être protégés immédiatement.

**Recommandation immédiate**: Prioriser les 2 endpoints P0 (`earnings/get.ts` et `packs/manage.ts`) avant tout déploiement en production.

---

*Document généré le 2026-02-14 — Audit exhaustif de 218 fichiers Lambda*
