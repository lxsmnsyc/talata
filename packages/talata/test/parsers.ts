import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { Root } from 'mdast';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { fromMarkdown } from '../src';

// Talata's suites stay skipped until the matching part of the parser exists.
// The roadmap node that lands a feature turns its flag on.
export const ready = {
  // The block and inline parser: CommonMark spec examples, with and without gfm.
  commonmark: true,
  // Every file of the benchmark corpus, parsed with gfm.
  corpus: true,
  // One flag per GFM feature. Each gates the spec examples of that section.
  gfm: {
    table: false,
    strikethrough: false,
    autolinkLiteral: false,
    taskList: false,
    footnote: false,
  },
};

// True when every GFM feature is on. The corpus is compared with GFM then.
export function gfmReady(): boolean {
  const flags = ready.gfm;
  return (
    flags.table && flags.strikethrough && flags.autolinkLiteral && flags.taskList && flags.footnote
  );
}

export function parseReference(value: string, useGfm: boolean): Root {
  if (!useGfm) {
    return reference(value);
  }
  return reference(value, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

export function parseTalata(value: string, useGfm: boolean): Root {
  return fromMarkdown(value, { gfm: useGfm });
}

export function toHtmlString(tree: Root): string {
  return toHtml(toHast(tree, { allowDangerousHtml: true }), { allowDangerousHtml: true });
}

// The spec file writes tabs as "→".
export function specText(text: string): string {
  return text.replaceAll('→', '\t');
}

export function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}

export interface SpecExample {
  markdown: string;
  html: string;
  section: string;
  number: number;
}

function isSpecModule(value: unknown): value is { tests: SpecExample[] } {
  return (
    typeof value === 'object' && value != null && 'tests' in value && Array.isArray(value.tests)
  );
}

function loadSpecExamples(): SpecExample[] {
  const spec: unknown = createRequire(import.meta.url)('commonmark-spec');
  if (!isSpecModule(spec)) {
    throw new Error('commonmark-spec did not export a tests array');
  }
  return spec.tests;
}

export const specExamples: SpecExample[] = loadSpecExamples();

export type GfmFeature = keyof typeof ready.gfm;

export interface GfmExample {
  number: number;
  section: string;
  // The flag that gates the example. "tagfilter" examples differ only in HTML
  // output, so they run with the commonmark flag.
  feature: GfmFeature | 'tagfilter';
  markdown: string;
  html: string;
}

interface GfmFixture {
  source: string;
  examples: GfmExample[];
}

function isGfmFixture(value: unknown): value is GfmFixture {
  return (
    typeof value === 'object' &&
    value != null &&
    'examples' in value &&
    Array.isArray(value.examples)
  );
}

// Examples from the extension sections of the cmark-gfm spec. See
// fixtures/gfm-spec.json for the source URL and license.
function loadGfmExamples(): GfmExample[] {
  const text = readFileSync(new URL('./fixtures/gfm-spec.json', import.meta.url), 'utf8');
  const fixture: unknown = JSON.parse(text);
  if (!isGfmFixture(fixture)) {
    throw new Error('fixtures/gfm-spec.json has no examples array');
  }
  return fixture.examples;
}

export const gfmExamples: GfmExample[] = loadGfmExamples();

// Footnotes are not in the cmark-gfm spec, so these inputs are hand-written
// from the syntax GitHub documents.
export const footnoteInputs: string[] = [
  'Text[^1].\n\n[^1]: Note.\n',
  'Text[^a] and again[^a].\n\n[^a]: Note.\n',
  'Text[^missing].\n',
  '[^1]: Defined first.\n\nText[^1].\n',
  'Text[^1].\n\n[^1]: First paragraph.\n\n    Second paragraph.\n',
  'Text[^1].\n\n[^1]:\n    - item\n    - item\n',
  'Text[^big note].\n\n[^big note]: Note.\n',
  'Text[^1].\n\n[^1]: Note with `code` and *emphasis*.\n',
];

export interface CorpusFile {
  name: string;
  path: URL;
}

const corpusDir = new URL('../../../benchmark/corpus/', import.meta.url);

// The corpus is downloaded with `pnpm --filter benchmark corpus`. When it is
// missing this returns an empty list, and the corpus suites skip.
export function corpusFiles(): CorpusFile[] {
  const files: CorpusFile[] = [];
  for (const folder of ['readmes', 'large']) {
    const dir = new URL(`${folder}/`, corpusDir);
    if (!existsSync(dir)) {
      continue;
    }
    for (const name of readdirSync(dir).toSorted()) {
      if (name.endsWith('.md')) {
        files.push({ name: `${folder}/${name}`, path: new URL(name, dir) });
      }
    }
  }
  return files;
}
