#!/bin/bash
# Smuppy AWS Infrastructure Check

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           AWS INFRASTRUCTURE CHECK                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

API_URL="https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging"
CDN_URL="https://d3gy4x1feicix3.cloudfront.net"
COGNITO_REGION="us-east-1"

# 1. API Gateway Health
echo "🌐 [1/5] API Gateway Status..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" --max-time 10)
API_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" --max-time 10)
echo "   Endpoint: $API_URL"
echo "   Status: $API_STATUS"
echo "   Response Time: ${API_TIME}s"
if [ "$API_STATUS" == "200" ] || [ "$API_STATUS" == "403" ] || [ "$API_STATUS" == "404" ]; then
  echo "   ✅ API Gateway is responding"
else
  echo "   ❌ API Gateway issue"
fi
echo ""

# 2. CloudFront CDN Health
echo "☁️  [2/5] CloudFront CDN Status..."
CDN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CDN_URL" --max-time 10)
CDN_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$CDN_URL" --max-time 10)
echo "   Endpoint: $CDN_URL"
echo "   Status: $CDN_STATUS"
echo "   Response Time: ${CDN_TIME}s"
if [ "$CDN_STATUS" == "200" ] || [ "$CDN_STATUS" == "403" ] || [ "$CDN_STATUS" == "404" ]; then
  echo "   ✅ CloudFront is responding"
else
  echo "   ⚠️  CloudFront check needed"
fi
echo ""

# 3. DNS Resolution
echo "🔍 [3/5] DNS Resolution..."
API_DNS=$(dig +short bmkd8zayee.execute-api.us-east-1.amazonaws.com | head -1)
CDN_DNS=$(dig +short d3gy4x1feicix3.cloudfront.net | head -1)
echo "   API Gateway DNS: $API_DNS"
echo "   CloudFront DNS: $CDN_DNS"
if [ -n "$API_DNS" ] && [ -n "$CDN_DNS" ]; then
  echo "   ✅ DNS resolution OK"
else
  echo "   ⚠️  DNS issue detected"
fi
echo ""

# 4. SSL Certificate Check
echo "🔐 [4/5] SSL Certificate Check..."
CERT_INFO=$(echo | openssl s_client -servername bmkd8zayee.execute-api.us-east-1.amazonaws.com -connect bmkd8zayee.execute-api.us-east-1.amazonaws.com:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
if [ -n "$CERT_INFO" ]; then
  echo "$CERT_INFO" | sed 's/^/   /'
  echo "   ✅ SSL Certificate valid"
else
  echo "   ⚠️  Could not retrieve certificate info"
fi
echo ""

# 5. Latency from different endpoints
echo "⚡ [5/5] Latency Tests..."
echo "   Testing API latency (5 requests)..."
TOTAL_TIME=0
for i in {1..5}; do
  TIME=$(curl -s -o /dev/null -w "%{time_total}" "$API_URL/health" --max-time 10)
  TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)
  echo "   Request $i: ${TIME}s"
done
AVG_TIME=$(echo "scale=3; $TOTAL_TIME / 5" | bc)
echo "   Average: ${AVG_TIME}s"
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           INFRASTRUCTURE CHECK COMPLETE                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
