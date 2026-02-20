#!/bin/bash
# ============================================================
# Smuppy E2E Test Runner (Maestro)
#
# Usage:
#   ./scripts/test-e2e.sh              # Run all flows
#   ./scripts/test-e2e.sh --smoke      # Run critical/smoke tests only
#   ./scripts/test-e2e.sh --flow 02    # Run specific flow by number
#   ./scripts/test-e2e.sh --tag auth   # Run flows tagged "auth"
# ============================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

MAESTRO_DIR=".maestro/flows"
RESULTS_DIR="maestro-results/$(date +%Y%m%d-%H%M%S)"

# Check Maestro is installed
if ! command -v maestro &> /dev/null; then
    echo -e "${RED}Maestro not installed. Install with:${NC}"
    echo '  curl -Ls "https://get.maestro.mobile.dev" | bash'
    exit 1
fi

# Check simulator is running
if ! xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
    echo -e "${YELLOW}No iOS simulator running. Start one with:${NC}"
    echo "  npx expo run:ios"
    exit 1
fi

mkdir -p "$RESULTS_DIR"

echo -e "${BLUE}=== Smuppy E2E Test Suite ===${NC}"
echo -e "Results directory: ${RESULTS_DIR}"
echo ""

# Parse arguments
FLOW_FILTER=""
TAG_FILTER=""
SMOKE_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --smoke)
            SMOKE_ONLY=true
            shift
            ;;
        --flow)
            FLOW_FILTER="$2"
            shift 2
            ;;
        --tag)
            TAG_FILTER="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Determine which flows to run
if [ "$SMOKE_ONLY" = true ]; then
    echo -e "${YELLOW}Running smoke tests only (00, 02, 17)${NC}"
    FLOWS=(
        "$MAESTRO_DIR/00-app-launch.yaml"
        "$MAESTRO_DIR/02-auth-login.yaml"
        "$MAESTRO_DIR/17-full-regression.yaml"
    )
elif [ -n "$FLOW_FILTER" ]; then
    echo -e "${YELLOW}Running flow: $FLOW_FILTER${NC}"
    FLOWS=($(find "$MAESTRO_DIR" -name "${FLOW_FILTER}*.yaml" | sort))
elif [ -n "$TAG_FILTER" ]; then
    echo -e "${YELLOW}Running flows tagged: $TAG_FILTER${NC}"
    FLOWS=($(grep -rl "- $TAG_FILTER" "$MAESTRO_DIR"/*.yaml | sort))
else
    echo -e "${YELLOW}Running all flows${NC}"
    FLOWS=($(find "$MAESTRO_DIR" -name "*.yaml" | sort))
fi

echo -e "Flows to run: ${#FLOWS[@]}"
echo ""

# Run tests
PASSED=0
FAILED=0
ERRORS=()

for flow in "${FLOWS[@]}"; do
    flow_name=$(basename "$flow" .yaml)
    echo -e "${BLUE}▶ Running: ${flow_name}${NC}"

    flow_dir="$RESULTS_DIR/$flow_name"
    mkdir -p "$flow_dir"

    if maestro test "$flow" --debug-output "$flow_dir" > "$flow_dir/output.txt" 2>&1; then
        echo -e "${GREEN}  ✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}  ✗ FAILED${NC}"
        ((FAILED++))
        ERRORS+=("$flow_name")
        # Show last 5 lines of output for quick debugging
        tail -5 "$flow_dir/output.txt" 2>/dev/null | sed 's/^/    /'
    fi
done

echo ""
echo -e "${BLUE}=== Results ===${NC}"
echo -e "  Passed: ${GREEN}${PASSED}${NC}"
echo -e "  Failed: ${RED}${FAILED}${NC}"
echo -e "  Total:  $((PASSED + FAILED))"
echo ""

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo -e "${RED}Failed flows:${NC}"
    for err in "${ERRORS[@]}"; do
        echo -e "  - $err"
    done
    echo ""
fi

echo -e "Screenshots & logs: ${RESULTS_DIR}/"
echo ""

# Generate summary for Claude Code
SUMMARY_FILE="$RESULTS_DIR/summary.txt"
{
    echo "=== Smuppy Maestro E2E Test Results ==="
    echo "Date: $(date)"
    echo "Passed: $PASSED / $((PASSED + FAILED))"
    echo "Failed: $FAILED"
    echo ""

    if [ ${#ERRORS[@]} -gt 0 ]; then
        echo "=== FAILED FLOWS ==="
        for err in "${ERRORS[@]}"; do
            echo ""
            echo "--- $err ---"
            cat "$RESULTS_DIR/$err/output.txt" 2>/dev/null
        done
    fi

    echo ""
    echo "=== SCREENSHOTS ==="
    find "$RESULTS_DIR" -name "*.png" -o -name "*.jpg" | sort
} > "$SUMMARY_FILE"

echo -e "${YELLOW}To feed results to Claude Code:${NC}"
echo "  Read $SUMMARY_FILE and the screenshots in $RESULTS_DIR/"
echo ""

# Exit with error code if any test failed
[ "$FAILED" -eq 0 ] || exit 1
