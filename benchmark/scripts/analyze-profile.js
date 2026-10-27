// Sums self time from a .cpuprofile by function and by package.
import { readFileSync } from 'node:fs';

const profile = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const selfTime = new Map();
const deltas = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  selfTime.set(profile.samples[i], (selfTime.get(profile.samples[i]) ?? 0) + (deltas[i] ?? 0));
}
let total = 0;
const byFunction = new Map();
const byPackage = new Map();
for (const [id, time] of selfTime) {
  const { callFrame } = byId.get(id);
  total += time;
  const pkg =
    callFrame.url.match(
      /node_modules\/((?:@[^/]+\/)?[^/@]+)(?:@[^/]*)?\/(?!.*node_modules)/,
    )?.[1] ??
    (callFrame.url
      ? callFrame.url.split('/').slice(-1)[0]
      : `(${callFrame.functionName || 'native'})`);
  const file = callFrame.url.split('/').slice(-2).join('/');
  const fn = `${callFrame.functionName || '(anonymous)'}  ${file}:${callFrame.lineNumber + 1}`;
  byFunction.set(fn, (byFunction.get(fn) ?? 0) + time);
  byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + time);
}
const print = (title, map, limit) => {
  console.log(`\n${title}`);
  const rows = [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
  for (const [name, time] of rows)
    console.log(`  ${((time / total) * 100).toFixed(1).padStart(5)}%  ${name}`);
};
print('Self time by package', byPackage, 15);
print('Self time by function', byFunction, 30);
