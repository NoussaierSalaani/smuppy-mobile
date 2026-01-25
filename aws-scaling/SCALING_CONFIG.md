# 🚀 AWS SCALING CONFIGURATION - 100K REQ/S

## 📊 Résultats Actuels

| VUs | Requests/sec | Latence Avg | Success Rate |
|-----|--------------|-------------|--------------|
| 50 | 69 req/s | 41ms | 100% |
| 500 | 10,681 req/s | 35ms | 100% |
| 2000 | 27,535 req/s | 55ms | 99.99% |

**Objectif: 100,000 req/s**

---

## 1. 🌐 API GATEWAY CONFIGURATION

### Actuel (Default)
- Throttling: 10,000 req/s (account level)
- Burst: 5,000 requests

### Cible 100k req/s
```bash
# Demander augmentation de quota AWS
aws service-quotas request-service-quota-increase \
  --service-code apigateway \
  --quota-code L-8A5B8E43 \
  --desired-value 100000

# Configurer le throttling par API
aws apigateway update-stage \
  --rest-api-id bmkd8zayee \
  --stage-name staging \
  --patch-operations \
    op=replace,path=/throttling/rateLimit,value=100000 \
    op=replace,path=/throttling/burstLimit,value=50000
```

---

## 2. ⚡ LAMBDA CONFIGURATION

### Actuel
- Concurrency: Unreserved (1000 default)
- Memory: 128MB-256MB
- Timeout: 30s

### Cible 100k req/s
```bash
# Augmenter la concurrence réservée
aws lambda put-function-concurrency \
  --function-name smuppy-api-handler \
  --reserved-concurrent-executions 10000

# Configurer Provisioned Concurrency (pour latence constante)
aws lambda put-provisioned-concurrency-config \
  --function-name smuppy-api-handler \
  --qualifier prod \
  --provisioned-concurrent-executions 1000

# Augmenter la mémoire (plus de CPU)
aws lambda update-function-configuration \
  --function-name smuppy-api-handler \
  --memory-size 1024
```

---

## 3. 🗄️ DYNAMODB CONFIGURATION

### Option A: On-Demand (Recommandé pour pics)
```bash
aws dynamodb update-table \
  --table-name smuppy-feeds-staging \
  --billing-mode PAY_PER_REQUEST
```

### Option B: Provisioned avec Auto-Scaling
```bash
# Configurer auto-scaling
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id "table/smuppy-feeds-staging" \
  --scalable-dimension "dynamodb:table:ReadCapacityUnits" \
  --min-capacity 1000 \
  --max-capacity 100000

aws application-autoscaling put-scaling-policy \
  --service-namespace dynamodb \
  --resource-id "table/smuppy-feeds-staging" \
  --scalable-dimension "dynamodb:table:ReadCapacityUnits" \
  --policy-name "ScaleOnDemand" \
  --policy-type "TargetTrackingScaling" \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "DynamoDBReadCapacityUtilization"
    },
    "ScaleOutCooldown": 60,
    "ScaleInCooldown": 60
  }'
```

---

## 4. ☁️ CLOUDFRONT CACHING

### Configurer le cache pour les endpoints GET
```bash
aws cloudfront create-cache-policy \
  --cache-policy-config '{
    "Name": "SmuppyAPICache",
    "DefaultTTL": 60,
    "MaxTTL": 300,
    "MinTTL": 1,
    "ParametersInCacheKeyAndForwardedToOrigin": {
      "EnableAcceptEncodingGzip": true,
      "EnableAcceptEncodingBrotli": true,
      "HeadersConfig": {
        "HeaderBehavior": "whitelist",
        "Headers": {
          "Items": ["Authorization"],
          "Quantity": 1
        }
      },
      "CookiesConfig": {
        "CookieBehavior": "none"
      },
      "QueryStringsConfig": {
        "QueryStringBehavior": "all"
      }
    }
  }'
```

---

## 5. 🌍 GLOBAL ACCELERATOR (Optionnel)

Pour une latence mondiale < 50ms:
```bash
aws globalaccelerator create-accelerator \
  --name smuppy-global \
  --ip-address-type IPV4 \
  --enabled
```

---

## 6. 📊 ARCHITECTURE FINALE POUR 100K REQ/S

```
                        ┌─────────────────┐
                        │  CloudFront     │ Cache GET (TTL 60s)
                        │  Global Edge    │
                        └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  API Gateway    │ 100k req/s throttle
                        │  Regional       │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
     ┌────────▼────────┐ ┌───────▼───────┐ ┌───────▼───────┐
     │  Lambda Pool 1  │ │ Lambda Pool 2 │ │ Lambda Pool 3 │
     │  3000 concur.   │ │ 3000 concur.  │ │ 4000 concur.  │
     └────────┬────────┘ └───────┬───────┘ └───────┬───────┘
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                        ┌────────▼────────┐
                        │    DynamoDB     │ On-Demand / 100k RCU
                        │    Global       │
                        └─────────────────┘
```

---

## 7. 💰 ESTIMATION COÛTS (100k req/s)

| Service | Coût mensuel estimé |
|---------|---------------------|
| API Gateway | ~$350/mois (100M requests) |
| Lambda | ~$500/mois (10k concurrency) |
| DynamoDB | ~$1000/mois (on-demand) |
| CloudFront | ~$200/mois (cache hit 80%) |
| **Total** | **~$2,050/mois** |

---

## 8. 🚀 QUICK START

```bash
# 1. Augmenter les quotas API Gateway
aws service-quotas request-service-quota-increase \
  --service-code apigateway \
  --quota-code L-8A5B8E43 \
  --desired-value 100000

# 2. Passer DynamoDB en on-demand
aws dynamodb update-table \
  --table-name smuppy-feeds-staging \
  --billing-mode PAY_PER_REQUEST

# 3. Augmenter Lambda concurrency
aws lambda put-function-concurrency \
  --function-name smuppy-api-handler \
  --reserved-concurrent-executions 10000

# 4. Vérifier
aws apigateway get-stage --rest-api-id bmkd8zayee --stage-name staging
```

---

## 9. 📈 MONITORING

```bash
# Dashboard CloudWatch pour suivre les métriques
aws cloudwatch put-dashboard \
  --dashboard-name SmuppyScaling \
  --dashboard-body file://cloudwatch-dashboard.json
```

Métriques à surveiller:
- API Gateway: 5XXError, Latency, Count
- Lambda: ConcurrentExecutions, Duration, Errors
- DynamoDB: ConsumedReadCapacityUnits, ThrottledRequests
