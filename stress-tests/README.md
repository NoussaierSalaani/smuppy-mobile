# Smuppy API Stress Tests

Load testing suite using [k6](https://k6.io/) to validate API performance and scalability.

## Prerequisites

```bash
# Install k6 (macOS)
brew install k6

# Or download from https://k6.io/docs/getting-started/installation/
```

## Test Types

### 1. Smoke Test (Quick Health Check)
```bash
k6 run stress-tests/smoke-test.js
```
- **Duration:** ~2 minutes
- **Load:** 5 concurrent users
- **Purpose:** Verify API is responding correctly

### 2. Load Test (Normal Traffic)
```bash
k6 run stress-tests/load-test.js
```
- **Duration:** ~16 minutes
- **Load:** Up to 100 concurrent users
- **Purpose:** Test API under expected production load

### 3. Stress Test (Breaking Point)
```bash
k6 run stress-tests/stress-test.js
```
- **Duration:** ~26 minutes
- **Load:** Up to 500 concurrent users
- **Purpose:** Find the API's breaking point

### 4. Spike Test (Sudden Traffic)
```bash
k6 run stress-tests/spike-test.js
```
- **Duration:** ~6 minutes
- **Load:** 50 → 500 → 50 users (sudden spike)
- **Purpose:** Test handling of viral traffic spikes

## Performance Thresholds

| Metric | Target | Critical |
|--------|--------|----------|
| P95 Response Time | < 500ms | < 1000ms |
| P99 Response Time | < 1000ms | < 2000ms |
| Error Rate | < 1% | < 5% |
| Request Rate | > 100 req/s | > 50 req/s |

## Running Tests

### Quick validation:
```bash
k6 run stress-tests/smoke-test.js
```

### Full test suite:
```bash
# Run all tests sequentially
k6 run stress-tests/smoke-test.js && \
k6 run stress-tests/load-test.js && \
k6 run stress-tests/stress-test.js
```

### With HTML report:
```bash
k6 run --out json=stress-tests/results/results.json stress-tests/load-test.js
```

### Cloud run (k6 Cloud):
```bash
k6 cloud stress-tests/stress-test.js
```

## Results

Results are saved to `stress-tests/results/`:
- `smoke-test-summary.json`
- `load-test-summary.json`
- `stress-test-summary.json`
- `spike-test-summary.json`

## Interpreting Results

### Good Performance:
- ✅ P95 < 500ms
- ✅ Error rate < 1%
- ✅ No 5XX errors
- ✅ Consistent response times

### Warning Signs:
- ⚠️ P95 500-1000ms
- ⚠️ Error rate 1-5%
- ⚠️ Increasing latency over time
- ⚠️ 429 (rate limited) responses

### Critical Issues:
- ❌ P95 > 1000ms
- ❌ Error rate > 5%
- ❌ 5XX errors
- ❌ Timeouts

## Capacity Estimates

Based on stress test results, estimate production capacity:

| Metric | Formula |
|--------|---------|
| Concurrent Users | `req/s × avg_response_time` |
| Peak DAU | `concurrent_users × 10` |
| Monthly Active Users | `peak_dau × 3` |

## Scaling Recommendations

If tests fail at high load:

1. **Increase Lambda Concurrency**
   ```
   AWS Console → Lambda → Configuration → Concurrency
   ```

2. **Enable Provisioned Concurrency**
   ```
   AWS Console → Lambda → Versions → Provisioned Concurrency
   ```

3. **Scale Aurora Database**
   ```
   AWS Console → RDS → Modify → Max ACU: 256
   ```

4. **Optimize Redis Caching**
   - Increase cache TTL for static data
   - Add more cache keys for common queries
