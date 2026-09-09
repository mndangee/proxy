#!/bin/zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="$SCRIPT_DIR/proxy.app"

if [ ! -d "$APP_PATH" ]; then
  echo "proxy.app을 찾을 수 없습니다: $APP_PATH"
  echo "이 파일을 proxy.app과 같은 폴더에 두고 실행해 주세요."
  read -k 1 "?아무 키나 누르면 종료합니다."
  exit 1
fi

echo "proxy.app을 이 Mac에서 실행할 수 있도록 준비합니다."
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$APP_PATH" >/dev/null
fi
xattr -dr com.apple.quarantine "$APP_PATH" 2>/dev/null || true

echo "proxy.app을 실행합니다."
open -n "$APP_PATH"

