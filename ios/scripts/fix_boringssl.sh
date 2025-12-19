#!/bin/bash
echo "🔍 Searching for -G flags in BoringSSL-GRPC..."

# Find the BoringSSL-GRPC xcconfig files
find "${PODS_ROOT}" -name "*BoringSSL*.xcconfig" 2>/dev/null | while read xcconfig; do
    if grep -q "\-G" "$xcconfig"; then
        echo "🔧 Patching $xcconfig"
        sed -i '' 's/-G //g' "$xcconfig"
        sed -i '' 's/ -G//g' "$xcconfig"
    fi
done

# Patch the Pods project file directly
PODS_PROJECT="${PODS_ROOT}/../Pods.xcodeproj/project.pbxproj"
if [ -f "$PODS_PROJECT" ]; then
    if grep -q '"-G"' "$PODS_PROJECT"; then
        echo "🔧 Patching Pods.xcodeproj"
        sed -i '' 's/"-G"//g' "$PODS_PROJECT"
        sed -i '' 's/"-G",//g' "$PODS_PROJECT"
        sed -i '' 's/, "-G"//g' "$PODS_PROJECT"
    fi
fi
echo "✅ BoringSSL patch complete"
