const fs = require('fs');
const s = fs.readFileSync(process.argv[2], 'utf8');
const names = process.argv.slice(3);
for (const n of names) {
  const re = new RegExp('\\b' + n.replace(/[.$]/g, '\\$&') + '\\b', 'g');
  const count = (s.match(re) || []).length;
  console.log(String(count).padStart(3), n);
}
