#!/bin/bash

# ============================================
# Smuppy Stress Test Runner
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if k6 is installed
if ! command -v k6 &> /dev/null; then
    echo -e "${RED}❌ k6 is not installed!${NC}"
    echo ""
    echo "Install k6:"
    echo "  macOS:   brew install k6"
    echo "  Linux:   sudo apt install k6"
    echo "  Windows: choco install k6"
    echo ""
    echo "Or visit: https://k6.io/docs/getting-started/installation/"
    exit 1
fi

# Load environment variables
if [ -f "../.env" ]; then
    export $(cat ../.env | grep -v '^#' | xargs)
fi

# Check for Supabase key
if [ -z "$SUPABASE_ANON_KEY" ] && [ -z "$EXPO_PUBLIC_SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ SUPABASE_ANON_KEY not found!${NC}"
    echo "Set it in .env file or export it:"
    echo "  export SUPABASE_ANON_KEY=your_key_here"
    exit 1
fi

# Use the correct key
ANON_KEY="${SUPABASE_ANON_KEY:-$EXPO_PUBLIC_SUPABASE_ANON_KEY}"

# Default values
TEST_TYPE="${1:-smoke}"
TEST_FILE="${2:-api}"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       🏋️  SMUPPY STRESS TEST RUNNER  🏋️       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Show test info
echo -e "${YELLOW}📋 Test Configuration:${NC}"
echo -e "   Test Type: ${GREEN}${TEST_TYPE}${NC}"
echo -e "   Test File: ${GREEN}${TEST_FILE}${NC}"
echo ""

# Define test files
case $TEST_FILE in
    "api")
        FILE="api-stress-test.js"
        ;;
    "realtime")
        FILE="realtime-stress-test.js"
        ;;
    "all")
        echo -e "${YELLOW}Running all tests sequentially...${NC}"
        echo ""

        echo -e "${BLUE}━━━ API Tests ━━━${NC}"
        SUPABASE_ANON_KEY=$ANON_KEY TEST_TYPE=$TEST_TYPE k6 run api-stress-test.js

        echo ""
        echo -e "${BLUE}━━━ Realtime Tests ━━━${NC}"
        SUPABASE_ANON_KEY=$ANON_KEY TEST_TYPE=$TEST_TYPE k6 run realtime-stress-test.js

        exit 0
        ;;
    *)
        echo -e "${RED}Unknown test file: $TEST_FILE${NC}"
        echo "Available: api, realtime, all"
        exit 1
        ;;
esac

# Show test scenarios
echo -e "${YELLOW}📊 Available Test Types:${NC}"
echo "   smoke   - Quick verification (5 VUs, 30s)"
echo "   load    - Normal load test (100 VUs, 5m)"
echo "   stress  - Find breaking point (up to 1000 VUs)"
echo "   spike   - Sudden traffic surge"
echo "   soak    - Sustained load (200 VUs, 30m)"
echo ""

# Confirm before stress/spike/soak tests
if [[ "$TEST_TYPE" == "stress" || "$TEST_TYPE" == "spike" || "$TEST_TYPE" == "soak" ]]; then
    echo -e "${RED}⚠️  WARNING: This is a heavy test that may impact your Supabase quota!${NC}"
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
fi

# Run the test
echo -e "${GREEN}🚀 Starting test...${NC}"
echo ""

SUPABASE_ANON_KEY=$ANON_KEY TEST_TYPE=$TEST_TYPE k6 run $FILE \
    --out json=results/result-${TEST_TYPE}-$(date +%Y%m%d-%H%M%S).json

echo ""
echo -e "${GREEN}✅ Test completed!${NC}"
echo -e "Results saved to: ${BLUE}results/${NC}"
