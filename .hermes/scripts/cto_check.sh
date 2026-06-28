#!/usr/bin/env bash
#=============================================================================
# CTO Agent — CodeRabbit-style quality gate for "My Commute"
# Runs autonomously every hour. Zero API cost (no-LLM mode).
#=============================================================================
set -o pipefail
cd "$(dirname "$0")/../.." || exit 1

MARKER="┃"
SEP="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
RESULTS=""
FAILS=0

pass() { RESULTS+="  ✅ $1\n"; }
fail() { RESULTS+="  ❌ $1\n"; ((FAILS++)); }
info() { RESULTS+="  ┃ $1\n"; }

# ── 1. TypeScript ──────────────────────────────────────────────────────────
TSC_OUTPUT=$(npx tsc --noEmit 2>&1)
TSC_EXIT=$?
if [ $TSC_EXIT -eq 0 ]; then
  pass "TypeScript — no errors"
else
  fail "TypeScript — errors found"
  info "$(echo "$TSC_OUTPUT" | head -20 | sed 's/^/         /')"
fi

# ── 2. Lint ────────────────────────────────────────────────────────────────
LINT_OUTPUT=$(npm run lint 2>&1)
LINT_EXIT=$?
if [ $LINT_EXIT -eq 0 ]; then
  pass "Lint — no violations"
else
  fail "Lint — violations found"
  info "$(echo "$LINT_OUTPUT" | grep -E 'error|warning' | head -10 | sed 's/^/         /')"
fi

# ── 3. Known bug patterns ──────────────────────────────────────────────────
info ""
info "── Pattern scan ──"

# 3a. zIndex=0 in components (should be >=1)
if grep -rn 'zIndex:\s*0' components/ hooks/ theme/ 2>/dev/null; then
  fail "zIndex:0 found (clipping risk)"
else
  pass "No zIndex:0 issues"
fi

# 3b. onRelease prop on NestableDraggableFlatList (doesn't exist)
if grep -rn 'onRelease=' components/ 2>/dev/null | grep -v '//\|/\*'; then
  fail "onRelease prop used (not a real RN-draggable-flatlist prop)"
else
  pass "No onRelease misuse"
fi

# 3c. Bare Pressable without press animation on dashboard
BARE_PRESSABLES=$(grep -rn '<Pressable' components/MyCommuteDashboard.tsx 2>/dev/null | \
  grep -E 'onPress=|onPressIn=' | \
  grep -v 'usePressAnimation\|BouncyPressable\|pressAnim\.\|headerBtnAnim\.\|handleEdit\|handleBackdropPress\|headerBtnAnim' | \
  grep -v 'onPress={setLinesModalVisible\|onPress={setStationsModalVisible\|onPress={null\|onPress={handleBackdrop')
if [ -n "$BARE_PRESSABLES" ]; then
  fail "Bare Pressable(s) on dashboard without bounce animation"
  info "$(echo "$BARE_PRESSABLES" | sed 's/^/         /')"
else
  pass "All Pressables have bounce animations"
fi

# 3d. withSpring used for entry/transition animations (should be withTiming)
# (Skip press animations — those should bounce)
WITHSPRING_ENTRY=$(grep -rn 'withSpring' components/LineDetailModal.tsx components/StationDetailModal.tsx components/DepartureCard.tsx 2>/dev/null)
if [ -n "$WITHSPRING_ENTRY" ]; then
  fail "withSpring still used in modal entry (bouncy)"
  info "$(echo "$WITHSPRING_ENTRY" | sed 's/^/         /')"
else
  pass "No bouncy withSpring on modal entries"
fi

# 3e. Stale withSpring imports after cleanup
UNUSED_SPRING=$(grep -rn 'withSpring' components/LineDetailModal.tsx components/StationDetailModal.tsx components/DepartureCard.tsx components/MyCommuteDashboard.tsx 2>/dev/null | grep 'import')
if [ -n "$UNUSED_SPRING" ]; then
  fail "Unused withSpring import(s)"
  info "$(echo "$UNUSED_SPRING" | sed 's/^/         /')"
else
  pass "No stale withSpring imports"
fi

# ── 4. Structural health check ─────────────────────────────────────────────
info ""
info "── Structural health ──"

# Count files
COMP_COUNT=$(find components -name '*.tsx' | wc -l | xargs)
HOOK_COUNT=$(find hooks -name '*.ts' | wc -l | xargs)
info "$COMP_COUNT components, $HOOK_COUNT hooks"

# Check total lines
TOTAL_LINES=$(find components/ hooks/ -name '*.tsx' -o -name '*.ts' | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
info "$TOTAL_LINES lines of TypeScript"

# ── Report ─────────────────────────────────────────────────────────────────
echo ""
echo "$SEP"
echo "  CTO Agent — Auto-Report  $(date '+%Y-%m-%d %H:%M')"
echo "$SEP"
echo ""
echo -e "$RESULTS"
echo ""
if [ $FAILS -eq 0 ]; then
  echo "  🟢 ALL CLEAN — no issues found."
else
  echo "  🔴 $FAILS issue(s) found — review above."
fi
echo "$SEP"
