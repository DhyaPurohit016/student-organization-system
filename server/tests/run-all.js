// Runs every smoke test in order against the running API and prints a summary.
// Usage: npm test   (start the API first with npm run dev)
const { spawnSync } = require('child_process');
const path = require('path');

// razorpay starts its own API instance + fake gateway, so it doesn't need the dev server's settings
const SUITES = ['hierarchy', 'roles', 'events', 'dues', 'shop', 'announcements', 'fundraisers', 'finance', 'razorpay'];
const results = [];

for (const name of SUITES) {
  const r = spawnSync(process.execPath, [path.join(__dirname, `${name}.smoke.js`)], { encoding: 'utf8', env: process.env });
  const out = `${r.stdout}${r.stderr}`;
  const pass = (out.match(/^PASS /gm) || []).length;
  const fail = (out.match(/^FAIL /gm) || []).length;
  results.push({ name, pass, fail, ok: r.status === 0 && fail === 0 });
  if (r.status !== 0 || fail) console.log(`\n--- ${name} ---\n${out.split('\n').filter((l) => !l.startsWith('PASS ')).join('\n')}`);
}

console.log('\nSuite           Pass  Fail');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(14)} ${String(r.pass).padStart(4)}  ${String(r.fail).padStart(4)}`);
const total = results.reduce((a, r) => a + r.pass, 0);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} suite(s) failed` : `\nAll ${total} checks passed`);
process.exit(failed.length ? 1 : 0);
