#!/usr/bin/env bash
# Creates the Google Play UPLOAD key for SG Car Buddy (once per developer) and writes
# mobile/android/keystore.properties so `npm run android:aab` can sign release bundles.
#
#   npm run android:keystore
#
# The keystore is kept OUTSIDE the repo (default ~/sgcarbuddy-keys/). Back up the .jks file and both
# passwords in a password manager. With Play App Signing, Google holds the real app-signing key; if
# this upload key is ever lost, you can ask Google to reset it from Play Console (takes a few days).
set -euo pipefail
cd "$(dirname "$0")/.."

PROPS="android/keystore.properties"
DIR="${SCB_KEY_DIR:-$HOME/sgcarbuddy-keys}"
STORE="$DIR/upload-keystore.jks"
ALIAS="upload"

if [[ -f "$PROPS" ]]; then echo "✖ $PROPS already exists. Delete it first if you really want a new key."; exit 1; fi
if [[ -f "$STORE" ]]; then echo "✖ $STORE already exists. Reuse it: create $PROPS by hand (see mobile/README.md)."; exit 1; fi

KEYTOOL="keytool"; [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/keytool" ]] && KEYTOOL="$JAVA_HOME/bin/keytool"
command -v "$KEYTOOL" >/dev/null || { echo "✖ keytool not found. Install a JDK (17+) or set JAVA_HOME."; exit 1; }

echo "Creating the SG Car Buddy upload key in $STORE"
read -r -p "Your name (for the certificate, e.g. Venkata J): " CN
read -r -s -p "Choose a keystore password (min 6 chars): " PW; echo
read -r -s -p "Repeat it: " PW2; echo
[[ "$PW" == "$PW2" ]] || { echo "✖ Passwords don't match."; exit 1; }
[[ ${#PW} -ge 6 ]] || { echo "✖ Password must be at least 6 characters."; exit 1; }

mkdir -p "$DIR"; chmod 700 "$DIR"
"$KEYTOOL" -genkeypair -v -keystore "$STORE" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PW" -keypass "$PW" -dname "CN=$CN, O=SG Car Buddy, C=SG"
chmod 600 "$STORE"

umask 077
cat > "$PROPS" <<PROPS_EOF
# Release signing for SG Car Buddy. GITIGNORED: never commit. Created by npm run android:keystore.
storeFile=$STORE
storePassword=$PW
keyAlias=$ALIAS
keyPassword=$PW
PROPS_EOF

echo
echo "✓ Upload key: $STORE"
echo "✓ Signing config: mobile/$PROPS (gitignored)"
echo "→ Back up $STORE and the password in your password manager NOW."
