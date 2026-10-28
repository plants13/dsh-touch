/**
 * Guard: every `ctx.<name>` service read in a Client plugin bundle must be
 * declared in that bundle's `exports.inject` array.
 *
 * The Cordis Client context throws `cannot get property "<name>" without
 * inject` for an undeclared service. That throw fails the plugin's fiber, and
 * the Web boot audit turns a failed fiber into a fatal boot failure — a blank
 * application. This check runs in milliseconds and catches it before install.
 *
 * Usage: node tools/check-inject.js [path/to/client.js]
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'plugin', 'dsh-touch', 'client.js');
const source = fs.readFileSync(target, 'utf8');

/* Read the declared inject list. */
const injectMatch = source.match(/exports\.inject\s*=\s*\[([^\]]*)\]/);
if (injectMatch === null) {
  console.error(`FAIL ${path.basename(target)}: no \`exports.inject\` declaration found.`);
  console.error('     A Client plugin that reads any ctx service must declare it, or every read throws.');
  process.exit(1);
}
const declared = injectMatch[1]
  .split(',')
  .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
  .filter((part) => part !== '');

/* Every property read off ctx, minus the framework verbs that are not services. */
const NOT_A_SERVICE = new Set(['effect', 'on', 'get', 'provide', 'inject', 'isolate', 'set']);
const reads = new Map();
const readPattern = /\bctx\.([A-Za-z_$][\w$]*)/g;
let match;
while ((match = readPattern.exec(source)) !== null) {
  const name = match[1];
  if (NOT_A_SERVICE.has(name)) continue;
  reads.set(name, (reads.get(name) || 0) + 1);
}

console.log(`bundle   : ${path.relative(process.cwd(), target)}`);
console.log(`declared : [${declared.join(', ')}]`);
console.log('reads    : ' + ([...reads.entries()].map(([k, v]) => `${k}(${v})`).join(', ') || '(none)'));

const missing = [...reads.keys()].filter((name) => !declared.includes(name));
const unused = declared.filter((name) => !reads.has(name));

if (missing.length > 0) {
  console.error('');
  console.error('FAIL undeclared service read(s): ' + missing.join(', '));
  console.error('     Add them to exports.inject, or stop reading them — each one throws at boot.');
  process.exit(1);
}
if (unused.length > 0) {
  /* A declared service with no provider leaves the fiber pending, which is also
   * a boot failure, so this is reported loudly rather than silently dropped. */
  console.error('');
  console.error('FAIL declared but never read: ' + unused.join(', '));
  console.error('     An inject entry with no provider leaves the plugin pending, which also blocks boot.');
  process.exit(1);
}

console.log('');
console.log('OK every ctx service read is declared, and every declaration is used.');
