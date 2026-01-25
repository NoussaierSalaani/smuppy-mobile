# 🚀 CONFIGURATION POUR 100K UTILISATEURS SIMULTANÉS

## 📊 Résultats des Tests Actuels

| Utilisateurs Simultanés | Requests/sec | Latence Avg | Success Rate |
|-------------------------|--------------|-------------|--------------|
| 50 | 69 req/s | 41ms | 100% |
| 500 | 10,681 req/s | 35ms | 100% |
| 2,000 | 27,535 req/s | 55ms | 99.99% |
| 5,000 | 18,371 req/s | 107ms | 99.61% |

**Note:** À 5000 VUs, on voit un throttling - la latence augmente et le throughput baisse.

---

## 🎯 OBJECTIF: 100,000 UTILISATEURS SIMULTANÉS

### Calcul de capacité
```
100,000 utilisateurs simultanés
× 1 requête/seconde par utilisateur (moyenne)
= 100,000 req/s requis

Avec pics d'activité (×3):
= 300,000 req/s en burst
```

---

## 1. 🌐 API GATEWAY - CONFIGURATION REQUISE

```bash
# Demander augmentation quota à AWS Support
# Quota par défaut: 10,000 req/s par région
# Quota demandé: 500,000 req/s

aws service-quotas request-service-quota-increase \
  --service-code apigateway \
  --quota-code L-8A5B8E43 \
  --desired-value 500000 \
  --region us-east-1
```

### Configuration Stage
```json
{
  "throttlingRateLimit": 100000,
  "throttlingBurstLimit": 200000,
  "cachingEnabled": true,
  "cacheTtlInSeconds": 60,
  "cacheClusterSize": "6.1"
}
```

---

## 2. ⚡ LAMBDA - CONFIGURATION REQUISE

### Concurrence requise
```
100,000 utilisateurs × 100ms latence moyenne
= 10,000 exécutions simultanées minimum
```

```bash
# Augmenter le quota de concurrence (défaut: 1000)
aws service-quotas request-service-quota-increase \
  --service-code lambda \
  --quota-code L-B99A9384 \
  --desired-value 50000

# Configurer reserved concurrency
aws lambda put-function-concurrency \
  --function-name smuppy-api-staging \
  --reserved-concurrent-executions 20000

# Provisioned concurrency pour latence stable
aws lambda put-provisioned-concurrency-config \
  --function-name smuppy-api-staging \
  --qualifier $LATEST \
  --provisioned-concurrent-executions 5000
```

### Configuration Lambda optimale
```json
{
  "memorySize": 1024,
  "timeout": 10,
  "architecture": "arm64",
  "ephemeralStorage": 512
}
```

---

## 3. 🗄️ DYNAMODB - CONFIGURATION REQUISE

### Mode On-Demand (Recommandé)
```bash
aws dynamodb update-table \
  --table-name smuppy-feeds-staging \
  --billing-mode PAY_PER_REQUEST

aws dynamodb update-table \
  --table-name smuppy-likes-staging \
  --billing-mode PAY_PER_REQUEST
```

### Avec Auto-Scaling (Alternative)
```bash
# Read Capacity: 100,000 RCU
# Write Capacity: 50,000 WCU

aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id "table/smuppy-feeds-staging" \
  --scalable-dimension "dynamodb:table:ReadCapacityUnits" \
  --min-capacity 10000 \
  --max-capacity 100000
```

### DAX (DynamoDB Accelerator) pour < 1ms latence
```bash
aws dax create-cluster \
  --cluster-name smuppy-dax \
  --node-type dax.r5.large \
  --replication-factor 3 \
  --iam-role-arn arn:aws:iam::471112656108:role/DAXRole
```

---

## 4. ☁️ CLOUDFRONT - CACHING AGRESSIF

```bash
# Créer une distribution CloudFront devant API Gateway
aws cloudfront create-distribution \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "SmuppyAPI",
        "DomainName": "bmkd8zayee.execute-api.us-east-1.amazonaws.com",
        "OriginPath": "/staging",
        "CustomOriginConfig": {
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "https-only"
        }
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "SmuppyAPI",
      "ViewerProtocolPolicy": "https-only",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "Compress": true
    },
    "PriceClass": "PriceClass_All",
    "Enabled": true
  }'
```

---

## 5. 🌍 ARCHITECTURE MULTI-RÉGION

Pour 100k utilisateurs globaux:

```
                    ┌─────────────────┐
                    │  Route 53       │
                    │  Latency-Based  │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼───────┐
│   US-EAST-1   │   │   EU-WEST-1   │   │  AP-SOUTH-1   │
│   33k users   │   │   33k users   │   │   33k users   │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ API Gateway   │   │ API Gateway   │   │ API Gateway   │
│ Lambda 10k    │   │ Lambda 10k    │   │ Lambda 10k    │
│ DynamoDB      │   │ DynamoDB      │   │ DynamoDB      │
│ Global Table  │   │ Global Table  │   │ Global Table  │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

## 6. 💰 COÛTS ESTIMÉS (100K USERS)

| Service | Configuration | Coût/mois |
|---------|---------------|-----------|
| API Gateway | 100k req/s, 3B requests | ~$10,500 |
| Lambda | 20k concurrency, 1024MB | ~$3,000 |
| DynamoDB | On-demand, 100k RCU | ~$5,000 |
| CloudFront | 1TB, 80% cache | ~$500 |
| DAX | 3 nodes r5.large | ~$1,200 |
| Route 53 | Multi-region | ~$100 |
| **TOTAL** | | **~$20,300/mois** |

---

## 7. 🚀 SCRIPT DE DÉPLOIEMENT

```bash
#!/bin/bash
# deploy-100k-scale.sh

echo "🚀 Scaling Smuppy for 100k users..."

# 1. DynamoDB On-Demand
echo "📦 Configuring DynamoDB..."
aws dynamodb update-table \
  --table-name smuppy-feeds-staging \
  --billing-mode PAY_PER_REQUEST

# 2. Lambda Concurrency
echo "⚡ Configuring Lambda..."
aws lambda put-function-concurrency \
  --function-name smuppy-api-staging \
  --reserved-concurrent-executions 20000

# 3. API Gateway Cache
echo "🌐 Configuring API Gateway..."
aws apigateway update-stage \
  --rest-api-id bmkd8zayee \
  --stage-name staging \
  --patch-operations \
    op=replace,path=/cacheClusterEnabled,value=true \
    op=replace,path=/cacheClusterSize,value=6.1

echo "✅ Scaling complete!"
```

---

## 8. 📊 MONITORING DASHBOARD

```bash
# Créer alarmes CloudWatch
aws cloudwatch put-metric-alarm \
  --alarm-name "API-High-Latency" \
  --metric-name Latency \
  --namespace AWS/ApiGateway \
  --statistic Average \
  --period 60 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 3 \
  --alarm-actions arn:aws:sns:us-east-1:471112656108:alerts

aws cloudwatch put-metric-alarm \
  --alarm-name "Lambda-High-Concurrency" \
  --metric-name ConcurrentExecutions \
  --namespace AWS/Lambda \
  --statistic Maximum \
  --period 60 \
  --threshold 18000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --alarm-actions arn:aws:sns:us-east-1:471112656108:alerts
```

---

## 9. ✅ CHECKLIST PRÉ-PRODUCTION

- [ ] Demander augmentation quota API Gateway (500k req/s)
- [ ] Demander augmentation quota Lambda (50k concurrency)
- [ ] Activer DynamoDB On-Demand
- [ ] Configurer DAX cluster
- [ ] Déployer CloudFront distribution
- [ ] Configurer Route 53 multi-région
- [ ] Créer alarmes CloudWatch
- [ ] Test de charge 100k avec k6 Cloud

---

## 10. 🧪 TEST DISTRIBUÉ (k6 Cloud)

Pour tester 100k utilisateurs réels:
```bash
# Utiliser k6 Cloud pour test distribué
k6 cloud tests/mega-stress-test.js \
  --vus 100000 \
  --duration 5m
```

Ou avec plusieurs machines:
```bash
# Machine 1
k6 run --vus 25000 tests/mega-stress-test.js

# Machine 2
k6 run --vus 25000 tests/mega-stress-test.js

# Machine 3
k6 run --vus 25000 tests/mega-stress-test.js

# Machine 4
k6 run --vus 25000 tests/mega-stress-test.js
```
