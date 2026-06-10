const fs = require('fs');
const path = require('path');

const testPaths = {
  'uuid@3.4.0': './node_modules/uuid',
  'uuid@7.0.3': './node_modules/xcode/node_modules/uuid',
  'uuid@8.3.2': './node_modules/@bacons/xcode/node_modules/uuid',
  'uuid@9.0.1': './node_modules/@claude-flow/plugin-gastown-bridge/node_modules/uuid'
};

console.log("Testing CommonJS compatibility of installed uuid versions...\n");

for (const [name, relPath] of Object.entries(testPaths)) {
  const absPath = path.resolve(__dirname, relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`[-] ${name} not found at ${relPath}`);
    continue;
  }
  
  try {
    const uuidModule = require(absPath);
    console.log(`[+] Loaded ${name} successfully!`);
    console.log(`    - typeof module: ${typeof uuidModule}`);
    
    // Check if uuidModule is a function (v3 style) or has v4 property (v7+ style)
    if (typeof uuidModule === 'function') {
      console.log(`    - Calling as function: ${uuidModule()}`);
    } else if (uuidModule && typeof uuidModule.v4 === 'function') {
      console.log(`    - Calling v4(): ${uuidModule.v4()}`);
    } else {
      console.log(`    - Unknown structure:`, Object.keys(uuidModule));
    }
  } catch (e) {
    console.log(`[x] ${name} failed to load: ${e.message}`);
  }
}
