#!/bin/bash
# Smuppy Security Scan Script

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              SMUPPY SECURITY AUDIT                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

API_URL="https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging"

# 1. NPM Audit
echo "📦 [1/7] NPM Dependency Audit..."
npm audit --json 2>/dev/null | head -20
echo ""

# 2. Check for hardcoded secrets
echo "🔐 [2/7] Scanning for hardcoded secrets..."
SECRETS_FOUND=$(grep -rE "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"][a-zA-Z0-9]{20,}['\"]" --include="*.ts" --include="*.tsx" --include="*.js" src/ 2>/dev/null | grep -v "placeholder\|example\|ENV\.\|process\.env" | wc -l)
if [ "$SECRETS_FOUND" -gt 0 ]; then
  echo "⚠️  Found $SECRETS_FOUND potential hardcoded secrets"
else
  echo "✅ No hardcoded secrets found"
fi
echo ""

# 3. Check SSL/TLS
echo "🔒 [3/7] Testing SSL/TLS configuration..."
SSL_GRADE=$(curl -s "https://api.ssllabs.com/api/v3/analyze?host=bmkd8zayee.execute-api.us-east-1.amazonaws.com&fromCache=on" | grep -o '"grade":"[^"]*"' | head -1)
if [ -n "$SSL_GRADE" ]; then
  echo "   $SSL_GRADE"
else
  echo "   SSL Labs API not responding (rate limited) - Manual check needed"
fi
echo ""

# 4. Test API Security Headers
echo "🛡️  [4/7] Testing API Security Headers..."
HEADERS=$(curl -sI "$API_URL/health" 2>/dev/null)
echo "$HEADERS" | grep -iE "^(x-content-type|x-frame|x-xss|strict-transport|content-security)" || echo "   ⚠️  Some security headers missing"
echo ""

# 5. Test for common vulnerabilities
echo "🔍 [5/7] Testing common API vulnerabilities..."

# SQL Injection test
echo -n "   SQL Injection: "
SQL_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/user?id=1'OR'1'='1")
if [ "$SQL_TEST" == "400" ] || [ "$SQL_TEST" == "403" ] || [ "$SQL_TEST" == "404" ]; then
  echo "✅ Protected"
else
  echo "⚠️  Response: $SQL_TEST (verify manually)"
fi

# Path traversal test
echo -n "   Path Traversal: "
PATH_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/../../../etc/passwd")
if [ "$PATH_TEST" == "400" ] || [ "$PATH_TEST" == "403" ] || [ "$PATH_TEST" == "404" ]; then
  echo "✅ Protected"
else
  echo "⚠️  Response: $PATH_TEST (verify manually)"
fi

# XSS test
echo -n "   XSS Protection: "
XSS_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/search?q=<script>alert(1)</script>")
if [ "$XSS_TEST" == "400" ] || [ "$XSS_TEST" == "403" ] || [ "$XSS_TEST" == "404" ]; then
  echo "✅ Protected"
else
  echo "⚠️  Response: $XSS_TEST (verify manually)"
fi
echo ""

# 6. Test Authentication
echo "🔑 [6/7] Testing Authentication..."
echo -n "   Unauthenticated access blocked: "
AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/user/profile")
if [ "$AUTH_TEST" == "401" ] || [ "$AUTH_TEST" == "403" ]; then
  echo "✅ Yes ($AUTH_TEST)"
else
  echo "⚠️  Response: $AUTH_TEST"
fi
echo ""

# 7. Rate limiting test
echo "⏱️  [7/7] Testing Rate Limiting..."
echo -n "   Sending 20 rapid requests... "
RATE_RESULTS=""
for i in {1..20}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health")
  RATE_RESULTS="$RATE_RESULTS $CODE"
done
if echo "$RATE_RESULTS" | grep -q "429"; then
  echo "✅ Rate limiting active"
else
  echo "⚠️  No rate limiting detected (or limit > 20 req)"
fi
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              SECURITY SCAN COMPLETE                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
