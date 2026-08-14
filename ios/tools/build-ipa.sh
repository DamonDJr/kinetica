#!/bin/bash
#
# Builds an unsigned Kinetica.ipa for Sideloadly.
#
# Why unsigned: a free Apple ID can only be issued a development provisioning
# profile for a device Xcode has registered, and Xcode 13.2.1 can't talk to an
# iOS 16+ phone to register it. That's circular, so we don't try — Sideloadly
# signs the app with your Apple ID and registers the device itself. Product →
# Archive won't work here for the same reason; it insists on a valid profile.
#
#   ./tools/build-ipa.sh
#
# Run it from the `ios` directory. Result: ios/Kinetica.ipa

set -euo pipefail

cd "$(dirname "$0")/.."

SCHEME="Kinetica"
PROJECT="Kinetica.xcodeproj"
# A fixed derived-data path so the built app is somewhere predictable rather
# than under a hashed directory we'd have to go hunting for.
DERIVED="build"
APP_DIR="$DERIVED/Build/Products/Release-iphoneos/$SCHEME.app"
LOG="$DERIVED/build.log"

mkdir -p "$DERIVED"

echo "Building $SCHEME for device (unsigned)..."
if ! xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -sdk iphoneos \
    -configuration Release \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY="" \
    build > "$LOG" 2>&1; then
    echo
    echo "Build failed. Errors:"
    echo
    grep "error:" "$LOG" | sed 's|.*/ios/||' | sort -u
    echo
    echo "(full log: ios/$LOG)"
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    echo "Build reported success but $APP_DIR is missing." >&2
    exit 1
fi

echo "Packaging..."
# An .ipa is just a zip with the app inside a folder named Payload.
rm -rf "$DERIVED/Payload" "$SCHEME.ipa"
mkdir -p "$DERIVED/Payload"
cp -R "$APP_DIR" "$DERIVED/Payload/"
( cd "$DERIVED" && zip -qry "../$SCHEME.ipa" Payload )
rm -rf "$DERIVED/Payload"

echo
echo "Done: $(pwd)/$SCHEME.ipa"
echo "Size: $(du -h "$SCHEME.ipa" | cut -f1)"
echo
echo "Drop it on Sideloadly, enter your Apple ID, and install."
echo "It'll expire in 7 days — re-run this and reinstall, or use AltStore to auto-refresh."
