// Parse speed of micromark and its pipelines against markdown-it and marked on a real-world corpus.
// Run with: node --expose-gc scripts/bench.js
import { readFileSync, readdirSync } from 'node:fs';
import { bench, group, run, summary } from 'mitata';
import { micromark } from 'micromark';
import { gfm } from 'micromark-extension-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import MarkdownIt from 'markdown-it';
import { marked } from 'marked';

const readmeDir = new URL('../corpus/readmes/', import.meta.url);
const readmes = readdirSync(readmeDir).map((file) =>
  readFileSync(new URL(file, readmeDir), 'utf8'),
);
const large = (name) => readFileSync(new URL(`../corpus/large/${name}`, import.meta.url), 'utf8');
const kb = (docs) => `${Math.round(docs.reduce((n, d) => n + Buffer.byteLength(d), 0) / 1024)} KB`;

const inputs = {
  // 77 files, about 788 KB in total, median 5.6 KB: the typical docs-site page.
  [`readmes (${readmes.length} files, ${kb(readmes)})`]: readmes,
  [`node fs.md (${kb([large('node-fs.md')])})`]: [large('node-fs.md')],
  [`node CHANGELOG_V22 (${kb([large('node-changelog-v22.md')])})`]: [
    large('node-changelog-v22.md'),
  ],
};

const commonmarkIt = new MarkdownIt('commonmark');
// The default preset adds tables and strikethrough, the closest match to GFM.
const gfmIt = new MarkdownIt();
const gfmExtensions = [gfm()];
const gfmMdastExtensions = [gfmFromMarkdown()];

const pipelines = {
  'micromark html': (doc) => micromark(doc),
  'micromark html + gfm': (doc) => micromark(doc, { extensions: gfmExtensions }),
  'mdast (from-markdown)': (doc) => fromMarkdown(doc),
  'mdast + gfm (remark-parse + remark-gfm)': (doc) =>
    fromMarkdown(doc, { extensions: gfmExtensions, mdastExtensions: gfmMdastExtensions }),
  'markdown-it commonmark html': (doc) => commonmarkIt.render(doc),
  'markdown-it default html (tables, strikethrough)': (doc) => gfmIt.render(doc),
  'markdown-it tokens only': (doc) => gfmIt.parse(doc, {}),
  'marked html (gfm)': (doc) => marked.parse(doc, { async: false }),
};

for (const [inputName, docs] of Object.entries(inputs)) {
  group(inputName, () => {
    summary(() => {
      for (const [name, parse] of Object.entries(pipelines)) {
        bench(name, () => {
          for (const doc of docs) parse(doc);
        }).gc('inner');
      }
    });
  });
}

await run({ format: process.argv.includes('--json') ? 'json' : 'mitata' });
