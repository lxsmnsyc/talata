// Interleaved timing: each round runs every pipeline once in a shuffled order,
// so background load hits all pipelines equally. Reports the median per pipeline.
// Run with: node --expose-gc scripts/interleaved.js [rounds]
import { readFileSync, readdirSync } from 'node:fs';
import { micromark } from 'micromark';
import { gfm } from 'micromark-extension-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import MarkdownIt from 'markdown-it';
import { marked } from 'marked';

const rounds = Number(process.argv[2] ?? 15);
const readmeDir = new URL('../corpus/readmes/', import.meta.url);
const readmes = readdirSync(readmeDir).map((file) =>
  readFileSync(new URL(file, readmeDir), 'utf8'),
);
const large = (name) => readFileSync(new URL(`../corpus/large/${name}`, import.meta.url), 'utf8');
const kb = (docs) => `${Math.round(docs.reduce((n, d) => n + Buffer.byteLength(d), 0) / 1024)} KB`;

const inputs = {
  [`readmes (${readmes.length} files, ${kb(readmes)})`]: readmes,
  [`node fs.md (${kb([large('node-fs.md')])})`]: [large('node-fs.md')],
  [`node CHANGELOG_V22 (${kb([large('node-changelog-v22.md')])})`]: [
    large('node-changelog-v22.md'),
  ],
};

const gfmIt = new MarkdownIt();
const gfmExtensions = [gfm()];
const gfmMdastExtensions = [gfmFromMarkdown()];

const pipelines = {
  'micromark html': (doc) => micromark(doc),
  'micromark html + gfm': (doc) => micromark(doc, { extensions: gfmExtensions }),
  mdast: (doc) => fromMarkdown(doc),
  'mdast + gfm': (doc) =>
    fromMarkdown(doc, { extensions: gfmExtensions, mdastExtensions: gfmMdastExtensions }),
  'markdown-it html': (doc) => gfmIt.render(doc),
  'marked html': (doc) => marked.parse(doc, { async: false }),
};

function median(values) {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

for (const [inputName, docs] of Object.entries(inputs)) {
  const names = Object.keys(pipelines);
  const times = new Map();
  for (const name of names) times.set(name, []);
  // Warm up every pipeline before measuring.
  for (const name of names) for (const doc of docs) pipelines[name](doc);
  for (let round = 0; round < rounds; round++) {
    const order = names.toSorted(() => Math.random() - 0.5);
    for (const name of order) {
      globalThis.gc?.();
      const start = performance.now();
      for (const doc of docs) pipelines[name](doc);
      times.get(name).push(performance.now() - start);
    }
  }
  const baseline = median(times.get('markdown-it html'));
  console.log(`\n${inputName}`);
  for (const name of names) {
    const value = median(times.get(name));
    console.log(
      `  ${name.padEnd(22)} ${value.toFixed(1).padStart(8)} ms   ${(value / baseline).toFixed(2)}x markdown-it`,
    );
  }
}
