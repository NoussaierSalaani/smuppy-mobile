#!/usr/bin/env bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/eas-production-update.sh \"update message\""
  exit 1
fi

MESSAGE="$*"

export CI=1
export EXPO_NO_DOTENV=1

echo "Validating EAS preview environment..."
eas env:exec preview 'node -e "
const required = [
  \"APP_ENV\",
  \"API_REST_ENDPOINT\",
  \"API_GRAPHQL_ENDPOINT\",
  \"COGNITO_USER_POOL_ID\",
  \"COGNITO_CLIENT_ID\",
  \"GOOGLE_IOS_CLIENT_ID\",
  \"GOOGLE_ANDROID_CLIENT_ID\",
  \"GOOGLE_WEB_CLIENT_ID\"
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(\"Missing required vars: \" + missing.join(\", \"));
  process.exit(1);
}
console.log(\"EAS environment OK for production OTA.\");
"'

echo "Publishing OTA to branch production with EAS environment preview..."
echo "NOTE: production profile currently targets STAGING infra (preview env)."
echo "      This is intentional until production infrastructure is deployed."
eas update --branch production --environment preview --message "$MESSAGE"
