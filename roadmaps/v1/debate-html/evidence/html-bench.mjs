import { readFileSync, readdirSync } from 'node:fs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import MarkdownIt from 'markdown-it';
import { fromMarkdown } from 'talata';
const rd = '/Users/alexis/Documents/GitHub/talata/benchmark/corpus/readmes/';
const readmes = readdirSync(rd).map((f) => readFileSync(rd + f, 'utf8'));
const fs_ = [
  readFileSync('/Users/alexis/Documents/GitHub/talata/benchmark/corpus/large/node-fs.md', 'utf8'),
];
const ext = [gfm()],
  hext = [gfmHtml()],
  it = new MarkdownIt();
const P = {
  'micromark html + gfm': (d) =>
    micromark(d, { allowDangerousHtml: true, extensions: ext, htmlExtensions: hext }),
  'talata -> to-hast -> to-html': (d) =>
    toHtml(toHast(fromMarkdown(d, { gfm: true }), { allowDangerousHtml: true }), {
      allowDangerousHtml: true,
    }),
  'talata parse only': (d) => fromMarkdown(d, { gfm: true }),
  'markdown-it html': (d) => it.render(d),
};
// How often does the existing talata HTML path give the same string as micromark?
const norm = (s) => s.replace(/\n+/g, '\n').trim();
let same = 0,
  sameNorm = 0;
for (const d of readmes) {
  const a = P['micromark html + gfm'](d),
    b = P['talata -> to-hast -> to-html'](d);
  if (a === b) same++;
  if (norm(a) === norm(b)) sameNorm++;
}
console.log(
  'identical HTML: ' +
    same +
    '/' +
    readmes.length +
    ', identical ignoring blank lines: ' +
    sameNorm +
    '/' +
    readmes.length,
);
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const [label, docs] of [
  ['readmes', readmes],
  ['node fs.md', fs_],
]) {
  const t = Object.fromEntries(Object.keys(P).map((k) => [k, []]));
  for (const k in P) for (const d of docs) P[k](d);
  for (let r = 0; r < 11; r++)
    for (const k of Object.keys(P).sort(() => Math.random() - 0.5)) {
      globalThis.gc();
      const s = performance.now();
      for (const d of docs) P[k](d);
      t[k].push(performance.now() - s);
    }
  const base = med(t['micromark html + gfm']);
  console.log(label);
  for (const k in t)
    console.log(
      '  ' +
        k.padEnd(30) +
        med(t[k]).toFixed(1).padStart(8) +
        ' ms  ' +
        (base / med(t[k])).toFixed(1) +
        'x faster than micromark html',
    );
}
