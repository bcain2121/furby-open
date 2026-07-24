#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
VERSION="v$(node -p "require('./package.json').version")"
OUT_DIR="${1:-release-artifacts}"

for file in install.sh install.ps1 README.md docs/INSTALLER.md; do
  grep -q "$VERSION" "$file" || { echo "FAIL $file does not reference $VERSION" >&2; exit 1; }
done

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
python3 - "$OUT_DIR" <<'PY'
from pathlib import Path
import sys
import zipfile

root = Path.cwd()
out = Path(sys.argv[1])

bundles = {
    'Furby-Open-Installer-macOS-Linux.zip': [
        ('Install-Furby-Open.command', 0o755),
        ('install.sh', 0o755),
    ],
    'Furby-Open-Installer-Windows.zip': [
        ('Install-Furby-Open.cmd', 0o644),
        ('install.ps1', 0o644),
    ],
}
for archive_name, files in bundles.items():
    with zipfile.ZipFile(out / archive_name, 'w', zipfile.ZIP_DEFLATED) as archive:
        for filename, mode in files:
            info = zipfile.ZipInfo(filename)
            info.create_system = 3
            info.external_attr = mode << 16
            archive.writestr(info, (root / filename).read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
PY

(cd "$OUT_DIR" && sha256sum *.zip > SHA256SUMS.txt)
echo "PASS Installer bundles created in $OUT_DIR for $VERSION"
