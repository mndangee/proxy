#!/usr/bin/env bash
# macOS에서 Apple 개발자 등록·릴리스 DMG 없이 DataForge(proxy) 실행
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "이 스크립트는 macOS에서만 사용할 수 있습니다."
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  set +u
  . "$NVM_DIR/nvm.sh"
  nvm use
  set -u
fi

usage() {
  cat <<'EOF'
사용법:
  ./run-mac              # 소스에서 개발 모드 실행 (권장, 서명 불필요)
  ./run-mac --app        # 로컬 .app 빌드 후 실행 (서명 없음)
  npm run run:mac
  npm run run:mac:app

--app 은 dist/ 아래 proxy.app 을 서명 없이 빌드한 뒤 Gatekeeper 격리(xattr)를
제거하고 실행합니다. 팀 배포용 DMG 다운로드는 필요 없습니다.
EOF
}

find_built_app() {
  local candidates=(
    "dist/mac-arm64/proxy.app"
    "dist/mac/proxy.app"
    "dist/mac-universal/proxy.app"
  )
  local p
  for p in "${candidates[@]}"; do
    if [[ -d "$p" ]]; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

MODE="dev"
case "${1:-}" in
  "" ) MODE="dev" ;;
  --app | --build ) MODE="app" ;;
  -h | --help ) usage; exit 0 ;;
  * )
    echo "알 수 없는 옵션: $1"
    usage
    exit 1
    ;;
esac

if [[ "$MODE" == "dev" ]]; then
  echo "[run-mac] 개발 모드 — npm install 후 소스에서 바로 실행합니다 (Apple 개발자 등록 불필요)."
  echo "[run-mac] 종료: Ctrl+C"
  exec npx electron-vite dev
fi

APP_PATH=""
if APP_PATH="$(find_built_app)"; then
  echo "[run-mac] 기존 빌드 사용: $APP_PATH"
else
  echo "[run-mac] .app 이 없어 서명 없이 빌드합니다 (build:mac:unsigned)..."
  npm run build:mac:unsigned
  APP_PATH="$(find_built_app)" || true
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" ]]; then
  echo "[run-mac] dist/ 에 proxy.app 을 찾을 수 없습니다. build:mac:unsigned 로그를 확인하세요."
  exit 1
fi

echo "[run-mac] 로컬 임시 서명과 Gatekeeper 격리 속성 정리 후 실행합니다."
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_PATH"
fi
xattr -cr "$APP_PATH" 2>/dev/null || true
open "$APP_PATH"
echo "[run-mac] 실행했습니다: $APP_PATH"
