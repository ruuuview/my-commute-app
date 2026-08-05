const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Config plugin that patches the Podfile post_install to force `fmt`
 * and `RCT-Folly` to build with C++17 + `FMT_USE_CONSTEVAL=0`.
 *
 * Xcode 16.2+ enforces C++20 consteval more strictly, breaking the old
 * `fmt` library bundled via RN's folly. This is fixed upstream in RN 0.83+.
 *
 * This plugin survives `expo prebuild` because it re-patches on every
 * regeneration — unlike editing ios/Podfile directly.
 */
module.exports = function withFmtCpp17(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');

      const patchBlock = `
    # Xcode 16 consteval workaround for fmt
    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      content = File.read(fmt_base)
      unless content.include?('Xcode 16 workaround')
        patched = content.gsub(
          /(#\\s*define\\s+FMT_USE_CONSTEVAL)\\s+1/,
          "\\\\1 0 // Xcode 16 workaround"
        )
        File.chmod(0644, fmt_base)
        File.write(fmt_base, patched)
      end
    end`;

      if (contents.includes("Xcode 16 consteval workaround for fmt")) {
        console.log('[withFmtCpp17] Patch already applied, skipping.');
        return config;
      }

      contents = contents.replace(
        /post_install do \|installer\|/,
        `post_install do |installer|\n${patchBlock}\n`
      );

      fs.writeFileSync(podfile, contents);
      console.log('[withFmtCpp17] Applied FMT_USE_CONSTEVAL=0 patch to fmt/base.h');
      return config;
    },
  ]);
};
