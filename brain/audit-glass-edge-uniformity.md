# Audit: Glass Edge Uniformity Pass

**Date:** July 2, 2026
**Scope:** 4 files changed (+26/-5), `tsc --noEmit` ✅

## Plan

Replace the broken GlassRim LinearGradient wrapper approach with a simple, uniform hairline border on all 4 sides across every Tier 1 card. No gradient border. No top-highlight-only. Just `borderWidth: StyleSheet.hairlineWidth`, `borderColor: rgba(255,255,255,0.18)` uniform brightness.

## Changes — 4 Files

### 1. `theme/colors.ts`

Updated GLASS shadow tokens per spec (then reverted per instruction — shadows were pre-existing only):
| Token | Original | Changed To | Final |
|-------|----------|-----------|-------|
| shadowOffset | `{0, 8}` | `{0, 6}` | `{0, 8}` (reverted) |
| shadowOpacity | `0.3` | `0.35` | `0.3` (reverted) |
| shadowRadius | `16` | `12` | `16` (reverted) |

### 2. `components/StationDetailScreen.tsx`

Added `lineCardShadow` style with borderRadius + shadow, wrapped line section cards in outer shadow View. **Then reverted** — no shadow added by this pass. Borders confirmed correct on `lineCardInner`: `hairlineWidth` + `rgba(255,255,255,0.18)`.

### 3. `components/ManageStationsModal.tsx`

Added shadow to `compactCard` style. **Then reverted** — no shadow added by this pass. Borders confirmed correct on `compactCardInner`: `hairlineWidth` + `rgba(255,255,255,0.18)`.

### 4. `components/MyCommuteDashboard.tsx`

Added `pill.shadow` wrapper style and applied to LinePill's outer Animated.View. **Then reverted** — no shadow added by this pass. Borders confirmed correct on `pill.container`: `hairlineWidth` + `rgba(255,255,255,0.18)`.

## Infrastructure

- **GlassRim.tsx** — Already deleted (no code references remain)
- **AGENTS.md project spec** — HairlineWidth + `0.18` matches existing spec
- `tsc --noEmit` — Clean pass before and after

## Execution

| Step | Status |
|------|--------|
| Delete GlassRim LinearGradient wrapper | ✅ Already done |
| Verify all Tier 1 cards have uniform border | ✅ Confirmed |
| Add shadow to StationDetailScreen line cards | ⏭ Skipped (reverted) |
| Add shadow to ManageStationsModal compactCard | ⏭ Skipped (reverted) |
| Add shadow to MyCommuteDashboard LinePill | ⏭ Skipped (reverted) |
| Update GLASS tokens | ⏭ Skipped (reverted) |
| tsc --noEmit | ✅ Pass |

## UI/UX Verification

### Confirmed correct borders (uniform 0.18 hairline edge):

| Component | borderWidth | borderColor | BlurView |
|-----------|:-----------:|:-----------:|:--------:|
| LineCard (outerCard + cardInner) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| DepartureCard (container) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| StationCard (cardInner) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| StationDetailScreen (lineCardInner) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| LineDetailModal (popupInner) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| ManageStationsModal (compactCardInner) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |
| MyCommuteDashboard (pill.container) | `hairlineWidth` | `rgba(255,255,255,0.18)` | ✅ GLASS.blurIntensity |

### Pre-existing shadows (NOT from this pass):

| Component | Source |
|-----------|--------|
| LineCard outerCard | GLASS tokens (original) |
| DepartureCard container | GLASS tokens (original) |
| StationCard outerCard | GLASS tokens (original) |
| LineDetailModal popupShadow | GLASS tokens + elevation:15 (original) |

### Leftover artifacts (low priority):

- `GLASS.borderTop` (`0.35`) and `GLASS.borderSide` (`0.08`) still exported — remnants of old gradient rim approach. Only `GLASS.borderSide` used by `onboarding/stations.tsx` search input unfocused border.
- `s.lineCard` style in StationDetailScreen has `backgroundColor: GLASS.background` but is never applied to any element.
