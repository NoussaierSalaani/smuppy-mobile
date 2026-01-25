#!/bin/bash

# ============================================
# Smuppy AWS Migration Setup Script
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     🚀 SMUPPY AWS MIGRATION SETUP 🚀         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI not found. Installing...${NC}"
    brew install awscli
else
    echo -e "${GREEN}✅ AWS CLI installed${NC}"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js $(node --version) installed${NC}"
fi

# Check AWS CDK
if ! command -v cdk &> /dev/null; then
    echo -e "${YELLOW}📦 Installing AWS CDK...${NC}"
    npm install -g aws-cdk
else
    echo -e "${GREEN}✅ AWS CDK installed${NC}"
fi

# Check AWS credentials
echo ""
echo -e "${YELLOW}🔐 Checking AWS credentials...${NC}"
if aws sts get-caller-identity &> /dev/null; then
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    REGION=$(aws configure get region || echo "not set")
    echo -e "${GREEN}✅ AWS configured${NC}"
    echo -e "   Account: ${BLUE}${ACCOUNT_ID}${NC}"
    echo -e "   Region: ${BLUE}${REGION}${NC}"
else
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo ""
    echo "Please run: aws configure"
    echo ""
    echo "You'll need:"
    echo "  - AWS Access Key ID"
    echo "  - AWS Secret Access Key"
    echo "  - Default region (recommended: eu-west-3 for Paris)"
    echo ""
    read -p "Do you want to configure AWS now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        aws configure
    else
        exit 1
    fi
fi

# Install CDK dependencies
echo ""
echo -e "${YELLOW}📦 Installing CDK dependencies...${NC}"
cd infrastructure
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"

# Bootstrap CDK (first time only)
echo ""
echo -e "${YELLOW}🏗️  Bootstrapping CDK...${NC}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)

if ! aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null 2>&1; then
    echo "Running cdk bootstrap..."
    cdk bootstrap aws://${ACCOUNT_ID}/${REGION}
else
    echo -e "${GREEN}✅ CDK already bootstrapped${NC}"
fi

# Synthesize stack
echo ""
echo -e "${YELLOW}📝 Synthesizing CloudFormation template...${NC}"
cdk synth > /dev/null
echo -e "${GREEN}✅ Template generated${NC}"

# Show what will be created
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📋 Resources that will be created:${NC}"
echo ""
echo "  • VPC with public/private subnets"
echo "  • Aurora PostgreSQL Serverless v2"
echo "  • Cognito User Pool + Identity Pool"
echo "  • API Gateway REST API"
echo "  • Lambda Functions (x12)"
echo "  • AppSync GraphQL API"
echo "  • ElastiCache Redis"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Show estimated costs
echo -e "${YELLOW}💰 Estimated monthly costs (500K users):${NC}"
echo ""
echo "  Aurora Serverless:  \$200 - \$500"
echo "  Cognito:            \$275"
echo "  Lambda:             \$50 - \$200"
echo "  API Gateway:        \$100 - \$300"
echo "  AppSync:            \$200 - \$600"
echo "  ElastiCache:        \$100 - \$200"
echo "  S3 + CloudFront:    \$200 - \$400"
echo "  ─────────────────────────────────"
echo -e "  ${GREEN}TOTAL:              \$1,125 - \$2,475/month${NC}"
echo ""

# Confirm deployment
read -p "Deploy to AWS staging environment? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${GREEN}🚀 Deploying to AWS...${NC}"
    echo ""
    cdk deploy --all -c environment=staging --require-approval never

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     ✅ DEPLOYMENT COMPLETE!                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Run the database migration script"
    echo "  2. Migrate Supabase users to Cognito"
    echo "  3. Update the React Native app with new endpoints"
    echo ""
else
    echo ""
    echo "Deployment cancelled."
    echo ""
    echo "To deploy later, run:"
    echo "  cd aws-migration/infrastructure"
    echo "  cdk deploy --all -c environment=staging"
    echo ""
fi
