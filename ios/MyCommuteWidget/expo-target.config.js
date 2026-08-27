// @bacons/apple-targets config for the My Commute Live Activity Widget.
// This generates an Xcode Widget Extension target at prebuild time.
//
// The target reads its data from the App Group shared container
// (group.com.mycommute.app) which the RN bridge writes a JSON mirror into.
// Single source of truth = the Tier 2 cache (RN writer). This widget only reads.
//
// ESM/TS not supported here — keep this CommonJS.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",

  // Product / target name. Becomes the WidgetKit `Kind` + bundle suffix.
  name: "MyCommuteWidget",
  displayName: "My Commute Live",

  // App Group is auto-mirrored from root app.json entitlements, but we
  // declare it explicitly so the widget target is entitled to read the
  // container the bridge writes into.
  entitlements: {
    "com.apple.security.application-groups": ["group.com.mycommute.app"],
  },

  // WidgetKit needs WidgetKit + SwiftUI + ActivityKit is part of UIKit/ActivityKit
  // (auto-linked). SwiftUI is required.
  frameworks: ["SwiftUI", "WidgetKit", "ActivityKit"],

  // Minimum iOS for Live Activities (ActivityKit) is 16.2.
  deploymentTarget: "16.2",

  // Target bundle id appended to the main app's bundle id.
  bundleIdentifier: ".MyCommuteWidget",
};
