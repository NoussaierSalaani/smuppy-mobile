#!/bin/bash
set -e

echo "=========================================="
echo "Smuppy AWS Production Deployment"
echo "=========================================="

# Check SES domain status
echo ""
echo "Checking SES domain verification..."
SES_STATUS=$(aws sesv2 get-email-identity --email-identity smuppy.com --region us-east-1 --query 'DkimAttributes.Status' --output text 2>/dev/null || echo "NOT_CONFIGURED")

if [ "$SES_STATUS" = "SUCCESS" ]; then
    echo "✅ SES Domain verified and ready!"
else
    echo "⚠️  SES Domain status: $SES_STATUS"
    echo "   Please add DKIM DNS records and wait for propagation."
    echo ""
fi

# Install dependencies
echo ""
echo "Installing Lambda dependencies..."
cd ../lambda/api
npm install --legacy-peer-deps 2>/dev/null || npm install

# Create package-lock.json if missing
if [ ! -f package-lock.json ]; then
    npm install --package-lock-only 2>/dev/null || true
fi

# Install CDK dependencies
cd ../../infrastructure
npm install 2>/dev/null || npm install

# Build and synth
echo ""
echo "Building CDK stack..."
npx cdk synth --quiet

# Deploy
echo ""
echo "Deploying to AWS..."
npx cdk deploy --require-approval never

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
