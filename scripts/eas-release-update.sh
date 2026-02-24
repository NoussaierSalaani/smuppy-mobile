#!/usr/bin/env bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/eas-release-update.sh \"update message\""
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
  \"GOOGLE_IOS_CLIENT_ID\",
  \"GOOGLE_ANDROID_CLIENT_ID\",
  \"GOOGLE_WEB_CLIENT_ID\"
];
const missing = required.filter((k) => !process.env[k]);
if (process.env.APP_ENV !== \"staging\") {
  console.error(\"Invalid APP_ENV for store release: \" + (process.env.APP_ENV || \"<empty>\"));
  process.exit(1);
}
if (missing.length) {
  console.error(\"Missing required vars in EAS preview environment: \" + missing.join(\", \"));
  process.exit(1);
}
console.log(\"EAS preview environment OK (staging).\");
"'

echo "Publishing OTA to branch production with EAS environment preview..."
eas update --branch production --environment preview --message "$MESSAGE"
