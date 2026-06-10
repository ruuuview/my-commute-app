const fs = require('fs');
const path = require('path');

const lockfilePath = path.join(__dirname, 'package-lock.json');
if (!fs.existsSync(lockfilePath)) {
  console.error("package-lock.json not found!");
  process.exit(1);
}

const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
const packages = lockfile.packages || {};

const suspicious = [
  'uuid', 'braces', 'micromatch', 'ws', 'fast-xml-parser', 'body-parser', 'express', 
  'send', 'serve-static', 'ip', 'semver', 'tar', 'glob-parent', 'nth-check', 
  'postcss', 'minimist', 'ejson', 'qs', 'negotiator', 'axios', 'path-to-regexp',
  'cookie', 'serve-index', 'superagent', 'morgan'
];

console.log("Analyzing package-lock.json for potentially vulnerable packages...\n");
console.log("----------------------------------------------------------------");
console.log(String("Package").padEnd(30) + " | " + String("Version").padEnd(10) + " | Path");
console.log("----------------------------------------------------------------");

for (const [pkgPath, pkgInfo] of Object.entries(packages)) {
  if (!pkgPath.startsWith('node_modules/')) continue;
  const name = pkgPath.replace('node_modules/', '');
  // Extract the direct name (handles nested node_modules)
  const parts = name.split('/node_modules/');
  const leafName = parts[parts.length - 1];
  
  if (suspicious.includes(leafName)) {
    console.log(leafName.padEnd(30) + " | " + String(pkgInfo.version).padEnd(10) + " | " + pkgPath);
  }
}
