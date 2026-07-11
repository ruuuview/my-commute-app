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
    installer.pods_project.targets.each do |target|
      if target.name == 'fmt' || target.name == 'RCT-Folly'
        target.build_configurations.each do |bc|
          bc.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        end
      end
    end`;

      if (contents.includes("target.name == 'fmt' || target.name == 'RCT-Folly'")) {
        console.log('[withFmtCpp17] Patch already applied, skipping.');
        return config;
      }

      contents = contents.replace(
        /post_install do \|installer\|/,
        `post_install do |installer|${patchBlock}`
      );

      fs.writeFileSync(podfile, contents);
      console.log('[withFmtCpp17] Applied C++17 + FMT_USE_CONSTEVAL=0 to fmt/RCT-Folly pods.');
      return config;
    },
  ]);
};
