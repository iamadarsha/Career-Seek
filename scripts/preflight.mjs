/**
 * preflight.mjs
 *
 * Standalone runner for all preflight safety checks.
 * Usage: npm run preflight
 *
 * Exits 0 when all checks pass (even with warnings).
 * Exits 1 only when hard issues are found (e.g., Node too old, data dir not writable).
 *
 * This script is intentionally separate from bootstrap.mjs and launch.mjs
 * so it can be run at any time without triggering a full build or install.
 */

import { loadDotEnv } from './lib/runtime.mjs';
import { runAllPreflightChecks } from './lib/preflight-checks.mjs';

loadDotEnv();

console.log('Career Seek preflight checks');
console.log('----------------------------');

const { issues } = await runAllPreflightChecks({ silent: false, failOnIssues: false });

console.log('\n----------------------------');
if (issues.length > 0) {
  console.error(`Preflight complete: ${issues.length} issue(s) need attention (see above).`);
  console.error('Fix the issues listed above, then re-run: npm run preflight');
  process.exit(1);
} else {
  console.log('Preflight complete: system looks good. Ready to run `npm run bootstrap` or `npm run launch`.');
  process.exit(0);
}
