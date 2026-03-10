#!/usr/bin/env bash
set -euo pipefail

BUILD="1194"
BASE_URL="https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/$BUILD"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../.chromium"

case "$(uname -s)" in
  Darwin) ZIP="chromium-mac.zip" EXECUTABLE="chrome-mac/Chromium.app/Contents/MacOS/Chromium" ;;
  Linux)  ZIP="chromium-linux.zip" EXECUTABLE="chrome-linux/chrome" ;;
  *)      echo "Unsupported platform: $(uname -s)" >&2; exit 1 ;;
esac

EXECUTABLE_PATH="$OUTPUT_DIR/$EXECUTABLE"

if [ -x "$EXECUTABLE_PATH" ]; then
  echo "Chromium $BUILD already exists at $EXECUTABLE_PATH"
  exit 0
fi

URL="$BASE_URL/$ZIP"
TMP_ZIP="$(mktemp)"

echo "Downloading Chromium $BUILD from $URL..."
curl -fL --progress-bar -o "$TMP_ZIP" "$URL"

mkdir -p "$OUTPUT_DIR"
echo "Extracting to $OUTPUT_DIR..."
unzip -qo "$TMP_ZIP" -d "$OUTPUT_DIR"
rm "$TMP_ZIP"
chmod +x "$EXECUTABLE_PATH"

echo "Chromium $BUILD installed at $EXECUTABLE_PATH"
