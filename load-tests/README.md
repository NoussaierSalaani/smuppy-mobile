# Load Testing — Smuppy API

Uses [k6](https://k6.io) for load testing critical API endpoints.

## Install

```bash
brew install k6
```

## Run

```bash
# Against staging (requires AUTH_TOKEN for authenticated endpoints)
k6 run --env BASE_URL=https://api-staging.smuppy.com/api \
       --env AUTH_TOKEN=<cognito-id-token> \
       load-tests/k6-critical-endpoints.js

# Quick smoke test (10 VUs, 30s)
k6 run --vus 10 --duration 30s \
       --env BASE_URL=https://api-staging.smuppy.com/api \
       load-tests/k6-critical-endpoints.js
```

## Thresholds

| Metric | Target |
|--------|--------|
| p95 latency | < 200ms |
| p99 latency | < 500ms |
| Error rate | < 0.1% |

## Endpoints Tested

| Endpoint | Weight | Description |
|----------|--------|-------------|
| `GET /posts/feed` | 40% | Main feed loading |
| `POST /conversations/:id/messages` | 25% | Sending messages |
| `GET /conversations` | 15% | Conversation list |
| `GET /profiles/search` | 10% | User search |
| `POST /media/upload-url` | 5% | Presigned URL generation |
| `POST /posts` | 5% | Post creation |
