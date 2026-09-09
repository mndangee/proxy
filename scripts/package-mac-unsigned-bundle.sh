#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS 배포 묶음은 Mac에서 생성해야 합니다."
  exit 1
fi

ARCH="${1:-arm64}"
case "$ARCH" in
  arm64)
    BUILD_SCRIPT="build:mac:unsigned:arm64"
    APP_PATH="dist/mac-arm64/proxy.app"
    ;;
  x64)
    BUILD_SCRIPT="build:mac:unsigned:x64"
    APP_PATH="dist/mac/proxy.app"
    ;;
  *)
    echo "지원하지 않는 아키텍처입니다: $ARCH (arm64 또는 x64)"
    exit 1
    ;;
esac

npm run "$BUILD_SCRIPT"

if [[ ! -d "$APP_PATH" ]]; then
  echo "빌드된 앱을 찾을 수 없습니다: $APP_PATH"
  exit 1
fi

BUNDLE_NAME="proxy-mac-unsigned-$ARCH"
BUNDLE_DIR="dist/$BUNDLE_NAME"
ZIP_PATH="dist/$BUNDLE_NAME.zip"

rm -rf "$BUNDLE_DIR"
rm -f "$ZIP_PATH"
mkdir -p "$BUNDLE_DIR"

ditto "$APP_PATH" "$BUNDLE_DIR/proxy.app"
cp distribution/mac/open.mac.command "$BUNDLE_DIR/open.mac.command"
cp distribution/mac/README-MAC.txt "$BUNDLE_DIR/README-MAC.txt"
chmod +x "$BUNDLE_DIR/open.mac.command"

codesign --force --deep --sign - "$BUNDLE_DIR/proxy.app"
xattr -cr "$BUNDLE_DIR/proxy.app" 2>/dev/null || true
ditto -c -k --sequesterRsrc --keepParent "$BUNDLE_DIR" "$ZIP_PATH"

echo "배포용 ZIP을 만들었습니다: $ZIP_PATH"

