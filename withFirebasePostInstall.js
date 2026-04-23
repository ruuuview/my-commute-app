const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withFirebasePostInstall(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const filePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = await fs.promises.readFile(filePath, 'utf-8');

      // Injects the fix directly into the Podfile's post_install hook
      const injection = `
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('RNFB')
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end
  end
\`;

      if (!contents.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        contents = contents.replace(
          /post_install do \\|installer\\|/,
          `post_install do |installer|\n\${injection}`
        );
        await fs.promises.writeFile(filePath, contents);
      }
      return config;
    },
  ]);
};
