// Workload for the CPU profiler: the remark-parse + remark-gfm path over the README corpus.
import { readFileSync, readdirSync } from 'node:fs';
import { gfm } from 'micromark-extension-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';

const dir = new URL('../corpus/readmes/', import.meta.url);
const docs = readdirSync(dir).map((file) => readFileSync(new URL(file, dir), 'utf8'));
docs.push(readFileSync(new URL('../corpus/large/node-fs.md', import.meta.url), 'utf8'));
const options = { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] };
for (let i = 0; i < 20; i++) for (const doc of docs) fromMarkdown(doc, options);
