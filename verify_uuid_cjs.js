const assert = require('assert');
try {
  console.log("Checking uuid compatibility...");
  const uuid = require('uuid');
  const id = typeof uuid === 'function' ? uuid() : uuid.v4();
  assert(typeof id === 'string' && id.length > 0);
  console.log("[PASS] CommonJS check passed! Generated UUID:", id);
} catch (err) {
  console.error("[FAIL] CommonJS check failed:", err.message);
  process.exit(1);
}
