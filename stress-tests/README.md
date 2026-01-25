# 🏋️ Smuppy Stress Tests

Tests de charge et de performance pour l'application Smuppy.

## 📦 Installation

### 1. Installer k6

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6
```

### 2. Configurer les variables d'environnement

Le script utilise automatiquement les variables du fichier `.env` parent.

## 🚀 Lancer les Tests

### Script automatique (recommandé)

```bash
cd stress-tests

# Test rapide (smoke test)
./run-tests.sh smoke api

# Test de charge normale
./run-tests.sh load api

# Test de stress (trouver les limites)
./run-tests.sh stress api

# Test des connexions Realtime
./run-tests.sh load realtime

# Tous les tests
./run-tests.sh smoke all
```

### Commandes manuelles

```bash
# API stress test
SUPABASE_ANON_KEY=your_key TEST_TYPE=load k6 run api-stress-test.js

# Realtime stress test
SUPABASE_ANON_KEY=your_key TEST_TYPE=stress k6 run realtime-stress-test.js
```

## 📊 Types de Tests

| Type | VUs | Durée | Description |
|------|-----|-------|-------------|
| `smoke` | 5 | 30s | Vérification rapide que tout fonctionne |
| `load` | 100 | 5m | Charge normale attendue |
| `stress` | 100→1000 | 16m | Trouver le point de rupture |
| `spike` | 50→1000→50 | 5m | Pic soudain de trafic |
| `soak` | 200 | 30m | Charge soutenue (détection memory leaks) |

## 📈 Métriques Surveillées

### API Tests
- `http_req_duration` - Temps de réponse des requêtes
- `http_req_failed` - Taux d'erreur
- `feed_latency` - Latence spécifique du feed
- `profile_latency` - Latence des profils
- `errors` - Taux d'erreurs global

### Realtime Tests
- `ws_connection_errors` - Erreurs de connexion WebSocket
- `ws_message_latency` - Latence des messages
- `ws_connections` - Nombre de connexions
- `ws_messages` - Nombre de messages

## 🎯 Seuils de Performance

| Métrique | Objectif |
|----------|----------|
| Temps de réponse (p95) | < 500ms |
| Temps de réponse (p99) | < 1500ms |
| Taux d'erreur | < 5% |
| Connexions WebSocket | < 10% échecs |

## 📁 Structure des Résultats

```
stress-tests/
├── results/
│   ├── result-smoke-20260124-143022.json
│   ├── result-load-20260124-150000.json
│   └── ...
```

## 🔍 Analyser les Résultats

### Visualisation avec k6 Cloud (gratuit)

```bash
# S'inscrire sur https://app.k6.io
k6 login cloud

# Lancer avec visualisation cloud
k6 run --out cloud api-stress-test.js
```

### Visualisation locale avec Grafana

```bash
# Démarrer InfluxDB + Grafana
docker-compose up -d influxdb grafana

# Lancer les tests avec output InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 api-stress-test.js
```

## ⚠️ Avertissements

1. **Quota Supabase**: Les tests stress/spike/soak consomment beaucoup de requêtes
2. **Rate Limiting**: Supabase peut limiter les requêtes (200/sec sur Free)
3. **Coûts**: Sur un plan payant, attention aux dépassements
4. **Production**: NE JAMAIS lancer sur la base de production sans précaution

## 🛠️ Personnalisation

### Ajouter de nouveaux tests

Éditer `api-stress-test.js` et ajouter une fonction de test:

```javascript
function testMyFeature() {
  group('MyFeature', () => {
    const res = supabaseGet('/my_table?limit=10');
    check(res, {
      'status is 200': (r) => r.status === 200,
    });
  });
}
```

### Modifier les scénarios

Éditer les `scenarios` dans les fichiers de test:

```javascript
const scenarios = {
  custom: {
    stages: [
      { duration: '5m', target: 2000 },
      { duration: '10m', target: 5000 },
      { duration: '5m', target: 0 },
    ],
  },
};
```

## 📞 Support

Pour les questions ou problèmes:
- Ouvrir une issue sur le repo
- Consulter la [documentation k6](https://k6.io/docs/)
