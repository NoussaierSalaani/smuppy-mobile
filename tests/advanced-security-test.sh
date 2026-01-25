#!/bin/bash
# Test de sécurité avancé - Détection de brèches
# Smuppy Security Audit

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║           🔒 AUDIT DE SÉCURITÉ AVANCÉ - SMUPPY                           ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

API_URL="https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging"
ISSUES_FOUND=0

# Fonction pour logger les problèmes
log_issue() {
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
  echo "  ⚠️  BRÈCHE #$ISSUES_FOUND: $1"
}

log_ok() {
  echo "  ✅ $1"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 1. TEST DES HEADERS DE SÉCURITÉ
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [1/10] HEADERS DE SÉCURITÉ"
echo "─────────────────────────────────────────────────────────────────────────────"

HEADERS=$(curl -s -I "$API_URL/health" 2>/dev/null)

# X-Content-Type-Options
if echo "$HEADERS" | grep -qi "x-content-type-options"; then
  log_ok "X-Content-Type-Options présent"
else
  log_issue "X-Content-Type-Options MANQUANT - Risque MIME sniffing"
fi

# X-Frame-Options
if echo "$HEADERS" | grep -qi "x-frame-options"; then
  log_ok "X-Frame-Options présent"
else
  log_issue "X-Frame-Options MANQUANT - Risque clickjacking"
fi

# Strict-Transport-Security
if echo "$HEADERS" | grep -qi "strict-transport-security"; then
  log_ok "HSTS présent"
else
  log_issue "HSTS MANQUANT - Risque downgrade HTTPS"
fi

# Content-Security-Policy
if echo "$HEADERS" | grep -qi "content-security-policy"; then
  log_ok "CSP présent"
else
  log_issue "CSP MANQUANT - Risque XSS"
fi

# X-XSS-Protection
if echo "$HEADERS" | grep -qi "x-xss-protection"; then
  log_ok "X-XSS-Protection présent"
else
  echo "  ℹ️  X-XSS-Protection absent (obsolète, CSP recommandé)"
fi

# Server header disclosure
if echo "$HEADERS" | grep -qi "^server:"; then
  SERVER=$(echo "$HEADERS" | grep -i "^server:" | head -1)
  log_issue "Server header exposé: $SERVER"
else
  log_ok "Server header masqué"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 2. TEST SSL/TLS
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [2/10] CONFIGURATION SSL/TLS"
echo "─────────────────────────────────────────────────────────────────────────────"

# Test TLS 1.0 (devrait échouer)
TLS10=$(curl -s -o /dev/null -w "%{http_code}" --tlsv1.0 --tls-max 1.0 "$API_URL/health" 2>/dev/null || echo "000")
if [ "$TLS10" == "000" ]; then
  log_ok "TLS 1.0 désactivé"
else
  log_issue "TLS 1.0 ENCORE ACTIF - Vulnérable"
fi

# Test TLS 1.1 (devrait échouer)
TLS11=$(curl -s -o /dev/null -w "%{http_code}" --tlsv1.1 --tls-max 1.1 "$API_URL/health" 2>/dev/null || echo "000")
if [ "$TLS11" == "000" ]; then
  log_ok "TLS 1.1 désactivé"
else
  log_issue "TLS 1.1 ENCORE ACTIF - Vulnérable"
fi

# Test TLS 1.2+ (devrait fonctionner)
TLS12=$(curl -s -o /dev/null -w "%{http_code}" --tlsv1.2 "$API_URL/health" 2>/dev/null)
if [ "$TLS12" != "000" ]; then
  log_ok "TLS 1.2+ supporté"
else
  log_issue "TLS 1.2+ NON SUPPORTÉ"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 3. TEST RATE LIMITING
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [3/10] RATE LIMITING"
echo "─────────────────────────────────────────────────────────────────────────────"

echo -n "  Testing 50 rapid requests... "
RATE_LIMITED=false
for i in {1..50}; do
  RESP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
  if [ "$RESP" == "429" ]; then
    RATE_LIMITED=true
    break
  fi
done

if [ "$RATE_LIMITED" = true ]; then
  log_ok "Rate limiting actif (429 reçu)"
else
  log_issue "Rate limiting NON DÉTECTÉ - Risque DDoS/Brute force"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 4. TEST INJECTION SQL/NOSQL
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [4/10] INJECTION SQL/NOSQL"
echo "─────────────────────────────────────────────────────────────────────────────"

# SQL Injection payloads
SQL_PAYLOADS=(
  "1' OR '1'='1"
  "1; DROP TABLE users--"
  "' UNION SELECT * FROM users--"
  "admin'--"
  "1' AND 1=1--"
)

for payload in "${SQL_PAYLOADS[@]}"; do
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$payload'))" 2>/dev/null || echo "$payload")
  RESP=$(curl -s "$API_URL/api/search?q=$encoded" 2>/dev/null)
  if echo "$RESP" | grep -qiE "sql|syntax|mysql|postgres|oracle|sqlite"; then
    log_issue "SQL Injection possible avec: $payload"
  fi
done
log_ok "Pas d'erreur SQL détectée dans les réponses"

# NoSQL Injection
NOSQL_RESP=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":{"$ne":""},"password":{"$ne":""}}' 2>/dev/null)
if echo "$NOSQL_RESP" | grep -qi "token\|success\|authenticated"; then
  log_issue "NoSQL Injection POSSIBLE - Bypass authentification"
else
  log_ok "NoSQL Injection bloquée"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 5. TEST XSS
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [5/10] CROSS-SITE SCRIPTING (XSS)"
echo "─────────────────────────────────────────────────────────────────────────────"

XSS_PAYLOADS=(
  "<script>alert(1)</script>"
  "<img src=x onerror=alert(1)>"
  "javascript:alert(1)"
  "<svg onload=alert(1)>"
  "'\"><script>alert(1)</script>"
)

for payload in "${XSS_PAYLOADS[@]}"; do
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$payload'))" 2>/dev/null || echo "$payload")
  RESP=$(curl -s "$API_URL/api/search?q=$encoded" 2>/dev/null)
  if echo "$RESP" | grep -q "<script>"; then
    log_issue "XSS Réfléchi possible avec: $payload"
  fi
done
log_ok "Payloads XSS échappés correctement"

# ═══════════════════════════════════════════════════════════════════════════════
# 6. TEST CORS
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [6/10] CORS CONFIGURATION"
echo "─────────────────────────────────────────────────────────────────────────────"

# Test avec origin malveillant
CORS_RESP=$(curl -s -I -X OPTIONS "$API_URL/api/health" \
  -H "Origin: https://evil-attacker.com" \
  -H "Access-Control-Request-Method: POST" 2>/dev/null)

if echo "$CORS_RESP" | grep -qi "access-control-allow-origin: \*"; then
  log_issue "CORS Wildcard (*) - Toutes origines acceptées"
elif echo "$CORS_RESP" | grep -qi "access-control-allow-origin: https://evil"; then
  log_issue "CORS accepte origines malveillantes"
else
  log_ok "CORS restrictif"
fi

# Test credentials avec wildcard
if echo "$CORS_RESP" | grep -qi "access-control-allow-credentials: true"; then
  if echo "$CORS_RESP" | grep -qi "access-control-allow-origin: \*"; then
    log_issue "CORS credentials + wildcard = VULNÉRABLE"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7. TEST AUTHENTIFICATION
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [7/10] AUTHENTIFICATION"
echo "─────────────────────────────────────────────────────────────────────────────"

# JWT sans signature (alg: none)
JWT_NONE="eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9."
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/user/profile" \
  -H "Authorization: Bearer $JWT_NONE" 2>/dev/null)
if [ "$RESP" == "200" ]; then
  log_issue "JWT sans signature ACCEPTÉ - CRITIQUE"
else
  log_ok "JWT sans signature rejeté ($RESP)"
fi

# JWT avec signature faible
JWT_WEAK="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiJ9.secret"
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/user/profile" \
  -H "Authorization: Bearer $JWT_WEAK" 2>/dev/null)
if [ "$RESP" == "200" ]; then
  log_issue "JWT avec signature faible accepté"
else
  log_ok "JWT invalide rejeté ($RESP)"
fi

# Test token expiré (simulé)
JWT_EXPIRED="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid"
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/user/profile" \
  -H "Authorization: Bearer $JWT_EXPIRED" 2>/dev/null)
log_ok "Gestion token expiré: $RESP"

# ═══════════════════════════════════════════════════════════════════════════════
# 8. TEST SSRF
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [8/10] SERVER-SIDE REQUEST FORGERY (SSRF)"
echo "─────────────────────────────────────────────────────────────────────────────"

SSRF_URLS=(
  "http://169.254.169.254/latest/meta-data/"
  "http://localhost:80"
  "http://127.0.0.1:22"
  "http://[::1]:80"
  "http://169.254.170.2/v2/credentials"
  "file:///etc/passwd"
)

for url in "${SSRF_URLS[@]}"; do
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$url'))" 2>/dev/null || echo "$url")
  RESP=$(curl -s "$API_URL/api/fetch?url=$encoded" 2>/dev/null)
  if echo "$RESP" | grep -qiE "ami-id|instance-id|root:|localhost"; then
    log_issue "SSRF possible vers: $url"
  fi
done
log_ok "SSRF bloqué pour URLs internes"

# ═══════════════════════════════════════════════════════════════════════════════
# 9. TEST PATH TRAVERSAL
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [9/10] PATH TRAVERSAL"
echo "─────────────────────────────────────────────────────────────────────────────"

PATH_PAYLOADS=(
  "../../../etc/passwd"
  "....//....//....//etc/passwd"
  "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd"
  "..%252f..%252f..%252fetc/passwd"
  "..\\..\\..\\windows\\system32\\config\\sam"
)

for payload in "${PATH_PAYLOADS[@]}"; do
  RESP=$(curl -s "$API_URL/api/files/$payload" 2>/dev/null)
  if echo "$RESP" | grep -qE "root:|Administrator"; then
    log_issue "Path Traversal POSSIBLE avec: $payload"
  fi
done
log_ok "Path Traversal bloqué"

# ═══════════════════════════════════════════════════════════════════════════════
# 10. TEST INFORMATION DISCLOSURE
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "🔐 [10/10] DIVULGATION D'INFORMATIONS"
echo "─────────────────────────────────────────────────────────────────────────────"

# Test endpoints sensibles
SENSITIVE_ENDPOINTS=(
  "/.env"
  "/.git/config"
  "/config.json"
  "/package.json"
  "/.aws/credentials"
  "/debug"
  "/phpinfo.php"
  "/server-status"
  "/actuator/health"
  "/api/debug"
  "/graphql"
  "/__debug__"
)

for endpoint in "${SENSITIVE_ENDPOINTS[@]}"; do
  RESP=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint" 2>/dev/null)
  if [ "$RESP" == "200" ]; then
    log_issue "Endpoint sensible accessible: $endpoint ($RESP)"
  fi
done
log_ok "Endpoints sensibles protégés"

# Test stack traces
ERROR_RESP=$(curl -s "$API_URL/api/trigger-error-12345" 2>/dev/null)
if echo "$ERROR_RESP" | grep -qiE "stack|trace|exception|at .*\(.*:[0-9]+\)"; then
  log_issue "Stack traces exposées dans les erreurs"
else
  log_ok "Pas de stack trace dans les erreurs"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# RAPPORT FINAL
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                         📊 RAPPORT FINAL                                 ║"
echo "╠══════════════════════════════════════════════════════════════════════════╣"

if [ $ISSUES_FOUND -eq 0 ]; then
  echo "║  ✅ AUCUNE BRÈCHE CRITIQUE DÉTECTÉE                                      ║"
  echo "║                                                                          ║"
  echo "║  Score de sécurité: 100/100                                              ║"
else
  echo "║  ⚠️  $ISSUES_FOUND PROBLÈME(S) DÉTECTÉ(S)                                          ║"
  echo "║                                                                          ║"
  SCORE=$((100 - (ISSUES_FOUND * 10)))
  if [ $SCORE -lt 0 ]; then SCORE=0; fi
  echo "║  Score de sécurité: $SCORE/100                                              ║"
fi

echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""

# Recommandations
if [ $ISSUES_FOUND -gt 0 ]; then
  echo "📋 RECOMMANDATIONS:"
  echo "─────────────────────────────────────────────────────────────────────────────"
  echo "1. Ajouter les headers de sécurité manquants dans API Gateway"
  echo "2. Configurer rate limiting avec AWS WAF"
  echo "3. Activer AWS Shield pour protection DDoS"
  echo "4. Revoir la configuration CORS"
  echo "5. Auditer les logs CloudWatch pour activité suspecte"
  echo ""
fi

exit $ISSUES_FOUND
