const fs = require('fs');
const path = require('path');

const auditFile = path.join(__dirname, 'audit_results.json');
if (!fs.existsSync(auditFile)) {
  console.error("audit_results.json not found! Please run 'yarn audit --json > audit_results.json' first.");
  process.exit(1);
}

const lines = fs.readFileSync(auditFile, 'utf8').split('\n');
const vulnerabilities = [];

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const data = JSON.parse(line);
    if (data.type === 'auditAdvisory') {
      vulnerabilities.push(data.data.advisory);
    }
  } catch (_e) {
    // Ignore non-JSON lines
  }
}

if (vulnerabilities.length === 0) {
  console.log("No vulnerabilities found in audit_results.json.");
  process.exit(0);
}

console.log(`Found ${vulnerabilities.length} vulnerability records in audit_results.json.`);
const grouped = {};

for (const vuln of vulnerabilities) {
  const pkg = vuln.module_name;
  if (!grouped[pkg]) {
    grouped[pkg] = {
      severity: vuln.severity,
      title: vuln.title,
      patched_versions: vuln.patched_versions,
      vulnerable_versions: vuln.vulnerable_versions,
      paths: new Set()
    };
  }
  // Add path
  const findings = vuln.findings || [];
  for (const finding of findings) {
    for (const p of finding.paths || []) {
      grouped[pkg].paths.add(p);
    }
  }
}

console.log("\nGrouped Vulnerabilities:");
console.log("========================");

for (const [pkg, info] of Object.entries(grouped)) {
  console.log(`\nPackage: ${pkg}`);
  console.log(`  Severity: ${info.severity}`);
  console.log(`  Title: ${info.title}`);
  console.log(`  Vulnerable Versions: ${info.vulnerable_versions}`);
  console.log(`  Patched Versions: ${info.patched_versions}`);
  console.log(`  Paths (${info.paths.size}):`);
  Array.from(info.paths).slice(0, 5).forEach(p => console.log(`    - ${p}`));
  if (info.paths.size > 5) {
    console.log(`    - ... and ${info.paths.size - 5} more`);
  }
}
