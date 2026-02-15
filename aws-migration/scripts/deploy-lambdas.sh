#!/usr/bin/env bash
# deploy-lambdas.sh — Deploy Lambda function code directly (bypasses CDK/CloudFormation)
#
# Usage:
#   ./deploy-lambdas.sh                          # Deploy ALL api handlers
#   ./deploy-lambdas.sh posts/list posts/create   # Deploy specific handlers
#   ./deploy-lambdas.sh --function-name SmuppyStack-staging-Lambd-PostsListFunction12345-abc  path/to/handler
#                                                 # Deploy to exact function name
#   ./deploy-lambdas.sh --dry-run                 # Show what would be deployed
#   ./deploy-lambdas.sh --env production           # Target production (default: staging)
#
# Requires: node, npx (esbuild), aws cli, zip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_API_DIR="$PROJECT_ROOT/lambda/api"
BUILD_DIR="$PROJECT_ROOT/.lambda-build"
REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="staging"
DRY_RUN=false
EXPLICIT_FUNCTION_NAME=""
HANDLERS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env|--environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --function-name)
      EXPLICIT_FUNCTION_NAME="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      head -12 "$0" | tail -11
      exit 0
      ;;
    *)
      HANDLERS+=("$1")
      shift
      ;;
  esac
done

STACK_PREFIX="SmuppyStack-${ENVIRONMENT}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()   { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

# Discover all handler .ts files under lambda/api/ (excludes tests, utils, shared, node_modules)
discover_handlers() {
  find "$LAMBDA_API_DIR" -name '*.ts' -type f \
    | grep -v '__tests__' \
    | grep -v 'node_modules' \
    | grep -v 'tsconfig' \
    | grep -v 'eslint' \
    | grep -v 'coverage' \
    | grep -v '/utils/' \
    | grep -v '/services/' \
    | sed "s|^$LAMBDA_API_DIR/||" \
    | sed 's/\.ts$//' \
    | sort
}

# Convert handler path to PascalCase construct ID fragment
# e.g., "posts/list" -> "PostsList", "follow-requests/list" -> "FollowRequestsList"
handler_to_search_key() {
  local handler="$1"
  # Replace / and - with spaces, capitalize each word, remove spaces
  echo "$handler" | sed 's/[/-]/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1' | tr -d ' '
}

# Find AWS Lambda function name matching a handler
find_function_name() {
  local search_key="$1"
  # Search through cached function list
  local matches
  matches=$(echo "$FUNCTION_LIST" | grep -i "${search_key}Function" | head -1 || true)
  if [[ -z "$matches" ]]; then
    # Try without "Function" suffix (some names are truncated)
    matches=$(echo "$FUNCTION_LIST" | grep -i "${search_key}" | head -1 || true)
  fi
  echo "$matches"
}

# Bundle a single handler with esbuild
bundle_handler() {
  local handler="$1"
  local entry_file="$LAMBDA_API_DIR/${handler}.ts"
  local out_dir="$BUILD_DIR/$handler"

  if [[ ! -f "$entry_file" ]]; then
    error "Handler file not found: $entry_file"
    return 1
  fi

  mkdir -p "$out_dir"

  npx esbuild "$entry_file" \
    --bundle \
    --platform=node \
    --target=node22 \
    --format=cjs \
    --outfile="$out_dir/index.js" \
    --minify \
    --sourcemap \
    '--external:@aws-sdk/*' \
    --log-level=silent

  # Create zip
  (cd "$out_dir" && zip -qr handler.zip index.js index.js.map 2>/dev/null)

  echo "$out_dir/handler.zip"
}

# Deploy a single handler to AWS Lambda
deploy_handler() {
  local handler="$1"
  local function_name="$2"
  local zip_path="$3"

  aws lambda update-function-code \
    --function-name "$function_name" \
    --zip-file "fileb://$zip_path" \
    --region "$REGION" \
    --output text \
    --query 'LastModified' 2>/dev/null
}

# ============================================================
# Main
# ============================================================

log "Lambda deploy script — environment: $ENVIRONMENT, region: $REGION"

# If no handlers specified, discover all
if [[ ${#HANDLERS[@]} -eq 0 ]]; then
  log "Discovering all handlers..."
  while IFS= read -r line; do HANDLERS+=("$line"); done < <(discover_handlers)
  log "Found ${#HANDLERS[@]} handlers"
fi

# Cache the full function list from AWS (one API call)
if [[ -n "$EXPLICIT_FUNCTION_NAME" ]]; then
  FUNCTION_LIST="$EXPLICIT_FUNCTION_NAME"
else
  log "Fetching Lambda function list from AWS..."
  FUNCTION_LIST=$(aws lambda list-functions \
    --region "$REGION" \
    --query 'Functions[*].FunctionName' \
    --output text 2>/dev/null | tr '\t' '\n' | grep "^${STACK_PREFIX}" | sort)
  fn_count=$(echo "$FUNCTION_LIST" | wc -l | tr -d ' ')
  log "Found $fn_count functions matching $STACK_PREFIX"
fi

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Deploy each handler
SUCCESS=0
FAILED=0
SKIPPED=0

for handler in "${HANDLERS[@]}"; do
  search_key=$(handler_to_search_key "$handler")

  # Find matching Lambda function
  if [[ -n "$EXPLICIT_FUNCTION_NAME" ]]; then
    function_name="$EXPLICIT_FUNCTION_NAME"
  else
    function_name=$(find_function_name "$search_key")
  fi

  if [[ -z "$function_name" ]]; then
    warn "No matching function for: $handler (key: $search_key) — skipping"
    ((SKIPPED++))
    continue
  fi

  if $DRY_RUN; then
    log "[dry-run] $handler -> $function_name"
    ((SUCCESS++))
    continue
  fi

  # Bundle
  zip_path=$(bundle_handler "$handler" 2>&1) || {
    error "Bundle failed: $handler"
    ((FAILED++))
    continue
  }

  # Deploy
  last_modified=$(deploy_handler "$handler" "$function_name" "$zip_path" 2>&1) || {
    error "Deploy failed: $handler -> $function_name"
    ((FAILED++))
    continue
  }

  log "Deployed: $handler -> $function_name (updated: $last_modified)"
  ((SUCCESS++))
done

# Cleanup build artifacts
rm -rf "$BUILD_DIR"

# Summary
echo ""
log "========== Deploy Summary =========="
log "  Deployed:  $SUCCESS"
[[ $SKIPPED -gt 0 ]] && warn "  Skipped:   $SKIPPED (no matching function)"
[[ $FAILED -gt 0 ]]  && error "  Failed:    $FAILED"
log "===================================="

[[ $FAILED -gt 0 ]] && exit 1
exit 0
