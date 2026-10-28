// Rebuilds gfm-spec.json from the cmark-gfm spec file.
// Run with: node test/fixtures/extract-gfm-spec.mjs <path to spec.txt>
// Download: https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt
/* oxlint-disable no-console, typescript/no-unsafe-assignment */
import { readFileSync, writeFileSync } from 'node:fs';

const FENCE = '`'.repeat(32);
const SOURCE = 'https://github.com/github/cmark-gfm/blob/master/test/spec.txt';
const SECTIONS = {
  'Tables (extension)': 'table',
  'Task list items (extension)': 'taskList',
  'Strikethrough (extension)': 'strikethrough',
  'Autolinks (extension)': 'autolinkLiteral',
  'Disallowed Raw HTML (extension)': 'tagfilter',
};

const lines = readFileSync(process.argv[2], 'utf8').split('\n');
const examples = [];
let section = '';
let number = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith('#') && !line.startsWith('#!')) {
    section = line.replace(/^#+\s*/, '');
    continue;
  }
  if (!line.startsWith(`${FENCE} example`)) {
    continue;
  }
  number++;
  let markdown = '';
  i++;
  while (lines[i] !== '.') {
    markdown += `${lines[i]}\n`;
    i++;
  }
  let html = '';
  i++;
  while (!lines[i].startsWith(FENCE)) {
    html += `${lines[i]}\n`;
    i++;
  }
  const feature = SECTIONS[section];
  if (feature) {
    examples.push({ number, section, feature, markdown, html });
  }
}

const fixture = {
  source: SOURCE,
  version: '0.29-gfm',
  license: 'CC-BY-SA 4.0 (http://creativecommons.org/licenses/by-sa/4.0/)',
  note: 'Examples from the extension sections only. The spec writes tabs as "→".',
  examples,
};
writeFileSync(new URL('./gfm-spec.json', import.meta.url), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`wrote ${examples.length} examples`);
