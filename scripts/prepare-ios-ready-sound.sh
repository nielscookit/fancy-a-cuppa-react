#!/usr/bin/env bash
set -euo pipefail

# Run on macOS with Xcode Command Line Tools (afconvert + afinfo).
# Preserve the original Ready.mp3 for web/foreground playback.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$ROOT/public/audio/Ready.mp3"
TARGET="$ROOT/ios/App/App/Ready.caf"

if [[ ! -s "$SOURCE" ]]; then
  echo "Missing source sound: public/audio/Ready.mp3" >&2
  exit 1
fi
command -v afconvert >/dev/null || { echo "afconvert requires macOS." >&2; exit 1; }
command -v afinfo >/dev/null || { echo "afinfo requires macOS." >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 required to validate the sound." >&2; exit 1; }

# Apple's notification sound API supports IMA4 in a CAF container.
# Use the original recording: do not change playback speed or truncate it.
afconvert "$SOURCE" "$TARGET" -f caff -d ima4
test -s "$TARGET"

python3 - "$TARGET" <<'PY'
import re
import subprocess
import sys

sound = sys.argv[1]
details = subprocess.check_output(["afinfo", sound], text=True)
print(details)
match = re.search(r"estimated duration:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*sec", details, re.IGNORECASE)
if not match:
    raise SystemExit("Cannot verify Ready.caf duration: refusing to package an unchecked sound.")
seconds = float(match.group(1))
if not 0 < seconds < 30:
    raise SystemExit(f"Ready.caf duration {seconds:.3f}s is outside Apple's 0–30s alert limit.")
if "ima4" not in details.lower() and "ima" not in details.lower():
    raise SystemExit("Ready.caf does not report IMA4 compression.")
print(f"Validated iOS notification sound Ready.caf: {seconds:.3f}s (<30s).")
PY
