#!/usr/bin/env bash
# Runs android/gradlew with a JDK 21 or newer (Capacitor 8 compiles Java 21), even when the shell's default Java is
# older (e.g. SDKMAN or Homebrew Java 17). Picks the first JDK ≥ 21 from: $JAVA_HOME, macOS java_home,
# Android Studio's bundled JDK, SDKMAN. Usage: bash scripts/gradle.sh bundleRelease
set -euo pipefail
cd "$(dirname "$0")/../android"

major() {
  [[ -x "$1/bin/java" ]] || { echo 0; return; }
  "$1/bin/java" -version 2>&1 | awk -F'"' '/version/ { split($2, v, "."); print (v[1] == "1" ? v[2] : v[1]); exit }'
}

candidates=("${JAVA_HOME:-}")
[[ -x /usr/libexec/java_home ]] && candidates+=("$(/usr/libexec/java_home -v 21+ 2>/dev/null || true)")
candidates+=(
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  "/opt/android-studio/jbr"
)
for d in "$HOME"/.sdkman/candidates/java/2[1-9]* "$HOME"/.sdkman/candidates/java/[3-9][0-9]*; do [[ -d "$d" ]] && candidates+=("$d"); done

JDK=""
for c in "${candidates[@]}"; do
  [[ -n "$c" ]] || continue
  if (( $(major "$c") >= 21 )); then JDK="$c"; break; fi
done
if [[ -z "$JDK" ]]; then
  echo "✖ No JDK 21+ found. Install one (e.g. 'sdk install java 21-tem' or Android Studio), or set JAVA_HOME to it." >&2
  exit 1
fi

export JAVA_HOME="$JDK"
echo "Using JDK $(major "$JDK"): $JDK"
exec ./gradlew "$@"
