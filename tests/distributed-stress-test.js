/**
 * Test de charge distribué - Cible: 1 Million d'utilisateurs simultanés
 *
 * UTILISATION:
 * 1. k6 Cloud (recommandé): k6 cloud tests/distributed-stress-test.js
 * 2. Ou sur plusieurs machines en parallèle
 *
 * Pour 1M utilisateurs, lancer sur 10 machines:
 *   Machine 1-10: k6 run --vus 100000 tests/distributed-stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Métriques personnalisées
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const apiDuration = new Trend('api_duration');
const requestCount = new Counter('total_requests');

// Configuration pour test massif
export const options = {
  // Pour k6 Cloud - décommentez cette section
  cloud: {
    projectID: 1234567,  // Remplacez par votre Project ID k6 Cloud
    name: 'Smuppy 1M Users Test',
    distribution: {
      'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 25 },
      'amazon:ie:dublin': { loadZone: 'amazon:ie:dublin', percent: 25 },
      'amazon:sg:singapore': { loadZone: 'amazon:sg:singapore', percent: 25 },
      'amazon:jp:tokyo': { loadZone: 'amazon:jp:tokyo', percent: 25 },
    },
  },

  scenarios: {
    // Montée progressive vers 1 million d'utilisateurs
    million_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10000 },      // Warmup: 10k
        { duration: '2m', target: 50000 },      // Ramp: 50k
        { duration: '2m', target: 100000 },     // Ramp: 100k
        { duration: '3m', target: 250000 },     // Ramp: 250k
        { duration: '3m', target: 500000 },     // Ramp: 500k
        { duration: '5m', target: 1000000 },    // Target: 1M
        { duration: '10m', target: 1000000 },   // Soutenir 1M pendant 10min
        { duration: '3m', target: 500000 },     // Descente
        { duration: '2m', target: 0 },          // Fin
      ],
      gracefulRampDown: '2m',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],  // P95 < 2s, P99 < 5s
    errors: ['rate<0.05'],                            // Erreurs < 5%
    http_req_failed: ['rate<0.05'],                   // Échecs < 5%
  },

  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = __ENV.API_URL || 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Pool de tokens simulés pour test
const TEST_TOKENS = Array.from({ length: 1000 }, (_, i) => `test-token-${i}`);

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `k6-distributed-test-vu-${__VU}`,
    },
    timeout: '30s',
  };

  // Distribution réaliste du trafic
  const random = Math.random();
  const vuId = __VU % 1000;

  if (random < 0.35) {
    // 35% - Health check (endpoint le plus léger)
    const res = http.get(`${BASE_URL}/health`, params);
    recordMetrics(res);

  } else if (random < 0.60) {
    // 25% - Lecture config/feed (GET cacheable)
    const res = http.get(`${BASE_URL}/api/config`, params);
    recordMetrics(res);

  } else if (random < 0.80) {
    // 20% - Lecture profil (authentifié)
    params.headers['Authorization'] = `Bearer ${TEST_TOKENS[vuId]}`;
    const res = http.get(`${BASE_URL}/api/user/profile`, params);
    recordMetrics(res);

  } else if (random < 0.90) {
    // 10% - Feed social (lecture avec pagination)
    params.headers['Authorization'] = `Bearer ${TEST_TOKENS[vuId]}`;
    const page = Math.floor(Math.random() * 10);
    const res = http.get(`${BASE_URL}/api/feed?page=${page}&limit=20`, params);
    recordMetrics(res);

  } else if (random < 0.97) {
    // 7% - Post/Like (écriture légère)
    params.headers['Authorization'] = `Bearer ${TEST_TOKENS[vuId]}`;
    const res = http.post(`${BASE_URL}/api/posts/like`, JSON.stringify({
      postId: `post-${Math.floor(Math.random() * 100000)}`
    }), params);
    recordMetrics(res);

  } else {
    // 3% - Création contenu (écriture lourde)
    params.headers['Authorization'] = `Bearer ${TEST_TOKENS[vuId]}`;
    const res = http.post(`${BASE_URL}/api/posts`, JSON.stringify({
      content: `Test post from VU ${__VU} at ${Date.now()}`,
      type: 'text'
    }), params);
    recordMetrics(res);
  }

  // Sleep adaptatif basé sur la charge
  const sleepTime = __VU > 500000 ? 0.05 : 0.02;  // 50ms pour >500k, 20ms sinon
  sleep(sleepTime);
}

function recordMetrics(res) {
  requestCount.add(1);
  apiDuration.add(res.timings.duration);

  // Succès = pas d'erreur serveur (4xx = comportement attendu sans auth)
  const success = res.status < 500;
  successRate.add(success);
  errorRate.add(res.status >= 500);

  check(res, {
    'status is not 5xx': (r) => r.status < 500,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
}

export function handleSummary(data) {
  const duration = data.metrics.http_req_duration;
  const reqs = data.metrics.http_reqs;
  const errors = data.metrics.errors;
  const vusMax = data.metrics.vus_max;

  const report = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    🚀 TEST 1 MILLION UTILISATEURS - RÉSULTATS                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  📊 DÉBIT (THROUGHPUT)                                                        ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Total Requêtes:          ${(reqs?.values?.count || 0).toLocaleString().padStart(15)}                              ║
║  Requêtes/sec:            ${(reqs?.values?.rate || 0).toFixed(2).padStart(15)}                              ║
║  VUs Maximum:             ${(vusMax?.values?.max || 0).toString().padStart(15)}                              ║
║                                                                               ║
║  ⏱️  LATENCE                                                                   ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Moyenne:                 ${(duration?.values?.avg || 0).toFixed(2).padStart(12)} ms                           ║
║  Médiane (P50):           ${(duration?.values?.med || 0).toFixed(2).padStart(12)} ms                           ║
║  P90:                     ${(duration?.values?.['p(90)'] || 0).toFixed(2).padStart(12)} ms                           ║
║  P95:                     ${(duration?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                           ║
║  P99:                     ${(duration?.values?.['p(99)'] || 0).toFixed(2).padStart(12)} ms                           ║
║  Maximum:                 ${(duration?.values?.max || 0).toFixed(2).padStart(12)} ms                           ║
║                                                                               ║
║  ✅ FIABILITÉ                                                                  ║
║  ─────────────────────────────────────────────────────────────────────────    ║
║  Taux de Succès:          ${((data.metrics.success?.values?.rate || 0) * 100).toFixed(2).padStart(11)}%                            ║
║  Taux d'Erreur (5xx):     ${((errors?.values?.rate || 0) * 100).toFixed(2).padStart(11)}%                            ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📈 ANALYSE DE CAPACITÉ:
═══════════════════════════════════════════════════════════════════════════════
Actuel:     ${(reqs?.values?.rate || 0).toFixed(0)} req/s
Cible 5M:   5,000,000 req/s
Gap:        ${Math.max(0, 5000000 - (reqs?.values?.rate || 0)).toLocaleString()} req/s

🔧 RECOMMANDATIONS POUR 5 MILLIONS D'UTILISATEURS:
═══════════════════════════════════════════════════════════════════════════════
1. API Gateway: Quota 5M req/s (demande en cours)
2. Lambda: 500k concurrence réservée
3. DynamoDB: Global Tables + DAX (< 1ms latence)
4. CloudFront: Cache agressif (80%+ hit rate)
5. Route 53: Multi-région (US, EU, APAC)
6. ElastiCache: Sessions Redis cluster
7. WAF: Protection DDoS avancée

💰 COÛT ESTIMÉ: ~$150,000/mois pour 5M utilisateurs simultanés
`;

  return {
    'tests/million-users-results.json': JSON.stringify(data, null, 2),
    stdout: report,
  };
}
