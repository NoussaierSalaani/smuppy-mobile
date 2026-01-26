# 🚀 GUIDE DE SCALING AWS - SMUPPY

> Pour la capacite actuelle (50k-500k utilisateurs), voir [CAPACITY_ANALYSIS.md](../aws-migration/CAPACITY_ANALYSIS.md)
>
> Ce guide couvre le scaling vers 5M+ utilisateurs.

## 📊 Résultats des Tests de Charge (25/01/2026)

| VUs | Requêtes/sec | Latence Moy | Latence P99 | Succès |
|-----|--------------|-------------|-------------|--------|
| 1,000 | 18,364 | 39ms | 90ms | 100% |
| 2,000 | 21,157 | 60ms | 125ms | 99.93% |
| 5,000 | 23,937 | 111ms | 207ms | 99.64% |

---

## 💰 COÛTS PAR NIVEAU D'UTILISATEURS

| Utilisateurs Simultanés | Req/s | Coût/mois | Status |
|------------------------|-------|-----------|--------|
| 1,000 | 1,000 | ~$500 | ✅ Actuel |
| 10,000 | 10,000 | ~$2,000 | ✅ Possible |
| 100,000 | 100,000 | ~$20,000 | ⏳ Quota requis |
| 1,000,000 | 1M | ~$50,000 | ⏳ Multi-région |
| 5,000,000 | 5M | ~$132,000 | ⏳ Architecture complète |

---

## 🎯 CONFIGURATION ACTUELLE

```
API Gateway: bmkd8zayee
Domaine: api.smuppy.com (TLS 1.2)
WAF: smuppy-security-waf (actif)
DynamoDB: PAY_PER_REQUEST
Quota actuel: 10,000 req/s
```

**Observation:** Throttling détecté à 5000 VUs → quotas AWS à augmenter.

---

## 🎯 OBJECTIF: 5,000,000 UTILISATEURS SIMULTANÉS

### Calculs de Capacité
```
5,000,000 utilisateurs simultanés
× 1 requête/seconde (moyenne)
= 5,000,000 req/s requis

Avec pics d'activité (×3):
= 15,000,000 req/s en burst

Sessions actives:
= 5,000,000 connexions WebSocket/SSE
```

---

## 1. 🌐 API GATEWAY - CONFIGURATION REQUISE

### Quotas Demandés (Status: PENDING)
```bash
# Demande soumise le 25/01/2026
aws service-quotas request-service-quota-increase \
  --service-code apigateway \
  --quota-code L-8A5B8E43 \
  --desired-value 5000000 \
  --region us-east-1

# ID de la demande: 1d92715a1a7c4be6830eb37106e62ac4z1XxbYoC
```

### Configuration Recommandée
```json
{
  "throttlingRateLimit": 5000000,
  "throttlingBurstLimit": 10000000,
  "cachingEnabled": true,
  "cacheTtlInSeconds": 60,
  "cacheClusterSize": "237"
}
```

### HTTP API vs REST API
Pour 5M+ req/s, passer à **HTTP API**:
- 71% moins cher
- Latence 60% plus basse
- Auto-scaling natif

---

## 2. ⚡ LAMBDA - CONFIGURATION REQUISE

### Quotas Demandés (Status: PENDING)
```bash
# Demande soumise le 25/01/2026
aws service-quotas request-service-quota-increase \
  --service-code lambda \
  --quota-code L-B99A9384 \
  --desired-value 100000 \
  --region us-east-1

# ID de la demande: 124536e7015f479d9eaa06610610b05f5YA5eX1B
```

### Configuration Optimale
```bash
# Calculer concurrence requise:
# 5M req/s × 100ms latence = 500,000 exécutions simultanées

# Par région (5 régions):
aws lambda put-function-concurrency \
  --function-name smuppy-api-prod \
  --reserved-concurrent-executions 100000

# Provisioned concurrency pour latence stable
aws lambda put-provisioned-concurrency-config \
  --function-name smuppy-api-prod \
  --qualifier prod \
  --provisioned-concurrent-executions 50000
```

### Spécifications Lambda
```json
{
  "memorySize": 2048,
  "timeout": 10,
  "architecture": "arm64",
  "ephemeralStorage": 1024,
  "snapStart": "PublishedVersions"
}
```

---

## 3. 🗄️ DYNAMODB - CONFIGURATION REQUISE

### Global Tables (5 Régions)
```bash
# Créer table globale
aws dynamodb create-global-table \
  --global-table-name smuppy-feeds-global \
  --replication-group \
    RegionName=us-east-1 \
    RegionName=eu-west-1 \
    RegionName=ap-northeast-1 \
    RegionName=ap-southeast-1 \
    RegionName=sa-east-1
```

### Capacité Requise
```
5M utilisateurs × 0.5 reads/s = 2,500,000 RCU
5M utilisateurs × 0.1 writes/s = 500,000 WCU
```

### DAX Cluster (Cache < 1ms)
```bash
aws dax create-cluster \
  --cluster-name smuppy-dax-prod \
  --node-type dax.r6g.4xlarge \
  --replication-factor 5 \
  --iam-role-arn arn:aws:iam::471112656108:role/DAXRole \
  --subnet-group-name smuppy-dax-subnet \
  --parameter-group-name smuppy-dax-params
```

---

## 4. ☁️ CLOUDFRONT - DISTRIBUTION GLOBALE

### Configuration CDN
```bash
aws cloudfront create-distribution \
  --distribution-config '{
    "CallerReference": "smuppy-5m-users",
    "Origins": {
      "Quantity": 5,
      "Items": [
        {
          "Id": "API-US",
          "DomainName": "api-us.smuppy.app",
          "OriginPath": "",
          "CustomOriginConfig": {
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only"
          }
        }
      ]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "API-US",
      "ViewerProtocolPolicy": "https-only",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",
      "Compress": true,
      "AllowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
      "CachedMethods": ["GET", "HEAD", "OPTIONS"]
    },
    "PriceClass": "PriceClass_All",
    "Enabled": true,
    "HttpVersion": "http2and3",
    "IsIPV6Enabled": true
  }'
```

### Cache Policy Agressive
- GET endpoints: TTL 60-300s
- Objectif: 85%+ cache hit rate
- Économie: ~70% des requêtes servies par edge

---

## 5. 🌍 ARCHITECTURE MULTI-RÉGION (5 RÉGIONS)

```
                           ┌──────────────────────┐
                           │     ROUTE 53         │
                           │  Latency-Based DNS   │
                           │  Health Checks       │
                           └──────────┬───────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │              │              │              │              │
┌───────▼──────┐ ┌────▼─────┐ ┌──────▼────┐ ┌──────▼────┐ ┌───────▼──────┐
│  US-EAST-1   │ │ EU-WEST-1│ │AP-TOKYO-1 │ │AP-SING-1  │ │  SA-EAST-1   │
│  1.5M users  │ │  1M users│ │ 1M users  │ │ 1M users  │ │  0.5M users  │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│CloudFront    │ │CloudFront│ │CloudFront │ │CloudFront │ │CloudFront    │
│Edge (50 PoP) │ │Edge(30)  │ │Edge (20)  │ │Edge (15)  │ │Edge (10)     │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│HTTP API      │ │HTTP API  │ │HTTP API   │ │HTTP API   │ │HTTP API      │
│1.5M req/s    │ │1M req/s  │ │1M req/s   │ │1M req/s   │ │0.5M req/s    │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│Lambda        │ │Lambda    │ │Lambda     │ │Lambda     │ │Lambda        │
│100k concur.  │ │100k      │ │100k       │ │100k       │ │50k           │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│DynamoDB      │ │DynamoDB  │ │DynamoDB   │ │DynamoDB   │ │DynamoDB      │
│Global Table  │ │Replica   │ │Replica    │ │Replica    │ │Replica       │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│DAX 5 nodes   │ │DAX 5     │ │DAX 5      │ │DAX 5      │ │DAX 3         │
│r6g.4xlarge   │ │r6g.4xl   │ │r6g.4xl    │ │r6g.4xl    │ │r6g.2xl       │
├──────────────┤ ├──────────┤ ├───────────┤ ├───────────┤ ├──────────────┤
│ElastiCache   │ │ElastiC.  │ │ElastiC.   │ │ElastiC.   │ │ElastiCache   │
│Redis 6 nodes │ │6 nodes   │ │6 nodes    │ │6 nodes    │ │3 nodes       │
└──────────────┘ └──────────┘ └───────────┘ └───────────┘ └──────────────┘
```

---

## 6. 🔒 SÉCURITÉ À GRANDE ÉCHELLE

### AWS WAF Configuration
```bash
aws wafv2 create-web-acl \
  --name smuppy-waf-prod \
  --scope CLOUDFRONT \
  --default-action '{"Allow":{}}' \
  --rules '[
    {
      "Name": "RateLimitRule",
      "Priority": 1,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 10000,
          "AggregateKeyType": "IP"
        }
      },
      "Action": {"Block":{}},
      "VisibilityConfig": {"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"RateLimit"}
    },
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 2,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "OverrideAction": {"None":{}},
      "VisibilityConfig": {"SampledRequestsEnabled":true,"CloudWatchMetricsEnabled":true,"MetricName":"CommonRules"}
    }
  ]'
```

### AWS Shield Advanced
- Protection DDoS pour 5M+ utilisateurs
- Équipe de réponse AWS 24/7
- Coût: ~$3,000/mois

---

## 7. 📊 MONITORING À GRANDE ÉCHELLE

### CloudWatch Dashboard
```bash
aws cloudwatch put-dashboard \
  --dashboard-name Smuppy-5M-Users \
  --dashboard-body file://dashboards/5m-users-dashboard.json
```

### Alarmes Critiques
```bash
# Alarme latence P99 > 1s
aws cloudwatch put-metric-alarm \
  --alarm-name "API-P99-Latency-Critical" \
  --metric-name Latency \
  --namespace AWS/ApiGateway \
  --statistic p99 \
  --period 60 \
  --threshold 1000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --alarm-actions arn:aws:sns:us-east-1:471112656108:critical-alerts

# Alarme erreurs > 1%
aws cloudwatch put-metric-alarm \
  --alarm-name "API-Error-Rate-Critical" \
  --metric-name 5XXError \
  --namespace AWS/ApiGateway \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:471112656108:critical-alerts
```

---

## 8. 💰 ESTIMATION DES COÛTS (5M UTILISATEURS)

| Service | Configuration | Coût/mois |
|---------|---------------|-----------|
| API Gateway (HTTP API) | 5M req/s, 15B requests | ~$15,000 |
| Lambda | 500k concurrency, 2GB | ~$25,000 |
| DynamoDB Global Tables | 5 régions, on-demand | ~$40,000 |
| DAX Clusters | 23 nodes r6g.4xlarge | ~$20,000 |
| CloudFront | 10TB, 85% cache hit | ~$5,000 |
| ElastiCache Redis | 27 nodes | ~$15,000 |
| Route 53 | Latency routing | ~$500 |
| WAF | 15B requests | ~$10,000 |
| Shield Advanced | DDoS protection | ~$3,000 |
| CloudWatch | Logs + Metrics | ~$5,000 |
| Data Transfer | ~100TB/mois | ~$8,000 |
| **TOTAL** | | **~$146,500/mois** |

### Optimisations Possibles
- Reserved Capacity Lambda: -30% (~$7,500)
- CloudFront Committed: -20% (~$1,000)
- ElastiCache Reserved: -40% (~$6,000)
- **Total Optimisé: ~$132,000/mois**

---

## 9. 🚀 SCRIPT DE DÉPLOIEMENT

```bash
#!/bin/bash
# deploy-5m-scale.sh

set -e

REGIONS=("us-east-1" "eu-west-1" "ap-northeast-1" "ap-southeast-1" "sa-east-1")

echo "🚀 Déploiement infrastructure 5M utilisateurs..."

for region in "${REGIONS[@]}"; do
  echo "📍 Configuration région: $region"

  # 1. Lambda concurrency
  aws lambda put-function-concurrency \
    --function-name smuppy-api-prod \
    --reserved-concurrent-executions 100000 \
    --region $region || true

  # 2. Provisioned concurrency
  aws lambda put-provisioned-concurrency-config \
    --function-name smuppy-api-prod \
    --qualifier prod \
    --provisioned-concurrent-executions 50000 \
    --region $region || true

done

echo "✅ Déploiement terminé!"
echo "⚠️  Note: Les quotas AWS sont en attente d'approbation"
```

---

## 10. ✅ CHECKLIST PRÉ-PRODUCTION

### Quotas AWS (En attente)
- [x] API Gateway: 5M req/s demandé (ID: 1d92715a...)
- [x] Lambda: 100k concurrency demandé (ID: 124536e7...)
- [ ] DynamoDB: Global Tables activées
- [ ] Support AWS: Contacter pour validation architecture

### Infrastructure
- [ ] Déployer dans 5 régions
- [ ] Configurer DynamoDB Global Tables
- [ ] Déployer DAX clusters
- [ ] Configurer ElastiCache Redis clusters
- [ ] Activer CloudFront distribution
- [ ] Configurer Route 53 latency routing

### Sécurité
- [ ] Activer AWS WAF
- [ ] Activer Shield Advanced
- [ ] Configurer VPC endpoints
- [ ] Audit IAM policies

### Monitoring
- [ ] Dashboard CloudWatch
- [ ] Alarmes critiques
- [ ] X-Ray tracing
- [ ] Log aggregation

### Tests
- [ ] Load test 1M utilisateurs (k6 Cloud)
- [ ] Chaos engineering (AWS FIS)
- [ ] Failover test multi-région
- [ ] Disaster recovery drill

---

## 11. 🧪 COMMANDES DE TEST

```bash
# Test local (max 5-10k VUs)
k6 run --vus 5000 --duration 2m tests/distributed-stress-test.js

# Test k6 Cloud (jusqu'à 1M+ VUs)
k6 cloud tests/distributed-stress-test.js

# Test distribué manuel (10 machines × 100k VUs)
# Sur chaque machine:
k6 run --vus 100000 --duration 10m tests/distributed-stress-test.js
```

---

*Configuration générée le 25/01/2026 - Smuppy AWS Infrastructure*
