#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHISPER_DIR="$ROOT_DIR/.data/local/whisper.cpp"
MODEL="$WHISPER_DIR/models/ggml-tiny.en.bin"
BIN="$WHISPER_DIR/build/bin/whisper-cli"

mkdir -p "$ROOT_DIR/.data/local"

if [ ! -d "$WHISPER_DIR/.git" ]; then
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git "$WHISPER_DIR"
else
  echo "whisper.cpp already exists at $WHISPER_DIR"
fi

if [ ! -x "$BIN" ]; then
  cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DCMAKE_BUILD_TYPE=Release
  cmake --build "$WHISPER_DIR/build" --config Release -j "$(nproc 2>/dev/null || echo 2)"
fi

if [ ! -f "$MODEL" ]; then
  bash "$WHISPER_DIR/models/download-ggml-model.sh" tiny.en
fi

if [ -f "$WHISPER_DIR/samples/jfk.wav" ]; then
  SMOKE_OUTPUT="$(mktemp)"
  trap 'rm -f "$SMOKE_OUTPUT"' EXIT
  "$BIN" -m "$MODEL" -f "$WHISPER_DIR/samples/jfk.wav" -nt >"$SMOKE_OUTPUT"
  tail -20 "$SMOKE_OUTPUT"
fi

printf '\nLocal Whisper ready:\nWHISPER_CPP_BIN=%s\nWHISPER_CPP_MODEL=%s\n' "$BIN" "$MODEL"
