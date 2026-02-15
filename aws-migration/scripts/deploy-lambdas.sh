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

# ============================================================
# CDK Construct Name Aliases
# Maps handler paths to CDK construct ID search keys where
# the auto-detection pattern ({Dir}{File}) doesn't match.
# ============================================================
get_alias() {
  local handler="$1"
  case "$handler" in
    # Auth — CDK uses reversed/shortened names
    auth/apple)                   echo "AppleAuth" ;;
    auth/google)                  echo "GoogleAuth" ;;
    auth/signup)                  echo "SignupAuth" ;;
    auth/check-user)              echo "CheckUser" ;;
    auth/confirm-forgot-password) echo "ConfirmForgotPassword" ;;
    auth/confirm-signup)          echo "ConfirmSignup" ;;
    auth/forgot-password)         echo "ForgotPassword" ;;
    auth/resend-code)             echo "ResendCode" ;;
    auth/validate-email)          echo "ValidateEmail" ;;
    auth/ws-token)                echo "WsToken" ;;
    # Admin — CDK uses shortened/different names
    admin/check-profiles)         echo "CheckProfiles" ;;
    admin/migrate-data)           echo "DataMigration" ;;
    admin/migrate-users)          echo "UserMigration" ;;
    admin/refresh-bot-peaks)      echo "RefreshBotPeaks" ;;
    admin/run-migration)          echo "AdminMigration" ;;
    # Payments — CDK uses singular "Payment" not "Payments"
    payments/business-checkout)   echo "BusinessCheckout" ;;
    payments/channel-subscription) echo "PaymentChannelSub" ;;
    payments/connect)             echo "PaymentConnect" ;;
    payments/create-intent)       echo "PaymentCreateIntent" ;;
    payments/identity)            echo "PaymentIdentity" ;;
    payments/payment-methods)     echo "PaymentMethods" ;;
    payments/platform-subscription) echo "PaymentPlatformSub" ;;
    payments/refunds)             echo "PaymentRefunds" ;;
    payments/subscriptions)       echo "PaymentSubscriptions" ;;
    payments/wallet)              echo "PaymentWallet" ;;
    payments/web-checkout)        echo "PaymentWebCheckout" ;;
    payments/webhook)             echo "PaymentWebhook" ;;
    # Reports — CDK drops the "report-" prefix
    reports/check-post-report)    echo "ReportsCheckPost" ;;
    reports/check-user-report)    echo "ReportsCheckUser" ;;
    reports/report-comment)       echo "ReportsComment" ;;
    reports/report-livestream)    echo "ReportsLivestream" ;;
    reports/report-message)       echo "ReportsMessage" ;;
    reports/report-peak)          echo "ReportsPeak" ;;
    reports/report-post)          echo "ReportsPost" ;;
    reports/report-user)          echo "ReportsUser" ;;
    # Peaks — cleanup uses different name
    peaks/cleanup-expired)        echo "PeaksCleanup" ;;
    # Business — some have different CDK names
    business/access-pass)         echo "BusinessValidateAccess" ;;
    business/my-subscriptions)    echo "BusinessSubscriptionMana" ;;
    business/subscription-cancel) echo "NONE" ;;
    business/subscription-manage) echo "NONE" ;;
    business/subscription-reactivate) echo "NONE" ;;
    # Notifications — preferences (both truncated to same prefix, use hash suffix)
    notifications/preferences-get)    echo "NotificationsPreferences-akIYISwYeCot" ;;
    notifications/preferences-update) echo "NotificationsPreferences-qG8nwPJqNw0e" ;;
    # Follow requests
    follow-requests/check-pending) echo "FollowRequestsCheckPendi" ;;
    # Disputes index (barrel file, not a handler)
    disputes/index)               echo "NONE" ;;
    # Events delete / Groups delete — may not exist as Lambda
    events/delete)                echo "NONE" ;;
    groups/delete)                echo "NONE" ;;
    # Moderation — may not be a Lambda
    moderation/analyze-image)     echo "NONE" ;;
    # New files not yet deployed
    profiles/export-data)         echo "NONE" ;;
    *)                            echo "" ;;
  esac
}

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
  echo "$handler" | sed 's/[/-]/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2)} 1' | tr -d ' '
}

# Find AWS Lambda function name matching a search key
find_function_name() {
  local search_key="$1"
  local matches
  matches=$(echo "$FUNCTION_LIST" | grep -i "${search_key}Function" | head -1 || true)
  if [[ -z "$matches" ]]; then
    matches=$(echo "$FUNCTION_LIST" | grep -i "${search_key}" | head -1 || true)
  fi
  echo "$matches"
}

# Resolve handler to AWS function name (alias map + auto-detection)
resolve_function_name() {
  local handler="$1"
  local alias
  alias=$(get_alias "$handler")

  # NONE = explicitly no Lambda for this handler
  if [[ "$alias" == "NONE" ]]; then
    echo ""
    return
  fi

  # If alias found, search with alias
  if [[ -n "$alias" ]]; then
    find_function_name "$alias"
    return
  fi

  # Auto-detect from handler path
  local search_key
  search_key=$(handler_to_search_key "$handler")
  find_function_name "$search_key"
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
NO_LAMBDA=0

for handler in "${HANDLERS[@]}"; do
  # Find matching Lambda function
  if [[ -n "$EXPLICIT_FUNCTION_NAME" ]]; then
    function_name="$EXPLICIT_FUNCTION_NAME"
  else
    function_name=$(resolve_function_name "$handler")
  fi

  if [[ -z "$function_name" ]]; then
    alias=$(get_alias "$handler")
    if [[ "$alias" == "NONE" ]]; then
      # Explicitly no Lambda — not a warning
      ((NO_LAMBDA++))
    else
      search_key=$(handler_to_search_key "$handler")
      warn "No matching function for: $handler (key: $search_key) — skipping"
      ((SKIPPED++))
    fi
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
[[ $NO_LAMBDA -gt 0 ]] && log "  No Lambda: $NO_LAMBDA (barrel files, local-only, or not yet created)"
[[ $SKIPPED -gt 0 ]]   && warn "  Skipped:   $SKIPPED (no matching function)"
[[ $FAILED -gt 0 ]]    && error "  Failed:    $FAILED"
log "===================================="

[[ $FAILED -gt 0 ]] && exit 1
exit 0
