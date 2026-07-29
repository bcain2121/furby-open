#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="https://github.com/bcain2121/furby-open.git"
INSTALL_VERSION="v0.2.0-alpha.1"
INSTALL_DIR="${FURBY_OPEN_INSTALL_DIR:-$HOME/FurbyOpen}"
LOCAL_BIN="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { say "ERROR: $*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
confirm() {
  local prompt="$1" answer
  if [[ ! -r /dev/tty ]]; then return 1; fi
  printf '%s [Y/n] ' "$prompt" >/dev/tty
  IFS= read -r answer </dev/tty || return 1
  [[ -z "$answer" || "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]
}

run_as_root() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

install_linux_packages() {
  local packages=("$@")
  if has apt-get; then
    run_as_root apt-get update
    run_as_root apt-get install -y "${packages[@]}"
  elif has dnf; then
    run_as_root dnf install -y "${packages[@]}"
  elif has pacman; then
    run_as_root pacman -Sy --needed --noconfirm "${packages[@]}"
  else
    return 1
  fi
}

node_is_compatible() {
  has node && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)" >/dev/null 2>&1
}

install_private_node() {
  has curl || fail "curl is required to download Node.js."
  local os arch sums filename version url archive expected actual install_root
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) fail "Automatic Node.js installation supports macOS and Linux only." ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) fail "Unsupported CPU architecture: $(uname -m)" ;;
  esac

  say "Downloading the official Node.js 22 archive from nodejs.org..."
  sums="$(mktemp)"
  curl -fL --proto '=https' --tlsv1.2 https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$sums"
  filename="$(awk -v suffix="-$os-$arch.tar.gz" '$2 ~ suffix "$" { print $2; exit }' "$sums")"
  [[ -n "$filename" ]] || fail "Could not find a compatible Node.js archive."
  version="${filename#node-}"; version="${version%-$os-$arch.tar.gz}"
  url="https://nodejs.org/dist/$version/$filename"
  archive="$(mktemp)"
  curl -fL --proto '=https' --tlsv1.2 "$url" -o "$archive"
  expected="$(awk -v file="$filename" '$2 == file { print $1 }' "$sums")"
  if has sha256sum; then actual="$(sha256sum "$archive" | awk '{print $1}')"; else actual="$(shasum -a 256 "$archive" | awk '{print $1}')"; fi
  [[ "$actual" == "$expected" ]] || fail "Node.js checksum verification failed."

  install_root="$HOME/.local/share/furby-open/node-$version"
  rm -rf "$install_root"
  mkdir -p "$install_root" "$LOCAL_BIN"
  tar -xzf "$archive" --strip-components=1 -C "$install_root"
  for executable in node npm npx corepack; do
    [[ -e "$install_root/bin/$executable" ]] && ln -sfn "$install_root/bin/$executable" "$LOCAL_BIN/$executable"
  done
  export PATH="$LOCAL_BIN:$PATH"
  local profile path_line
  path_line='export PATH="$HOME/.local/bin:$PATH"'
  for profile in "$HOME/.profile"; do
    grep -Fqx "$path_line" "$profile" 2>/dev/null || printf '\n# Furby Open private Node.js\n%s\n' "$path_line" >> "$profile"
  done
  if [[ "$os" == "darwin" ]]; then
    profile="$HOME/.zprofile"
    grep -Fqx "$path_line" "$profile" 2>/dev/null || printf '\n# Furby Open private Node.js\n%s\n' "$path_line" >> "$profile"
  fi
  rm -f "$archive" "$sums"
  node_is_compatible || fail "Node.js was downloaded but did not start correctly."
  say "PASS Installed private Node.js $(node --version) without administrator access."
}

ensure_git_and_curl() {
  if has git && has curl; then return; fi
  say "Git and curl are needed to download Furby Open."
  case "$(uname -s)" in
    Darwin)
      if has brew && confirm "Install missing download tools with Homebrew?"; then brew install git curl; fi
      if ! has git; then
        xcode-select --install >/dev/null 2>&1 || true
        fail "macOS opened the Command Line Tools installer. Complete it, then run this installer again."
      fi
      ;;
    Linux)
      if confirm "Install missing download tools using the system package manager?"; then
        if has apt-get; then install_linux_packages git curl ca-certificates
        elif has dnf; then install_linux_packages git curl ca-certificates
        elif has pacman; then install_linux_packages git curl ca-certificates
        else fail "No supported package manager was found. Install git and curl, then retry."
        fi
      fi
      ;;
  esac
  has git && has curl || fail "Install git and curl, then run this installer again."
}

install_media_helpers() {
  if has ffmpeg && has pdftotext; then
    say "PASS Voice and PDF helpers are available."
    return
  fi
  say "Optional helpers enable voice messages and PDF text extraction. The text assistant works without them."
  confirm "Try to install ffmpeg and Poppler now?" || return 0
  case "$(uname -s)" in
    Darwin)
      has brew || { say "WARN Homebrew is not installed; skipping optional media helpers."; return; }
      brew install ffmpeg poppler
      ;;
    Linux)
      if has apt-get; then install_linux_packages ffmpeg poppler-utils
      elif has dnf; then install_linux_packages ffmpeg poppler-utils || say "WARN ffmpeg may require an additional repository on this Linux distribution."
      elif has pacman; then install_linux_packages ffmpeg poppler
      else say "WARN No supported package manager found; skipping optional media helpers."
      fi
      ;;
  esac
}

resolve_checkout() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  if [[ -f "$script_dir/package.json" ]] && grep -q '"name": "furby-open"' "$script_dir/package.json"; then
    CHECKOUT="$script_dir"
    return
  fi
  ensure_git_and_curl
  if [[ -e "$INSTALL_DIR" && ! -d "$INSTALL_DIR/.git" ]]; then
    fail "$INSTALL_DIR already exists and is not a Furby Open Git checkout. Choose another location with FURBY_OPEN_INSTALL_DIR."
  fi
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    say "Downloading Furby Open $INSTALL_VERSION to $INSTALL_DIR..."
    git clone --branch "$INSTALL_VERSION" --depth 1 "$REPOSITORY_URL" "$INSTALL_DIR"
  else
    local existing_origin
    existing_origin="$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || true)"
    [[ "$existing_origin" == "$REPOSITORY_URL" || "$existing_origin" == "${REPOSITORY_URL%.git}" ]] \
      || fail "$INSTALL_DIR is a different Git repository. Choose another FURBY_OPEN_INSTALL_DIR."
    [[ -f "$INSTALL_DIR/package.json" ]] && grep -q '"name": "furby-open"' "$INSTALL_DIR/package.json" \
      || fail "$INSTALL_DIR does not contain a valid Furby Open checkout."
    [[ -z "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=normal)" ]] \
      || fail "$INSTALL_DIR has source changes. Preserve them and use the documented updater instead of reinstalling."
    git -C "$INSTALL_DIR" fetch --tags origin
    [[ "$(git -C "$INSTALL_DIR" rev-parse HEAD)" == "$(git -C "$INSTALL_DIR" rev-parse "$INSTALL_VERSION^{commit}")" ]] \
      || fail "$INSTALL_DIR is a different Furby Open version. Use its safe update script so private data is backed up."
    say "Resuming the existing $INSTALL_VERSION checkout at $INSTALL_DIR."
  fi
  CHECKOUT="$INSTALL_DIR"
}

main() {
  say ""
  say "========================================"
  say "       Furby Open installer"
  say "========================================"
  say "This installer keeps credentials on this computer and pauses for every private login."
  say ""

  ensure_git_and_curl
  if ! node_is_compatible; then
    say "Node.js 22.19 or newer was not found."
    confirm "Install a verified private copy of Node.js 22 for your user account?" || fail "Node.js is required. Install it from https://nodejs.org and rerun this installer."
    install_private_node
  else
    say "PASS Node.js $(node --version)"
  fi

  local checkout
  CHECKOUT=""
  resolve_checkout
  checkout="$CHECKOUT"
  cd "$checkout"
  install_media_helpers
  mkdir -p .data logs furby-open-workspace
  [[ -f .data/.gitkeep ]] || touch .data/.gitkeep
  if [[ ! -f .env ]]; then cp .env.example .env; chmod 600 .env; fi

  say "Installing locked JavaScript dependencies..."
  npm ci
  npm run build
  say "PASS Furby Open files are installed at $checkout"
  npm run setup
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
